import { type App, TFile } from "obsidian";
import type { SceneSpeech } from "./analysis/dialogue/scene";
import { bagOf, EMPTY_NEEDS, hashOf, type Needs, needsALook, track, type Tracked } from "./analysis/needs";
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
	needs: Needs = EMPTY_NEEDS;
	/** The note that holds the shape of the book, when one is set or one is named for it. */
	shape: { path: string; title: string } | null = null;
	private cache = new Map<string, { stamp: string; record: SceneRecord; prose: string; print: string; modified: number; speech?: SceneSpeech; heardWith?: string }>();
	private canon = new Map<string, { stamp: string; note: CanonNote; print: string; modified: number }>();
	/** What is remembered about each note between sessions: prints and dates, never prose. */
	private tracked = new Map<string, Tracked>();
	/** When each file was last saved, as of the last look this session. */
	private lastSaved = new Map<string, number>();
	private built = false;
	/** The rebuild under way, so the next one starts from where it ends. */
	private running: Promise<unknown> = Promise.resolve();

	/**
	 * @param canonical the shown name for an alias, from the World note and character notes.
	 */
	constructor(
		private readonly app: App,
		private readonly folders: () => readonly string[],
		private readonly canonical: (name: string) => string = (name) => name,
		/** The shape note as set: a path or a note's name. Empty to look for a note called "Shape of the book". */
		private readonly shapeNote: () => string = () => "",
		/** Called when what is remembered has changed, so it can be saved. */
		private readonly onTracked: () => void = () => {},
		/**
		 * Who speaks in a scene, read from its text. `key` is everything outside the text that the answer
		 * rests on (the known names), so a scene is read again when that changes.
		 */
		private readonly speech: { key(): string; of(text: string): Promise<SceneSpeech | null> } | null = null,
	) {}

	/** What is remembered, as it was saved. Anything unreadable is dropped: it is rebuilt from the notes' own dates. */
	restore(json: string | null): void {
		try {
			const files = (JSON.parse(json ?? "{}") as { files?: Record<string, Tracked> }).files ?? {};
			this.tracked = new Map(Object.entries(files).filter(([, t]) => typeof t?.print === "string" && typeof t.changed === "string"));
		} catch {
			this.tracked = new Map();
		}
	}

	serialize(): string {
		return JSON.stringify({ version: 1, files: Object.fromEntries(this.tracked) });
	}

	/** Carry what is remembered about a note over to its new name. */
	renamed(from: string, to: string): void {
		const kept = this.tracked.get(from);
		if (!kept) return;
		this.tracked.delete(from);
		this.tracked.set(to, kept);
		this.onTracked();
	}

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
	rebuild(force = false): Promise<boolean> {
		// One at a time: reading who speaks takes a moment, and a second pass must not answer from a half-built book.
		const run = this.running.then(() => this.build(force));
		this.running = run.catch(() => undefined);
		return run;
	}

	private async build(force: boolean): Promise<boolean> {
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
			if (!record) continue;
			const prose = record.kind === "scene" ? proseOf(text) : "";
			// A scene is remembered by its prose; a chapter note by its card.
			this.cache.set(file.path, { stamp, record, prose, print: record.kind === "scene" ? bagOf(prose) : hashOf(JSON.stringify(record.outline?.card ?? [])), modified: file.stat.mtime });
		}
		for (const path of [...this.cache.keys()]) if (!seen.has(path)) this.cache.delete(path);
		// The rest of the vault is only worth reading once there is a book for it to be about.
		if (this.cache.size) {
			for (const file of files) {
				if (!this.isCanon(file)) continue;
				seen.add(file.path);
				const { frontmatter, stamp } = stampOf(file);
				if (this.canon.get(file.path)?.stamp === stamp) continue;
				const text = await this.app.vault.cachedRead(file);
				const note = canonNote(file.path, file.basename, text, frontmatter);
				// What a note says is its body: a new alias or tag is not a change to it.
				this.canon.set(file.path, { stamp, note, print: hashOf(text.replace(/^---\r?\n[\s\S]*?\n---\r?\n?/, "")), modified: file.stat.mtime });
			}
		}
		for (const path of [...this.canon.keys()]) if (!seen.has(path)) this.canon.delete(path);
		if (this.built && !force && before === this.signature()) return false;
		await this.listen(files);
		this.built = true;
		this.book = buildBook([...this.cache.values()].map((c) => c.record));
		this.relations = buildRelations(this.book, [...this.canon.values()].map((c) => c.note), new Map([...this.cache].map(([path, c]) => [path, c.prose])), this.canonical, new Map([...this.cache].flatMap(([path, c]) => (c.speech ? [[path, c.speech] as const] : []))));
		this.shape = this.findShape();
		this.remember();
		this.needs = needsALook({
			book: this.book,
			relations: this.relations,
			tracked: this.tracked,
			prints: new Map([...this.cache].map(([path, c]) => [path, c.print])),
			modified: new Map([...this.cache, ...this.canon].map(([path, c]) => [path, c.modified])),
			shape: this.shape,
		});
		return true;
	}

	/** Read who speaks in each scene that changed, or all of them when the known names have. A scene that can't be read is left without. */
	private async listen(files: readonly TFile[]): Promise<void> {
		if (!this.speech) return;
		const key = this.speech.key();
		for (const file of files) {
			const c = this.cache.get(file.path);
			if (!c || c.record.kind !== "scene" || c.heardWith === key) continue;
			c.heardWith = key;
			try {
				c.speech = c.record.words ? ((await this.speech.of(await this.app.vault.cachedRead(file))) ?? undefined) : undefined;
			} catch (error) {
				// Not tried again until the scene or the names change: one scene that can't be read must not hold up the rest.
				console.error(`ProsePrince: could not read who speaks in ${file.path}`, error);
				c.speech = undefined;
			}
		}
	}

	/** The shape note: the one set, by path or by name; failing that, a note called "Shape of the book". */
	private findShape(): { path: string; title: string } | null {
		const set = this.shapeNote().trim().replace(/^\/+/, "").replace(/\.md$/i, "").toLowerCase();
		for (const { note } of this.canon.values()) {
			const path = note.path.replace(/\.md$/i, "").toLowerCase();
			if (set ? path === set || note.basename.toLowerCase() === set : /^(?:the\s+)?shape of the book$/i.test(note.title.trim())) return { path: note.path, title: note.title };
		}
		return null;
	}

	/** Bring what is remembered up to date: every chapter note and scene, the notes the story leans on, and the shape note. */
	private remember(): void {
		const before = this.serialize();
		for (const [path, c] of this.cache) {
			const scene = c.record.kind === "scene";
			const touched = this.lastSaved.has(path) && this.lastSaved.get(path) !== c.modified;
			this.lastSaved.set(path, c.modified);
			this.tracked.set(path, track(this.tracked.get(path), { print: c.print, modified: c.modified, bag: scene, touched, ...(scene ? { flags: c.record.flags, words: c.record.words } : {}) }));
		}
		for (const path of [...this.relations.notes.map((n) => n.path), ...(this.shape ? [this.shape.path] : [])]) {
			const c = this.canon.get(path);
			if (c) this.tracked.set(path, track(this.tracked.get(path), { print: c.print, modified: c.modified }));
		}
		// Only a note that is gone is forgotten: one that drops out of the book for a moment is not.
		for (const path of [...this.tracked.keys()]) if (!this.app.vault.getAbstractFileByPath(path)) this.tracked.delete(path);
		if (before !== this.serialize()) this.onTracked();
	}

	private signature(): string {
		const stamps = (cache: Map<string, { stamp: string }>) => [...cache].map(([path, c]) => `${path}\u0001${c.stamp}`).sort().join("\u0000");
		return `${stamps(this.cache)}\u0002${stamps(this.canon)}\u0002${this.shapeNote()}`;
	}
}
