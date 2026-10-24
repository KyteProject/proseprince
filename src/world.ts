import { type App, normalizePath, TFile } from "obsidian";
import { cssColour, nameGroupsIn, speakerIndex } from "./analysis/dialogue/cast";
import { looksLikeNameTitle } from "./analysis/names";
import { emptyWorld, findInWorld, parseWorld, properNounWords, type World, WORLD_TEMPLATE } from "./analysis/world";
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
	/** Alias (lowercased) → the speaker's shown name, for the Dialogue lens. */
	speakers = new Map<string, string>();
	/** Colours set by hand on character notes (`colour:`), by shown name. */
	speakerColours = new Map<string, string>();

	constructor(
		private readonly app: App,
		private readonly paths: () => { worldNote: string; characterFolder: string },
	) {}

	get worldNotePath(): string {
		return normalizePath(this.paths().worldNote || WORLD_NOTE_DEFAULT);
	}

	/** Rebuild from the vault. Returns true when anything changed. */
	async rebuild(): Promise<boolean> {
		const signature = () => [...this.properNouns, "\u0000", ...this.terms, "\u0000", ...this.speakers, "\u0000", ...this.speakerColours].join("\u0001");
		const before = signature();
		const file = this.app.vault.getAbstractFileByPath(this.worldNotePath);
		const worldText = file instanceof TFile ? await this.app.vault.cachedRead(file) : "";
		this.world = file instanceof TFile ? parseWorld(worldText) : emptyWorld();
		this.indexSpeakers(worldText);
		this.characterNames = this.fromCharacterNotes();
		this.properNouns = new Set([...properNounWords(this.world.names), ...properNounWords(this.world.places), ...this.characterNames]);
		this.terms = new Set([...this.world.terms].map((t) => t.toLowerCase()));
		return before !== signature();
	}

	/** Speaker groups for the Dialogue lens: World note names with their aliases, then character notes. */
	private indexSpeakers(worldText: string): void {
		const groups = nameGroupsIn(worldText);
		const colours = new Map<string, string>();
		for (const file of this.characterFiles()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
			const names = [...asList(fm.name), ...asList(fm.names)].map((n) => n.trim()).filter(Boolean);
			const aliases = [...asList(fm.aliases), ...asList(fm.alias)].map((n) => n.trim()).filter(Boolean);
			const group = [...names, ...(looksLikeNameTitle(file.basename) ? [file.basename] : []), ...aliases];
			if (!group.length) continue;
			// A name already in the World note keeps the World note's grouping; the note adds its aliases.
			const existing = groups.find((g) => g.some((n) => group.some((m) => m.toLowerCase() === n.toLowerCase())));
			if (existing) existing.push(...group.filter((n) => !existing.includes(n)));
			else groups.push(group);
			const colour = cssColour(fm.colour ?? fm.color);
			if (colour) colours.set((existing ?? group)[0]!, colour);
		}
		this.speakers = speakerIndex(groups);
		this.speakerColours = colours;
	}

	private characterFiles(): TFile[] {
		const folder = this.paths().characterFolder.trim();
		const prefix = folder ? normalizePath(folder) + "/" : null;
		return this.app.vault.getMarkdownFiles().filter((file) => (prefix && file.path.startsWith(prefix)) || this.isCharacterNote(file));
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

	/** Add an entry under a section of the World note. Returns false when it is already there (in any section). */
	async add(section: WorldSection, entry: string): Promise<boolean> {
		const file = await this.ensureNote();
		const heading = { names: "Names", places: "Places", terms: "Terms" }[section];
		let added = false;
		await this.app.vault.process(file, (text) => {
			if (findInWorld(text, entry)) return text;
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
			added = true;
			return lines.join("\n");
		});
		return added;
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
