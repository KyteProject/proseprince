import type { ParagraphStats } from "./types";

/**
 * Readability from paragraph totals: Flesch reading ease, Flesch–Kincaid grade, sentence-length
 * variety and dialogue share. Bands follow Creative Writer's fiction-oriented framing (MIT); the
 * syllable count is heuristic, so show the band rather than decimals.
 */
export interface Band {
	label: string;
	hint: string;
}

export interface ReadabilityReport {
	words: number;
	sentences: number;
	readingEase: { score: number; band: Band } | null;
	grade: number | null;
	variety: { cv: number; band: Band } | null;
	dialogueShare: { ratio: number; band: Band } | null;
}

export function combine(stats: ParagraphStats[]): ParagraphStats {
	const out: ParagraphStats = { words: 0, sentences: 0, syllables: 0, dialogueWords: 0, sentenceWords: [], narrationWords: 0, adjectives: 0, lyAdverbs: 0, ratedNouns: 0, concreteNouns: 0 };
	for (const s of stats) {
		out.words += s.words;
		out.sentences += s.sentences;
		out.syllables += s.syllables;
		out.dialogueWords += s.dialogueWords;
		out.sentenceWords.push(...s.sentenceWords);
		out.narrationWords += s.narrationWords ?? 0;
		out.adjectives += s.adjectives ?? 0;
		out.lyAdverbs += s.lyAdverbs ?? 0;
		out.ratedNouns += s.ratedNouns ?? 0;
		out.concreteNouns += s.concreteNouns ?? 0;
	}
	return out;
}

export function report(s: ParagraphStats): ReadabilityReport {
	const ok = s.words > 0 && s.sentences > 0;
	const ease = ok ? 206.835 - 1.015 * (s.words / s.sentences) - 84.6 * (s.syllables / s.words) : null;
	const grade = ok ? 0.39 * (s.words / s.sentences) + 11.8 * (s.syllables / s.words) - 15.59 : null;
	return {
		words: s.words,
		sentences: s.sentences,
		readingEase: ease === null ? null : { score: ease, band: easeBand(ease) },
		grade,
		variety: variety(s.sentenceWords),
		dialogueShare: s.words > 0 ? { ratio: s.dialogueWords / s.words, band: dialogueBand(s.dialogueWords / s.words) } : null,
	};
}

export function easeBand(score: number): Band {
	if (score >= 90) return { label: "Very easy", hint: "Reads like a children's book. Fine for pace; check it isn't thin." };
	if (score >= 80) return { label: "Easy", hint: "Conversational. Most commercial fiction sits here." };
	if (score >= 70) return { label: "Fairly easy", hint: "Clear and quick. A comfortable default for narrative." };
	if (score >= 60) return { label: "Plain", hint: "Plain English. Literary fiction often lands here." };
	if (score >= 50) return { label: "Fairly dense", hint: "Longer sentences or heavier words. Deliberate? Keep it." };
	if (score >= 30) return { label: "Dense", hint: "Demanding. Readers will slow down; make sure that's the point." };
	return { label: "Very dense", hint: "Hard to follow. Split sentences or swap long words for short ones." };
}

/** Coefficient of variation of sentence lengths: monotone rhythm is the classic flat-prose symptom. */
export function variety(sentenceWords: number[]): { cv: number; band: Band } | null {
	const counts = sentenceWords.filter((n) => n > 0);
	if (counts.length < 3) return null;
	const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
	const sd = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length);
	const cv = sd / mean;
	const band =
		cv < 0.3 ? { label: "Monotone", hint: "Sentences are all about the same length. Break one short, let one run." }
		: cv < 0.55 ? { label: "Steady", hint: "Even rhythm. Good for calm passages; tension usually wants more contrast." }
		: cv < 0.8 ? { label: "Varied", hint: "A healthy mix of short and long." }
		: { label: "Dynamic", hint: "Big swings between short and long. Powerful in action; check it isn't choppy." };
	return { cv, band };
}

export function dialogueBand(ratio: number): Band {
	if (ratio < 0.15) return { label: "Narration-led", hint: "Little dialogue. Fine for interiority or description; scenes may feel told." };
	if (ratio < 0.45) return { label: "Balanced", hint: "Dialogue and narration share the page." };
	return { label: "Dialogue-led", hint: "Mostly talk. Fast to read; make sure the setting and bodies don't vanish." };
}

/** Sentences longer than this many words count as long. */
export const LONG_SENTENCE = 25;

/**
 * Plain style figures for the sidebar: how long sentences run, and in narration how many words are
 * adjectives or -ly adverbs and how many nouns are concrete. Descriptive, for comparing your own
 * drafts and beats; not a score.
 */
export interface StyleFigures {
	wordsPerSentence: number | null;
	medianSentence: number | null;
	/** Share of sentences over LONG_SENTENCE words. */
	longSentences: number | null;
	/** Shares of narration words. */
	adjectives: number | null;
	lyAdverbs: number | null;
	/** Share of rated narration nouns that are concrete. */
	concreteNouns: number | null;
}

export function styleOf(s: ParagraphStats): StyleFigures {
	const lengths = [...s.sentenceWords].sort((a, b) => a - b);
	const n = lengths.length;
	const median = n ? (n % 2 ? lengths[(n - 1) / 2]! : (lengths[n / 2 - 1]! + lengths[n / 2]!) / 2) : null;
	const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);
	return {
		wordsPerSentence: share(s.words, s.sentences),
		medianSentence: median,
		longSentences: share(lengths.filter((l) => l > LONG_SENTENCE).length, n),
		adjectives: share(s.adjectives ?? 0, s.narrationWords ?? 0),
		lyAdverbs: share(s.lyAdverbs ?? 0, s.narrationWords ?? 0),
		concreteNouns: (s.ratedNouns ?? 0) >= 5 ? share(s.concreteNouns ?? 0, s.ratedNouns ?? 0) : null,
	};
}
