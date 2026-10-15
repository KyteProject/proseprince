import type { Token } from "../types";

/** Lowercase, straight-apostrophe form of a token. */
export const lower = (t: Token | undefined) => (t ? t.text.toLowerCase().replace(/[’ʼ‘]/g, "'") : "");

/** Same sentence as `t`. */
export const sameSentence = (a: Token | undefined, b: Token | undefined) => a !== undefined && b !== undefined && a.sentence === b.sentence;

/** Capitalised mid-sentence: a name, most of the time. */
export const looksLikeName = (t: Token) => !t.startsSentence && /^\p{Lu}/u.test(t.text);

/** Word tokens grouped by sentence index. */
export function bySentence(words: Token[]): Token[][] {
	const groups = new Map<number, Token[]>();
	for (const w of words) {
		const g = groups.get(w.sentence);
		if (g) g.push(w);
		else groups.set(w.sentence, [w]);
	}
	return [...groups.values()];
}
