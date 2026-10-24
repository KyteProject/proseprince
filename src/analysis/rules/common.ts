import type { LookupHint, Token } from "../types";

/** Lowercase, straight-apostrophe form of a token. */
export const lower = (t: Token | undefined) => (t ? t.text.toLowerCase().replace(/[’ʼ‘]/g, "'") : "");

/** Same sentence as `t`. */
export const sameSentence = (a: Token | undefined, b: Token | undefined) => a !== undefined && b !== undefined && a.sentence === b.sentence;

/** Capitalised mid-sentence: a name, most of the time. */
export const looksLikeName = (t: Token) => !t.startsSentence && /^\p{Lu}/u.test(t.text);

/** The lowercased word before `words[i]` in its sentence, or "". */
export const prevWord = (words: Token[], i: number) => {
	const p = words[i - 1];
	return p && p.sentence === words[i]!.sentence ? lower(p) : "";
};

/** The head word of a lookup hint. */
export const headOf = (words: Token[], i: number): LookupHint["head"] => {
	const t = words[i]!;
	return { from: t.from, to: t.to, text: t.text, lemma: t.lemma, pos: t.pos, prev: prevWord(words, i) };
};

/**
 * A phrase lookup for a head word and its partner ("walked" + "slowly"). Next to each other, a
 * pick replaces both; apart ("walked across the room slowly"), the head is replaced and the partner removed.
 */
export function pairHint(words: Token[], headIndex: number, partnerIndex: number, query: string): LookupHint {
	const head = headOf(words, headIndex);
	const partner = words[partnerIndex]!;
	const [a, b] = headIndex < partnerIndex ? [words[headIndex]!, partner] : [partner, words[headIndex]!];
	const adjacent = Math.abs(headIndex - partnerIndex) === 1 && b.from - a.to <= 1;
	return adjacent
		? { mode: "phrase", query, head, replace: { from: a.from, to: b.to } }
		: { mode: "phrase", query, head, replace: { from: head.from, to: head.to }, remove: { from: partner.from, to: partner.to, text: partner.text } };
}

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
