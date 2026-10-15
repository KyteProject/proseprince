/**
 * Which capitalised words are names. A tagger sees one sentence at a time and reads any
 * capitalised sentence opener as a name (or, lowercased, as an ordinary word), so it cannot tell
 * "White stood up" (a character) from "White flashed across his vision" (a colour). Two sources fix that:
 *   - evidence in the note: a capitalised word mid-sentence ("she turned to White") is a name;
 *   - the writer's cast: character notes and a manual list (gathered by the plugin).
 * Known names are then tagged as proper nouns wherever they appear capitalised.
 */

const CAPITALISED = /\p{Lu}[\p{Ll}\p{M}]+(?:-\p{Lu}[\p{Ll}\p{M}]+)?/gu;
/** Capitalised mid-sentence for reasons other than being a name. */
const NOT_NAMES = new Set(["I", "OK", "Okay", "Mr", "Mrs", "Ms", "Dr", "St"]);

/** Capitalised words that appear mid-sentence somewhere in the text. */
export function namesInText(text: string): Set<string> {
	const names = new Set<string>();
	for (const m of text.matchAll(CAPITALISED)) {
		const before = text.slice(Math.max(0, m.index - 3), m.index);
		// Mid-sentence: a lowercase letter, digit, comma or semicolon, then whitespace, right before it.
		if (/[\p{Ll}\p{N},;]\s+$/u.test(before) && !NOT_NAMES.has(m[0])) names.add(m[0]);
	}
	return names;
}

/** Names from `candidates` that occur, capitalised and as whole words, in `text`. Sorted, for stable cache keys. */
export function namesIn(text: string, candidates: Iterable<string>): string[] {
	const out: string[] = [];
	for (const name of candidates) {
		const i = text.indexOf(name);
		if (i === -1) continue;
		const re = new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u");
		if (re.test(text)) out.push(name);
	}
	return out.sort();
}

/** A file name that looks like a person's name: one to three capitalised words, no digits. */
export function looksLikeNameTitle(title: string): boolean {
	return /^\p{Lu}[\p{L}'’-]*(?: \p{Lu}[\p{L}'’-]*){0,2}$/u.test(title.trim());
}
