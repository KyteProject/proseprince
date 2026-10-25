import type { DialogueLine } from "./dialogue/speech";

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
	| "dialoguePunct" | "nonSpeechTag" | "showyTag" | "invertedTag" | "twoSpeakers" | "untaggedRun" | "quotedThought";

export const CHECK_KINDS: readonly CheckKind[] = [
	"cliche", "redundancy", "filler", "qualifier", "weasel", "hedge",
	"filterWord", "passive", "weakVerb", "nominalization", "opener",
	"adverb", "tagAdverb", "stackedModifier", "participle",
	"echo", "metaphor",
	"dialoguePunct", "nonSpeechTag", "showyTag", "invertedTag", "twoSpeakers", "untaggedRun", "quotedThought",
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
	/** What an optional online lookup asks for, and how a picked word is applied. */
	lookup?: LookupHint;
	/** Adjectives on a noun, so an online lookup can show whether the pairing is a usual one ("dead silence"). */
	pairing?: Pairing;
}

export interface Pairing {
	/** The noun's lemma, lowercased. */
	noun: string;
	/** The writer's modifiers, lowercased as written. */
	modifiers: string[];
}

/** A span of the paragraph with the text it had when analysed, so a stale edit can be refused. */
export interface Span {
	from: number;
	to: number;
	text: string;
}

/**
 * Words to try for a finding (offsets into the paragraph). "walked slowly" asks for verbs meaning
 * "walk slowly"; picking "stroll" replaces both words with "strolled".
 */
export interface LookupHint {
	/** "phrase": words meaning `query` ("walk slowly", "very cold"); "word": synonyms of the head's lemma. */
	mode: "phrase" | "word";
	query: string;
	/** The word whose tense, number and capitals a suggestion takes. */
	head: Span & { lemma: string; pos: UposTag; prev: string };
	/** What a suggestion replaces: the head, or the head and its partner when they sit together. */
	replace: { from: number; to: number };
	/** A partner word deleted along with the pick (the adverb) when it isn't inside `replace`. */
	remove?: Span;
	/** Also offer more specific kinds of the head verb ("walk" → trudge, plod, stride), for manner adverbs. */
	kinds?: boolean;
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
	/** Narration only (dialogue is a character's voice): words, adjectives, -ly adverbs. */
	narrationWords: number;
	adjectives: number;
	lyAdverbs: number;
	/** Narration nouns with a concreteness rating, and how many of them are concrete (rated 3.5 or more of 5). */
	ratedNouns: number;
	concreteNouns: number;
}

/** Concreteness at or above which a noun counts as concrete (Brysbaert et al.'s 1–5 scale). */
export const CONCRETE_NOUN = 3.5;

export interface ParagraphResult {
	highlights: Highlight[];
	/** Speech, thought and speaker evidence, line by line, for the Dialogue lens. */
	dialogue: DialogueLine[];
	sentences: SentenceInfo[];
	stats: ParagraphStats;
}

export interface AnalysisOptions {
	pos: Partial<Record<PosCategory, boolean>>;
	checks: Partial<Record<CheckKind, boolean>>;
	/** Content words between two uses of the same word that still count as an echo. */
	echoWindow: number;
}
