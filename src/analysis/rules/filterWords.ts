// Rule design and guards adapted from Creative Writer's FilterVerbRule (MIT), retargeted to wink-nlp tags.
import { FILTER_VERBS, type FilterEntry } from "../lexicon/filterVerbs";
import { PhraseMatcher } from "../phrases";
import type { Highlight, Token } from "../types";
import { lower } from "./common";

type Guard = (w: string[], s: number, e: number, starts: boolean[]) => boolean;
const prevIs = (w: string[], s: number, re: RegExp) => re.test(w[s - 1] ?? "");
const nextIs = (w: string[], e: number, re: RegExp) => re.test(w[e] ?? "");
const atSentenceEnd = (w: string[], e: number, starts: boolean[]) => w[e] === undefined || starts[e] === true;

/** "the felt", "a thought", "of feeling": a noun, not a verb. */
const NOUN_SLOT = /^(the|a|an|of|my|his|her|their|our|your|its|this|that|every|no|any|second|for|made)$/;
/** "was decided", "were watched", "once decided": passive or attributive participle, not a filter. */
const PASSIVE_SLOT = /^(was|were|is|are|been|being|once|be|get|got)$/;
/** "smelled of", "heard from", "felt for", "listened to": linking or idiomatic, not filtering. */
const LINKING_NEXT = /^(of|from|for|to|like|about)$/;
/** "knew" filters a clause, not a thing: "knew that…", "knew she…". "He knew the town" is fine. */
const CLAUSE_START = /^(that|he|she|it|they|we|i|you|there|what|how|why|where|when|whether|if|nothing|something|everything|better|then)$/;
const ACHIEVE = /^(dreams?|ambitions?|potential|goals?|visions?|profit|gains?)$/;

const GUARDS: Record<string, Guard> = {
	felt: (w, s, e) => !prevIs(w, s, NOUN_SLOT) && !nextIs(w, e, /^(hat|cloth|tip|pen|boots?|lining|slippers?|marker)$/),
	see: (w, s, e, st) => !nextIs(w, e, /^(you|page|below|above|also|chapter|note|fig|figure)$/) && !atSentenceEnd(w, e, st) && !prevIs(w, s, /^(let|and|you|i|wait)$/),
	feel: (w, s, e, st) => !nextIs(w, e, /^(free|like)$/) && !st[s] && !prevIs(w, s, /^(you|do|how)$/),
	saw: (w, s, e) => !prevIs(w, s, /^(the|a|an|chain|hand|band|circular|table)$/) && !nextIs(w, e, /^(to|it|in|heavy|action|service|use|off)$/),
	knew: (w, _s, e) => nextIs(w, e, CLAUSE_START),
	knows: (w, _s, e) => nextIs(w, e, CLAUSE_START),
	heard: (w, s) => !prevIs(w, s, /^(you|have|had|has|ever|never)$/),
	listened: (w, _s, e) => !nextIs(w, e, /^(to|for|in)$/),
	realized: (w, _s, e) => !nextIs(w, e, /^(profits?|gains?|assets?|losses?|value)$/) && !(nextIs(w, e, /^(his|her|their|my|our|a|the)$/) && ACHIEVE.test(w[e + 1] ?? "")),
	realised: (w, _s, e) => !nextIs(w, e, /^(profits?|gains?|assets?|losses?|value)$/) && !(nextIs(w, e, /^(his|her|their|my|our|a|the)$/) && ACHIEVE.test(w[e + 1] ?? "")),
	recalled: (w, _s, e) => !nextIs(w, e, /^(the|a|an|to)$/),
	decided: (w, s) => !prevIs(w, s, /^once$/),
};

let matcher: PhraseMatcher<FilterEntry> | null = null;

/**
 * POV filter verbs in narration ("she saw the door open" → "the door opened"). Longest phrase
 * wins ("could see" over "see"), then guarded: not in a noun slot ("the felt") or a passive one
 * ("was decided"), not before a linking preposition ("smelled of"), and tagged as a verb.
 */
export function filterWords(words: Token[]): Highlight[] {
	matcher ??= new PhraseMatcher(FILTER_VERBS.map((e) => [e.phrase, e] as const));
	const w = words.map(lower);
	const starts = words.map((t) => t.startsSentence);
	const out: Highlight[] = [];
	for (const m of matcher.findAll(words)) {
		const { start: s, end: e } = m;
		const value = m.entry.value;
		const first = words[s]!;
		if (first.inDialogue) continue;
		// "take a final look at": a noun, not a filter. Multi-word entries must open on a verb or modal.
		if (e - s > 1 && first.pos !== "VERB" && first.pos !== "AUX") continue;
		if (e - s === 1) {
			const phrase = w[s]!;
			const guard = GUARDS[phrase];
			if (prevIs(w, s, NOUN_SLOT) && !guard) continue;
			if (prevIs(w, s, PASSIVE_SLOT)) continue;
			if (nextIs(w, e, LINKING_NEXT) && !/^(saw|see|watched|noticed|felt|feel)$/.test(phrase)) continue;
			if (nextIs(w, e, /^(of|from|for)$/)) continue;
			if (guard && !guard(w, s, e, starts)) continue;
			if (first.pos !== "VERB") continue;
			// "The soup tasted good", "it felt cold": linking verb with an adjective complement.
			if (/^(tasted|smelled|felt|feels|looked)$/.test(phrase) && words[e]?.pos === "ADJ" && !prevIs(w, s, /^(he|she|i|they|we|you)$/)) continue;
		}
		out.push({ from: m.from, to: m.to, kind: { check: "filterWord" }, note: value.note });
	}
	return out;
}
