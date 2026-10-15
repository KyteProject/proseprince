import type { Candidate, DatamuseParams, Sense, WordPos } from "./types";

export const DATAMUSE_URL = "https://api.datamuse.com/words";
/** Datamuse hasn't published how keys are passed (they become required on 1 February 2027). Confirm once keys are issued. */
const KEY_PARAM = "key";
const POS_TAGS = new Set<string>(["n", "v", "adj", "adv"]);

/** Stable key for caching: the same query always produces the same string, whatever the parameter order. */
export function queryKey(params: DatamuseParams): string {
	return Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
}

/** Full request URL. Definitions, parts of speech and frequency always come back in the same request. */
export function buildUrl(params: DatamuseParams, apiKey = ""): string {
	const search = new URLSearchParams({ ...params, md: "dpf", max: params.max ?? "40" });
	if (apiKey.trim()) search.set(KEY_PARAM, apiKey.trim());
	return `${DATAMUSE_URL}?${search.toString()}`;
}

/** Synonyms of a word (by lemma). */
export const synonymsOf = (lemma: string): DatamuseParams => ({ rel_syn: lemma.toLowerCase() });
/** More specific kinds: walk → saunter, stride, trudge. */
export const moreSpecificThan = (lemma: string): DatamuseParams => ({ rel_gen: lemma.toLowerCase() });
/** Words with a similar meaning; also works for phrases ("walk slowly"). */
export const meansLike = (phrase: string): DatamuseParams => ({ ml: phrase.toLowerCase() });
/** Adjectives most often used with a noun: silence → long, dead, complete, profound. */
export const adjectivesFor = (noun: string): DatamuseParams => ({ rel_jjb: noun.toLowerCase(), max: "25" });
/** Nouns an adjective most often describes: silky → hair, texture, skin. */
export const nounsFor = (adjective: string): DatamuseParams => ({ rel_jja: adjective.toLowerCase(), max: "25" });
export const rhymesOf = (word: string): DatamuseParams => ({ rel_rhy: word.toLowerCase(), max: "30" });
export const nearRhymesOf = (word: string): DatamuseParams => ({ rel_nry: word.toLowerCase(), max: "30" });

/** The word itself, for its definitions. */
export const definitionOf = (word: string): DatamuseParams => ({ sp: word.toLowerCase(), qe: "sp", max: "1" });

/**
 * Turn a Datamuse response into candidates. The response is untrusted: anything that doesn't
 * have the expected shape is skipped, never thrown on.
 */
export function parseWords(json: unknown): Candidate[] {
	if (!Array.isArray(json)) return [];
	const out: Candidate[] = [];
	for (const item of json) {
		if (!item || typeof item !== "object") continue;
		const { word, tags, defs, score } = item as { word?: unknown; tags?: unknown; defs?: unknown; score?: unknown };
		if (typeof word !== "string" || !word.trim() || word.length > 60) continue;
		const pos: WordPos[] = [];
		let freq: number | null = null;
		for (const tag of Array.isArray(tags) ? tags : []) {
			if (typeof tag !== "string") continue;
			if (POS_TAGS.has(tag)) pos.push(tag as WordPos);
			else if (tag.startsWith("f:")) {
				const f = Number.parseFloat(tag.slice(2));
				if (Number.isFinite(f)) freq = f;
			}
		}
		out.push({ word: word.trim(), pos, freq, defs: parseDefs(defs), ...(typeof score === "number" && Number.isFinite(score) ? { score } : {}) });
	}
	return out;
}

/** Definitions arrive as "pos<TAB>text"; Wiktionary text can be long, so each is capped. */
function parseDefs(defs: unknown): Sense[] {
	if (!Array.isArray(defs)) return [];
	const out: Sense[] = [];
	for (const d of defs) {
		if (typeof d !== "string") continue;
		const tab = d.indexOf("\t");
		const tag = tab > 0 ? d.slice(0, tab) : "";
		const text = (tab > 0 ? d.slice(tab + 1) : d).trim();
		if (!text) continue;
		out.push({ pos: POS_TAGS.has(tag) ? (tag as WordPos) : null, text: text.length > 300 ? `${text.slice(0, 297)}…` : text });
	}
	return out;
}
