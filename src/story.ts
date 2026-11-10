import { type App, TFile } from "obsidian";
import { buildRelations, type CanonNote, canonNote, EMPTY_RELATIONS, type Relations } from "./analysis/relations";
import { type Book, buildBook, EMPTY_BOOK, parseSceneName, proseOf, type SceneName, sceneRecord, type SceneRecord } from "./analysis/story";
import { inScope } from "./settingsModel";

/** Frontmatter `type:` values that mark a note as part of the manuscript, for vaults with no prose folders set. */
const MANUSCRIPT_TYPES = new Set(["draft", "scene", "chapter"]);

/**
 * The book for this vault: every chapter note and scene in the prose folders, and every other note
 * that says something about the story. Each file is read once and re-read only when it changes.
 * Read-only: nothing here writes to the vault.
 */
export class StoryIndex {
	book: Book = EMPTY_BOOK;
	relations: Relations = EMPTY_RELATIONS;
	private cache = new Map<string, { stamp: string; record: SceneRecord; prose: string }>();
	private canon = new Map<string, { stamp: string; note: CanonNote }>();
	private built = false;

	/**
	 * @param canonical the shown name for an alias, from the World note and character notes.
	 */
	constructor(
		private readonly app: App,
		private readonly folders: () => readonly string[],
		private readonly canonical: (name: string) => string = (name) => name,
	) {}

	/**
	 * Whether a note can say something about the story: any note that isn't part of the manuscript,
	 * outside the prose folders and outside folders set aside with a leading `_` or `.` (templates,
	 * archives, ProsePrince's own notes).
	 */
	isCanon(file: TFile): boolean {
		if (file.extension !== "md" || this.isRelevant(file)) return false;
		if (file.path.split("/").slice(0, -1).some((part) => part.startsWith("_") || part.startsWith("."))) return false;
		const prose = this.folders().map((f) => f.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
		return !prose.some((f) => file.path.startsWith(`${f}/`));
	}

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
		return this.cache.has(path) || this.canon.has(path);
	}

	/** A note about the story, when it has names or cited facts. */
	note(path: string): CanonNote | undefined {
		const note = this.canon.get(path)?.note;
		return note && this.relations.notes.includes(note) ? note : undefined;
	}

	record(path: string): SceneRecord | undefined {
		return this.cache.get(path)?.record;
	}

	/** The parsed names of every numbered note in a folder, for numbering a new scene. */
	namesIn(folder: string): SceneName[] {
		return this.app.vault.getMarkdownFiles().filter((f) => (f.parent?.path ?? "") === folder).map((f) => parseSceneName(f.basename)).filter((n): n is SceneName => n !== null);
	}

	/**
	 * Re-read what changed and rebuild the book. Returns true when anything is different.
	 * @param force rebuild even when no file changed: the names behind the cast have.
	 */
	async rebuild(force = false): Promise<boolean> {
		const before = this.signature();
		const files = this.app.vault.getMarkdownFiles();
		const seen = new Set<string>();
		const stampOf = (file: TFile) => {
			const frontmatter = (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
			// The frontmatter is part of the stamp: Obsidian parses it a moment after the file is saved.
			return { frontmatter, stamp: `${file.stat.mtime}:${file.stat.size}:${JSON.stringify(frontmatter)}` };
		};
		for (const file of files) {
			if (!this.isRelevant(file)) continue;
			seen.add(file.path);
			const { frontmatter, stamp } = stampOf(file);
			if (this.cache.get(file.path)?.stamp === stamp) continue;
			const text = await this.app.vault.cachedRead(file);
			const record = sceneRecord(file.path, file.basename, text, frontmatter);
			if (record) this.cache.set(file.path, { stamp, record, prose: record.kind === "scene" ? proseOf(text) : "" });
		}
		for (const path of [...this.cache.keys()]) if (!seen.has(path)) this.cache.delete(path);
		// The rest of the vault is only worth reading once there is a book for it to be about.
		if (this.cache.size) {
			for (const file of files) {
				if (!this.isCanon(file)) continue;
				seen.add(file.path);
				const { frontmatter, stamp } = stampOf(file);
				if (this.canon.get(file.path)?.stamp === stamp) continue;
				this.canon.set(file.path, { stamp, note: canonNote(file.path, file.basename, await this.app.vault.cachedRead(file), frontmatter) });
			}
		}
		for (const path of [...this.canon.keys()]) if (!seen.has(path)) this.canon.delete(path);
		if (this.built && !force && before === this.signature()) return false;
		this.built = true;
		this.book = buildBook([...this.cache.values()].map((c) => c.record));
		this.relations = buildRelations(this.book, [...this.canon.values()].map((c) => c.note), new Map([...this.cache].map(([path, c]) => [path, c.prose])), this.canonical);
		return true;
	}

	private signature(): string {
		const stamps = (cache: Map<string, { stamp: string }>) => [...cache].map(([path, c]) => `${path}\u0001${c.stamp}`).sort().join("\u0000");
		return `${stamps(this.cache)}\u0002${stamps(this.canon)}`;
	}
}
