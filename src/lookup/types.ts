export type { WordInfo } from "../analysis/wordInfo";

/** Word classes Datamuse reports. Everything else (determiners, pronouns…) has no thesaurus entry. */
export type WordPos = "n" | "v" | "adj" | "adv";

export interface Sense {
	pos: WordPos | null;
	text: string;
}

/** One word from a Datamuse response, with the metadata ProsePrince asks for (`md=dpf`). */
export interface Candidate {
	word: string;
	pos: WordPos[];
	/** Occurrences per million words (Google Books n-grams), when Datamuse knows it. */
	freq: number | null;
	/** Datamuse's relevance score; answers come in tiers 100,000 apart (strong matches, then backfill). */
	score?: number;
	defs: Sense[];
}


/** Query parameters for one Datamuse request, without `md`, `max` or the key. */
export type DatamuseParams = Record<string, string>;
