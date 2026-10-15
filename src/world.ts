import { type App, normalizePath, TFile } from "obsidian";
import { looksLikeNameTitle } from "./analysis/names";
import { emptyWorld, parseWorld, properNounWords, type World, WORLD_TEMPLATE } from "./analysis/world";
import { WORLD_NOTE_DEFAULT } from "./settingsModel";

export type WorldSection = keyof World;

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",") : []);

/**
 * The story world for this vault: the World note plus character notes (`type: character`, a
 * `character` tag, or the configured folder) with their `aliases`, `name` or `names`.
 */
export class WorldIndex {
	world: World = emptyWorld();
	/** Words from character notes, kept separately so the counts in settings are honest. */
	characterNames = new Set<string>();
	properNouns: ReadonlySet<string> = new Set();
	terms: ReadonlySet<string> = new Set();

	constructor(
		private readonly app: App,
		private readonly paths: () => { worldNote: string; characterFolder: string },
	) {}

	get worldNotePath(): string {
		return normalizePath(this.paths().worldNote || WORLD_NOTE_DEFAULT);
	}

	/** Rebuild from the vault. Returns true when anything changed. */
	async rebuild(): Promise<boolean> {
		const before = [...this.properNouns, "\u0000", ...this.terms].join("\u0001");
		const file = this.app.vault.getAbstractFileByPath(this.worldNotePath);
		this.world = file instanceof TFile ? parseWorld(await this.app.vault.cachedRead(file)) : emptyWorld();
		this.characterNames = this.fromCharacterNotes();
		this.properNouns = new Set([...properNounWords(this.world.names), ...properNounWords(this.world.places), ...this.characterNames]);
		this.terms = new Set([...this.world.terms].map((t) => t.toLowerCase()));
		return before !== [...this.properNouns, "\u0000", ...this.terms].join("\u0001");
	}

	/** Whether a changed file can affect the world. */
	isRelevant(file: TFile): boolean {
		if (file.path === this.worldNotePath) return true;
		const folder = this.paths().characterFolder.trim();
		if (folder && file.path.startsWith(normalizePath(folder) + "/")) return true;
		return this.isCharacterNote(file);
	}

	private isCharacterNote(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter ?? {};
		const types = asList(fm.type).map((t) => t.trim().toLowerCase());
		const tags = [...asList(fm.tags), ...(cache?.tags ?? []).map((t) => t.tag)].map((t) => t.replace(/^#/, "").trim().toLowerCase());
		return types.includes("character") || tags.includes("character");
	}

	private fromCharacterNotes(): Set<string> {
		const folder = this.paths().characterFolder.trim();
		const prefix = folder ? normalizePath(folder) + "/" : null;
		const entries: string[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!(prefix && file.path.startsWith(prefix)) && !this.isCharacterNote(file)) continue;
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
			entries.push(...asList(fm.aliases), ...asList(fm.alias), ...asList(fm.name), ...asList(fm.names));
			// Idea-style titles ("The Mother is called Eufemie") are not names; "Eufemie Kanda" is.
			if (looksLikeNameTitle(file.basename)) entries.push(file.basename);
		}
		return properNounWords(entries.map((e) => e.trim()));
	}

	/** Open the World note, creating it from the template if needed. */
	async open(): Promise<void> {
		const file = await this.ensureNote();
		await this.app.workspace.getLeaf(true).openFile(file);
	}

	/** Add an entry under a section of the World note. */
	async add(section: WorldSection, entry: string): Promise<void> {
		const file = await this.ensureNote();
		const heading = { names: "Names", places: "Places", terms: "Terms" }[section];
		await this.app.vault.process(file, (text) => {
			const lines = text.split("\n");
			let at = lines.findIndex((l) => new RegExp(`^#{1,6}\\s+${heading}\\s*$`, "i").test(l));
			if (at === -1) {
				lines.push("", `## ${heading}`);
				at = lines.length - 1;
			}
			// Insert after the last entry of the section (before the next heading).
			let end = at + 1;
			while (end < lines.length && !/^#{1,6}\s/.test(lines[end]!)) end++;
			let insertAt = end;
			while (insertAt > at + 1 && lines[insertAt - 1]!.trim() === "") insertAt--;
			lines.splice(insertAt, 0, `- ${entry}`);
			return lines.join("\n");
		});
	}

	private async ensureNote(): Promise<TFile> {
		const path = this.worldNotePath;
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;
		const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
		if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		return this.app.vault.create(path, WORLD_TEMPLATE);
	}
}
