import { looksInflected } from "./inflect";
import type { Candidate, Sense, WordPos } from "./types";

/** Below this many uses per million words, a suggestion is labelled rare (perambulate 0.017; traipse 0.034, amble 0.14). */
export const RARE_PER_MILLION = 0.02;

export interface Suggestion {
	word: string;
	pos: WordPos[];
	freq: number | null;
	/** First definition in the wanted part of speech, if any. */
	def: string | null;
	rare: boolean;
}

export interface RankOptions {
	/** Keep only words that can be this part of speech. `null` keeps everything. */
	pos: WordPos | null;
	/** Words not to suggest (the original, its lemma, words already shown elsewhere). */
	exclude: Iterable<string>;
	hideRare: boolean;
	limit: number;
}

/** wink's Universal Dependencies tag → the Datamuse word class. Names and function words have none. */
export function uposToWordPos(upos: string): WordPos | null {
	switch (upos) {
		case "VERB":
		case "AUX":
			return "v";
		case "NOUN":
			return "n";
		case "ADJ":
			return "adj";
		case "ADV":
			return "adv";
		default:
			return null;
	}
}

export const POS_NAMES: Record<WordPos, string> = { n: "noun", v: "verb", adj: "adjective", adv: "adverb" };

/** Plain lowercase words, or two-word verbs ("walk off"). Drops "base on balls", "Arctic", "3D". */
function usable(word: string, pos: WordPos | null): boolean {
	if (!/^[a-z][a-z'-]*( [a-z][a-z'-]*)?$/.test(word)) return false;
	return !word.includes(" ") || pos === "v";
}

/** Definitions in the wanted part of speech first. */
export function sensesFor(defs: readonly Sense[], pos: WordPos | null): Sense[] {
	if (!pos) return [...defs];
	return [...defs.filter((d) => d.pos === pos), ...defs.filter((d) => d.pos !== pos)];
}

/**
 * Filter and order one Datamuse list for display. Datamuse's own order (its relevance score) is kept;
 * without the part-of-speech filter, verb queries come back mostly as nouns ("walk" → pass, paseo, walkway).
 */
export function rankSuggestions(list: readonly Candidate[], opts: RankOptions): Suggestion[] {
	const seen = new Set([...opts.exclude].map((w) => w.toLowerCase()));
	const out: Suggestion[] = [];
	for (const c of list) {
		const word = c.word.toLowerCase();
		if (seen.has(word) || !usable(c.word, opts.pos)) continue;
		if (opts.pos && !c.pos.includes(opts.pos)) continue;
		if (opts.pos === "v" && looksInflected(word)) continue;
		const rare = c.freq !== null && c.freq < RARE_PER_MILLION;
		if (rare && opts.hideRare) continue;
		seen.add(word);
		const def = sensesFor(c.defs, opts.pos).find((d) => !opts.pos || d.pos === opts.pos || d.pos === null);
		out.push({ word: c.word, pos: c.pos, freq: c.freq, def: def?.text ?? null, rare });
		if (out.length >= opts.limit) break;
	}
	return out;
}
