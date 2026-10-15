/**
 * The story's world, from a note in the vault (one vault per story, so the world travels with it):
 *
 *   ## Names        → proper nouns: never mis-tagged at a sentence start, never counted as echoes
 *   ## Places       → the same
 *   ## Terms        → invented vocabulary: never counted as echoes or metaphor partners
 *
 * One entry per line or list item. Aliases after "|" or ",": `- Eufemie | Effie`. Anything after
 * a colon or a dash is a note for the writer. [[Links]] are unwrapped.
 */
export interface World {
	names: Set<string>;
	places: Set<string>;
	terms: Set<string>;
}

export const emptyWorld = (): World => ({ names: new Set(), places: new Set(), terms: new Set() });

const SECTION: Record<string, keyof World> = {
	names: "names", characters: "names", people: "names", cast: "names",
	places: "places", locations: "places", settings: "places",
	terms: "terms", glossary: "terms", words: "terms", vocabulary: "terms", lexicon: "terms",
};

export const WORLD_TEMPLATE = `# World

ProsePrince reads this note for the words that belong to your story.

- **Names** and **Places** are treated as proper nouns, so "White stood up" is a character, not a colour, and they never count as repetition.
- **Terms** are your invented vocabulary; they never count as repetition or metaphor.

One entry per line. Add aliases after a "|": \`- Eufemie | Effie\`. Anything after a colon is a note for you.

## Names

## Places

## Terms
`;

/** Parse a world note. Unknown headings are ignored; entries before any heading are names. */
export function parseWorld(markdown: string): World {
	const world = emptyWorld();
	let section: keyof World | null = "names";
	let seenHeading = false;
	let inFrontmatter = markdown.startsWith("---");
	for (const [i, raw] of markdown.split("\n").entries()) {
		if (inFrontmatter) {
			if (i > 0 && raw.trim() === "---") inFrontmatter = false;
			continue;
		}
		const heading = /^#{1,6}\s+(.+?)\s*#*$/.exec(raw);
		if (heading) {
			const key = heading[1]!.toLowerCase().replace(/[^a-z]/g, "");
			section = SECTION[key] ?? null;
			seenHeading = true;
			continue;
		}
		// Entries are list items, or plain lines once a section heading has been seen.
		const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(raw);
		const line = item ? item[1]! : seenHeading ? raw : "";
		if (!section || line.trim() === "" || line.trim().startsWith(">")) continue;
		const entry = line.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target)
			.replace(/[*_`]/g, "")
			.split(/:\s| [—–-] /)[0]!;
		for (const part of entry.split(/[|,]/)) {
			const value = part.replace(/\(.*?\)/g, "").trim();
			if (value) world[section].add(value);
		}
	}
	return world;
}

/** Single capitalised words to tag as proper nouns ("Effie Kanda" → "Effie", "Kanda"). */
export function properNounWords(entries: Iterable<string>): Set<string> {
	const out = new Set<string>();
	for (const e of entries) for (const w of e.split(/\s+/)) if (/^\p{Lu}[\p{L}\p{M}'’-]*$/u.test(w) && !/^(The|A|An|Of)$/.test(w)) out.add(w.replace(/['’]s$/, ""));
	return out;
}
