import type { ParagraphStats, SentenceInfo, Token } from "./types";

/** Contraction pieces wink splits off ("was" + "n't"); not words of their own. */
const CLITIC = /^(n't|'s|'re|'m|'ll|'d|'ve|’s|’re|’m|’ll|’d|’ve|n’t)$/i;

/**
 * Heuristic English syllable count: vowel groups, minus a silent final "e" (but not "-le"),
 * minus a final "-ue", minimum one. Good enough for reading-ease bands, not for a metrics display.
 */
export function syllables(word: string): number {
	const w = word.toLowerCase().replace(/[^a-z]/g, "");
	if (w.length === 0) return 0;
	let count = w.match(/[aeiouy]+/g)?.length ?? 0;
	if (/[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w)) count--;
	if (/[^aeiouy]ue$/.test(w)) count--;
	if (/[^aeiouy]ed$/.test(w) && !/[td]ed$/.test(w) && count > 1) count--; // "walked", not "wanted"
	return Math.max(1, count);
}

/**
 * Felt length of a sentence, after Creative Writer's rhythm classifier (MIT): every word is a
 * beat, every comma a clause boundary that reads as extra weight, and words beyond ~1.5
 * syllables on average add half a beat each.
 */
export function effectiveLength(words: number, commas: number, syllableCount: number): number {
	return words + commas + Math.max(0, syllableCount - words * 1.5) * 0.5;
}

/** Tier boundaries in effective-length units, per tier count (absolute, so a colour always means the same). */
export const RHYTHM_BOUNDARIES: Record<number, readonly number[]> = {
	4: [6, 14, 26],
	5: [5, 11, 19, 30],
	6: [4, 9, 15, 23, 34],
};

export function rhythmTier(effective: number, tierCount: number): number {
	let tier = 1;
	for (const b of RHYTHM_BOUNDARIES[tierCount] ?? RHYTHM_BOUNDARIES[5]!) {
		if (effective >= b) tier++;
		else break;
	}
	return tier;
}

const isCountedWord = (t: Token) => t.isWord && !CLITIC.test(t.text) && /[\p{L}\p{N}]/u.test(t.text);

/** Per-sentence rhythm data and paragraph totals for readability. */
export function measure(tokens: Token[]): { sentences: SentenceInfo[]; stats: ParagraphStats } {
	const groups = new Map<number, Token[]>();
	for (const t of tokens) {
		if (t.pos === "SPACE") continue;
		const g = groups.get(t.sentence);
		if (g) g.push(t);
		else groups.set(t.sentence, [t]);
	}
	const sentences: SentenceInfo[] = [];
	const stats: ParagraphStats = { words: 0, sentences: 0, syllables: 0, dialogueWords: 0, sentenceWords: [] };
	for (const group of groups.values()) {
		const words = group.filter(isCountedWord);
		if (words.length === 0) continue;
		const syl = words.reduce((n, w) => n + syllables(w.text), 0);
		const commas = group.filter((t) => t.text === ",").length;
		sentences.push({ from: group[0]!.from, to: group[group.length - 1]!.to, words: words.length, effectiveLength: effectiveLength(words.length, commas, syl) });
		stats.words += words.length;
		stats.sentences++;
		stats.syllables += syl;
		stats.dialogueWords += words.filter((w) => w.inDialogue).length;
		stats.sentenceWords.push(words.length);
	}
	return { sentences, stats };
}
