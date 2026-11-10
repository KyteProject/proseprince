import { type App, TFile } from "obsidian";
import { type Book, buildBook, EMPTY_BOOK, parseSceneName, type SceneName, sceneRecord, type SceneRecord } from "./analysis/story";
import { inScope } from "./settingsModel";

/** Frontmatter `type:` values that mark a note as part of the manuscript, for vaults with no prose folders set. */
const MANUSCRIPT_TYPES = new Set(["draft", "scene", "chapter"]);

/**
 * The book for this vault: every chapter note and scene in the prose folders, read once and re-read
 * only when a file changes. Read-only: nothing here writes to the vault.
 */
export class StoryIndex {
	book: Book = EMPTY_BOOK;
	private cache = new Map<string, { stamp: string; record: SceneRecord }>();
	private built = false;

	constructor(
		private readonly app: App,
		private readonly folders: () => readonly string[],
	) {}

	/**
	 * Whether a note is a chapter note or a scene: named `chapter.scene`, and inside the prose folders
	 * (or carrying `proseprince: true`). With no prose folders set, the name alone is too loose (a
	 * numbered reference note would match), so the note must also say `type: draft` or `type: chapter`.
	 */
	isRelevant(file: TFile): boolean {
		if (file.extension !== "md" || !parseSceneName(file.basename)) return false;
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const flag = typeof fm.proseprince === "boolean" ? fm.proseprince : undefined;
		if (!inScope(file.path, this.folders(), flag)) return false;
		const scoped = flag === true || this.folders().some((f) => f.trim() !== "");
		return scoped || MANUSCRIPT_TYPES.has(String(fm.type ?? "").trim().toLowerCase());
	}

	/** Whether a path is (or was, before a rename or delete) part of the book. */
	knows(path: string): boolean {
		return this.cache.has(path);
	}

	record(path: string): SceneRecord | undefined {
		return this.cache.get(path)?.record;
	}

	/** The parsed names of every numbered note in a folder, for numbering a new scene. */
	namesIn(folder: string): SceneName[] {
		return this.app.vault.getMarkdownFiles().filter((f) => (f.parent?.path ?? "") === folder).map((f) => parseSceneName(f.basename)).filter((n): n is SceneName => n !== null);
	}

	/** Re-read what changed and rebuild the book. Returns true when anything is different. */
	async rebuild(): Promise<boolean> {
		const before = this.signature();
		const seen = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!this.isRelevant(file)) continue;
			seen.add(file.path);
			const frontmatter = (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
			// The frontmatter is part of the stamp: Obsidian parses it a moment after the file is saved.
			const stamp = `${file.stat.mtime}:${file.stat.size}:${JSON.stringify(frontmatter)}`;
			if (this.cache.get(file.path)?.stamp === stamp) continue;
			const record = sceneRecord(file.path, file.basename, await this.app.vault.cachedRead(file), frontmatter);
			if (record) this.cache.set(file.path, { stamp, record });
		}
		for (const path of [...this.cache.keys()]) if (!seen.has(path)) this.cache.delete(path);
		if (this.built && before === this.signature()) return false;
		this.built = true;
		this.book = buildBook([...this.cache.values()].map((c) => c.record));
		return true;
	}

	private signature(): string {
		return [...this.cache].map(([path, c]) => `${path}\u0001${c.stamp}`).sort().join("\u0000");
	}
}
