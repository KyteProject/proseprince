/** Universal Dependencies part-of-speech tags produced by wink-nlp. */
export type UposTag =
	| "ADJ" | "ADP" | "ADV" | "AUX" | "CCONJ" | "DET" | "INTJ" | "NOUN" | "NUM"
	| "PART" | "PRON" | "PROPN" | "PUNCT" | "SCONJ" | "SYM" | "VERB" | "X" | "SPACE";

/** Part-of-speech categories the user can toggle. CONJ covers CCONJ and SCONJ. */
export type PosCategory = "ADJ" | "ADV" | "NOUN" | "PROPN" | "PRON" | "NUM" | "VERB" | "AUX" | "CONJ";

export const POS_CATEGORIES: readonly PosCategory[] = ["ADJ", "ADV", "NOUN", "PROPN", "PRON", "NUM", "VERB", "AUX", "CONJ"];

/** Craft checks layered on top of part-of-speech tagging. */
export type CheckKind =
	| "cliche" | "redundancy" | "filler" | "qualifier" | "weasel" | "hedge"
	| "filterWord" | "passive" | "weakVerb" | "nominalization" | "opener"
	| "adverb" | "tagAdverb" | "stackedModifier" | "participle"
	| "echo" | "metaphor"
	| "dialoguePunct";

export const CHECK_KINDS: readonly CheckKind[] = [
	"cliche", "redundancy", "filler", "qualifier", "weasel", "hedge",
	"filterWord", "passive", "weakVerb", "nominalization", "opener",
	"adverb", "tagAdverb", "stackedModifier", "participle",
	"echo", "metaphor",
	"dialoguePunct",
];

/** Kebab-case name used in CSS classes and in `%% not <name> %%` suppression comments. */
export const kindSlug = (kind: CheckKind) => kind.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export interface Token {
	/** Offsets into the paragraph text (UTF-16 code units). */
	from: number;
	to: number;
	text: string;
	normal: string;
	lemma: string;
	pos: UposTag;
	sentence: number;
	isWord: boolean;
	inDialogue: boolean;
	/** First word of its sentence. */
	startsSentence: boolean;
}

export interface Highlight {
	from: number;
	to: number;
	/** Either a part-of-speech category or a craft check. */
	kind: { pos: PosCategory } | { check: CheckKind };
	/** Short explanation shown on hover. */
	note?: string;
	/** Which "How to approach this" guide applies, when it depends on the shape found (see guides.ts). */
	guide?: string;
}

export interface SentenceInfo {
	from: number;
	to: number;
	words: number;
	/** Felt length: words + commas + a share of surplus syllables (see rhythm.ts). */
	effectiveLength: number;
}

export interface ParagraphStats {
	words: number;
	sentences: number;
	syllables: number;
	dialogueWords: number;
	sentenceWords: number[];
}

export interface ParagraphResult {
	highlights: Highlight[];
	sentences: SentenceInfo[];
	stats: ParagraphStats;
}

export interface AnalysisOptions {
	pos: Partial<Record<PosCategory, boolean>>;
	checks: Partial<Record<CheckKind, boolean>>;
	/** Content words between two uses of the same word that still count as an echo. */
	echoWindow: number;
}
