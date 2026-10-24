import type { LookupHint, Pairing } from "../analysis/types";
import { adjectivesFor, meansLike, moreSpecificThan, synonymsOf } from "./datamuse";
import { canInflect, detectForm, inflect } from "./inflect";
import { rankSuggestions, type Suggestion, uposToWordPos } from "./rank";
import { LookupError, type LookupService } from "./service";
import type { Candidate, DatamuseParams } from "./types";

export interface HintResult {
	suggestions: Suggestion[];
	/** More specific kinds of the head verb, when the hint asks for them ("Other ways to walk"). */
	kinds: Suggestion[];
	error: string | null;
}

/**
 * Words to try for a hover card: one request for a phrase ("walk slowly" → stroll, saunter),
 * two or three for a single word (synonyms, more specific kinds, "means like" when those are thin).
 */
export interface PairingResult {
	/** The adjectives most often used with the noun, most common first. */
	usual: string[];
	/** Which of the writer's modifiers are among them. */
	yours: string[];
	error: string | null;
}

/** Function words Datamuse counts as adjectives ("own eyes", "more liquid"). */
const NOT_DESCRIPTIVE = new Set(["more", "own", "mine", "yours", "other", "same", "such", "first", "last", "few", "many", "much", "only", "very", "whole", "next", "most", "less", "several", "certain", "various", "main"]);

/** Plain words from a Datamuse list, without function words. */
export function plainWords(list: Candidate[], limit: number): string[] {
	return list.map((c) => c.word.toLowerCase()).filter((w) => /^[a-z][a-z'-]*$/.test(w) && !NOT_DESCRIPTIVE.has(w)).slice(0, limit);
}

/**
 * Whether a pairing is a usual one: the 25 adjectives most often used with the noun, and which of the
 * writer's are among them ("dead silence" is; "velvet silence" isn't). Nothing is suggested.
 */
export async function usualPairings(service: LookupService, pairing: Pairing): Promise<PairingResult> {
	try {
		const usual = plainWords(await service.get(adjectivesFor(pairing.noun)), 25);
		return { usual, yours: pairing.modifiers.filter((m) => usual.includes(m.toLowerCase())), error: null };
	} catch (e) {
		return { usual: [], yours: [], error: e instanceof LookupError ? e.message : "Lookup failed" };
	}
}

/** Backfill words come in only when there are fewer than this many strong matches. */
const MIN_STRONG = 3;
/** Backfill words must be at least this common (per million): the tail is where "souffle" and "chrysalis" live. */
const BACKFILL_FREQ = 0.5;

/**
 * Datamuse's "means like" answers come in score tiers: a strong first tier ("say softly" → whisper,
 * murmur, mutter), then statistical backfill that grows noisy fast. Show the first tier, and dip into
 * the backfill (common words only) when the first tier is thin.
 */
function strongFirst(list: Candidate[], rank: (l: Candidate[]) => Suggestion[], limit: number): Suggestion[] {
	const top = Math.max(...list.map((c) => c.score ?? 0));
	if (!top) return rank(list);
	const tier = (c: Candidate) => Math.floor((c.score ?? 0) / 100_000);
	const strong = rank(list.filter((c) => tier(c) === Math.floor(top / 100_000)));
	if (strong.length >= MIN_STRONG) return strong;
	const backfill = rank(list.filter((c) => tier(c) !== Math.floor(top / 100_000) && (c.freq ?? 0) >= BACKFILL_FREQ));
	const seen = new Set(strong.map((s) => s.word));
	return [...strong, ...backfill.filter((s) => !seen.has(s.word))].slice(0, Math.min(limit, 5));
}

/**
 * WordNet's "more specific" list for a verb mixes senses ("walk" → trudge, but also exhibit, process).
 * Keep the words whose verb definition uses the verb itself: "trudge: to walk wearily".
 */
function definedBy(c: Candidate, lemma: string): boolean {
	const forms = new Set([lemma, ...(["s", "past", "pastPart", "ing"] as const).map((f) => inflect(lemma, f))].map((w) => w.toLowerCase()));
	// "outlook" contains "look"; a compound of the verb is not another way to do it.
	if (c.word.toLowerCase().includes(lemma.toLowerCase())) return false;
	const def = c.defs.find((d) => d.pos === "v")?.text.toLowerCase() ?? "";
	return def.split(/[^a-z'-]+/).some((w) => forms.has(w));
}

export async function suggestForHint(service: LookupService, hint: LookupHint, hideRare: boolean, limit = 8): Promise<HintResult> {
	let error: string | null = null;
	const get = async (params: DatamuseParams): Promise<Candidate[]> => {
		try {
			return await service.get(params);
		} catch (e) {
			error ??= e instanceof LookupError ? e.message : "Lookup failed";
			return [];
		}
	};
	const pos = uposToWordPos(hint.head.pos);
	const form = detectForm({ text: hint.head.text, lemma: hint.head.lemma, upos: hint.head.pos, prev: hint.head.prev }, pos);
	const exclude = [hint.head.lemma, hint.head.text, ...hint.query.split(" ")];
	const rank = (list: Candidate[]) =>
		rankSuggestions(list, { pos, exclude, hideRare, limit: limit * 2 }).filter((s) => canInflect(s.word, form)).slice(0, limit);
	if (hint.mode === "phrase") {
		const [phrase, specific] = await Promise.all([get(meansLike(hint.query)), hint.kinds ? get(moreSpecificThan(hint.head.lemma)) : Promise.resolve([])]);
		const suggestions = strongFirst(phrase, rank, limit);
		const shown = new Set(suggestions.map((s) => s.word));
		const kinds = rank(specific.filter((c) => definedBy(c, hint.head.lemma))).filter((s) => !shown.has(s.word));
		return { suggestions, kinds: kinds.length >= 2 ? kinds : [], error };
	}
	const [syn, specific] = await Promise.all([get(synonymsOf(hint.query)), get(moreSpecificThan(hint.query))]);
	let list = [...syn, ...specific];
	if (rank(list).length < 3) list = [...list, ...(await get(meansLike(hint.query)))];
	// Synonym lists mix senses ("cold" → frigid, but also insensate), so fewer and stronger.
	return { suggestions: rank(list).slice(0, 6), kinds: [], error };
}
