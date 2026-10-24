import { CLICHES } from "../lexicon/cliches";
import { CLICHES_EXTRA } from "../lexicon/clichesExtra";
import { CLICHES_WRITE_GOOD } from "../lexicon/clichesWriteGood";
import { FILLERS, HEDGES, QUALIFIERS, WEASELS } from "../lexicon/intensity";
import { REDUNDANCIES } from "../lexicon/redundancies";
import { PhraseMatcher, type PhraseMatch } from "../phrases";
import type { CheckKind, Highlight, LookupHint, Token } from "../types";
import { headOf } from "./common";

type Matcher = PhraseMatcher<CheckKind>;
let matchers: { cliche: Matcher; redundancy: Matcher; intensity: Matcher } | null = null;

/** Built lazily on first use: phrases are tokenised with the tagger, which takes a moment. */
function getMatchers() {
	return (matchers ??= {
		cliche: new PhraseMatcher([...CLICHES, ...CLICHES_WRITE_GOOD, ...CLICHES_EXTRA].map((p) => [p, "cliche"] as const)),
		redundancy: new PhraseMatcher(REDUNDANCIES.map((p) => [p, "redundancy"] as const)),
		// One matcher for the four intensity lists, so the longest phrase wins across them.
		intensity: new PhraseMatcher([
			...FILLERS.map((p) => [p, "filler"] as const),
			...QUALIFIERS.map((p) => [p, "qualifier"] as const),
			...WEASELS.map((p) => [p, "weasel"] as const),
			...HEDGES.map((p) => [p, "hedge"] as const),
		]),
	});
}

const NOTES: Partial<Record<CheckKind, (text: string) => string>> = {
	cliche: (t) => `Cliché: "${t}". Say what you actually saw.`,
	redundancy: (t) => `Redundant: "${t}" repeats what the rest of the phrase already says.`,
	filler: (t) => `Filler: "${t}" adds nothing; cut it and the sentence stands.`,
	qualifier: (t) => `Qualifier: "${t}" softens or props up the word beside it.`,
	weasel: (t) => `Weasel words: "${t}" is vague where a specific would land.`,
	hedge: (t) => `Hedge: "${t}". Commit, or make the doubt the point.`,
};

/** The matched words as written, rejoined with their original spacing ("a day's work"). */
export function spanText(tokens: Token[], from: number, to: number): string {
	let out = "";
	let lastTo = -1;
	for (const t of tokens) {
		if (t.from < from || t.to > to) continue;
		out += (lastTo !== -1 && t.from > lastTo ? " " : "") + t.text;
		lastTo = t.to;
	}
	return out;
}

function toHighlight(m: PhraseMatch<CheckKind>, paragraph: Token[]): Highlight {
	const text = spanText(paragraph, m.from, m.to);
	return { from: m.from, to: m.to, kind: { check: m.entry.value }, note: NOTES[m.entry.value]?.(text) };
}

export function cliches(words: Token[]): Highlight[] {
	return getMatchers().cliche.findAll(words).map((m) => toHighlight(m, words));
}

export function redundancies(words: Token[]): Highlight[] {
	return getMatchers().redundancy.findAll(words).map((m) => toHighlight(m, words));
}

/**
 * Filler, qualifiers, weasel words and hedges, in narration only (a character's voice is
 * left alone). Multi-word qualifiers after a determiner are literal ("the kind of man"),
 * and "a bit"/"a little" only qualify when they modify something ("a little cold", not "a little dog").
 */
export function intensity(words: Token[]): Highlight[] {
	const matches = getMatchers()
		.intensity.findAll(words, (m) => {
			const first = words[m.start]!;
			if (first.inDialogue) return false;
			const prev = m.start > 0 && !first.startsSentence ? words[m.start - 1] : undefined;
			const next = words[m.end];
			const phrase = m.entry.phrase;
			if ((phrase === "kind of" || phrase === "sort of") && (prev?.pos === "DET" || prev?.pos === "ADJ")) return false;
			if (/^a (bit|little|tad|touch)$/.test(phrase) && !(next && ["ADJ", "ADV", "VERB"].includes(next.pos))) return false;
			if (phrase === "pretty@ADV" && !(next && ["ADJ", "ADV"].includes(next.pos))) return false;
			if (phrase === "too@ADV" && !(next && ["ADJ", "ADV"].includes(next.pos))) return false;
			return true;
		});
	return matches.map((m) => {
		const h = toHighlight(m, words);
		const hint = m.entry.value === "qualifier" ? qualifierHint(words, m.start, m.end) : undefined;
		return hint ? { ...h, lookup: hint } : h;
	});
}

/** "very cold": one word for the pair (freezing, frigid). The pick replaces both. */
function qualifierHint(words: Token[], start: number, end: number): LookupHint | undefined {
	const first = words[start]!;
	const last = words[end - 1]!;
	const next = words[end];
	if (!next || next.sentence !== first.sentence || next.from - last.to > 1 || (next.pos !== "ADJ" && next.pos !== "ADV")) return undefined;
	const qualifier = words.slice(start, end).map((t) => t.normal).join(" ");
	return { mode: "phrase", query: `${qualifier} ${next.lemma}`, head: headOf(words, end), replace: { from: first.from, to: next.to } };
}
