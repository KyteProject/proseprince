// Rule designs adapted from Creative Writer's RepetitionRule (openers), WeakVerbRule and
// NominalizationRule (MIT), retargeted to wink-nlp tags.
import type { Highlight, Token } from "../types";
import { bySentence, lower } from "./common";

/** Openers so ordinary that a run of three is unremarkable; these need a longer run. */
const COMMON_OPENERS = new Set(["the", "a", "an", "i", "it", "there"]);

/** Runs of sentences that open with the same word. */
export function openers(words: Token[], maxSame = 2, commonRun = 4): Highlight[] {
	const starts = words.filter((t) => t.startsSentence && !/\d/.test(t.text));
	const out: Highlight[] = [];
	let run = 1;
	for (let i = 1; i < starts.length; i++) {
		const t = starts[i]!;
		if (lower(t) === lower(starts[i - 1])) {
			run++;
			const limit = COMMON_OPENERS.has(lower(t)) ? Math.max(maxSame, commonRun) : maxSame;
			if (run > limit) out.push({ from: t.from, to: t.to, kind: { check: "opener" }, note: `${run} sentences in a row open with "${t.text}". Vary the opening.` });
		} else run = 1;
	}
	return out;
}

const RELATIVE = new Set(["that", "which", "who", "whom", "whose"]);
const isCopula = (t: Token) => t.lemma === "be" || /^(is|are|was|were|am|be|been|being|'s|'re|'m)$/.test(lower(t));

/**
 * A long sentence whose only verb is "to be" has no engine. Short copula sentences
 * ("The sky was red.") are fine. The note sits on the main-clause copula, not one inside a
 * relative clause ("the cat, which was old, was on the mat" → the second "was").
 */
export function weakVerbs(words: Token[], minWords = 14): Highlight[] {
	const out: Highlight[] = [];
	for (const sentence of bySentence(words)) {
		const real = sentence.filter((t) => /\p{L}/u.test(t.text) && !/^(n't|'s|'re|'m|'ll|'d|'ve)$/.test(lower(t)));
		if (real.length < minWords || sentence[0]?.inDialogue) continue;
		// -ing/-ed forms right before a noun or adjective are modifiers ("the long and winding lane"), not verbs.
		const isModifierForm = (t: Token, k: number) => /(ing|ed)$/i.test(t.text) && ["NOUN", "ADJ"].includes(sentence[k + 1]?.pos ?? "");
		if (sentence.some((t, k) => t.pos === "VERB" && !isModifierForm(t, k))) continue;
		const copulas = sentence.filter((t) => t.pos === "AUX" && isCopula(t));
		if (copulas.length === 0) continue;
		const main = copulas.find((v) => {
			const k = sentence.indexOf(v);
			return !sentence.slice(Math.max(0, k - 6), k).some((b) => RELATIVE.has(lower(b)));
		}) ?? copulas[0]!;
		out.push({ from: main.from, to: main.to, kind: { check: "weakVerb" }, note: `${real.length} words carried by "${main.text}". Give the sentence a verb that does something.` });
	}
	return out;
}

/** Light verbs that carry a nominalised action: "made a decision", "gave an explanation". */
const LIGHT_VERBS = new Set(["make", "take", "give", "have", "do", "reach", "come", "conduct", "perform", "carry", "provide", "offer", "put"]);
/** With these the suffix guess is trustworthy; "had a mission" and "reached the station" are not nominalisations. */
const SUFFIX_VERBS = new Set(["make", "take", "give", "do", "conduct", "perform", "carry", "provide", "offer", "put"]);
/** "have" only nominalises a handful of nouns; the rest is possession ("I have an analysis"). */
const HAVE_NOUNS = new Set(["look", "discussion", "conversation", "argument", "intention", "talk", "chat", "try", "go", "think", "wander", "wash", "rest", "sleep", "nap", "laugh", "cry"]);
/** Nominalisations with the verb that replaces them. */
const KNOWN: Record<string, string> = {
	decision: "decide", agreement: "agree", explanation: "explain", investigation: "investigate", conclusion: "conclude",
	look: "look", examination: "examine", consideration: "consider", suggestion: "suggest", announcement: "announce",
	assumption: "assume", assessment: "assess", analysis: "analyse", arrangement: "arrange", attempt: "try",
	comparison: "compare", complaint: "complain", contribution: "contribute", description: "describe", discussion: "discuss",
	evaluation: "evaluate", improvement: "improve", indication: "indicate", intention: "intend", judgment: "judge",
	judgement: "judge", observation: "observe", payment: "pay", preparation: "prepare", presentation: "present",
	proposal: "propose", provision: "provide", realization: "realise", realisation: "realise", recommendation: "recommend",
	reduction: "reduce", reference: "refer", refusal: "refuse", statement: "state", recognition: "recognise",
	appearance: "appear", performance: "perform", resistance: "resist", response: "respond", reply: "reply",
	promise: "promise", request: "request", search: "search", visit: "visit", use: "use", choice: "choose",
	mention: "mention", apology: "apologise", confession: "confess", admission: "admit", objection: "object",
	failure: "fail", argument: "argue", conversation: "talk", operation: "operate", permission: "permit",
	impression: "impress", question: "ask", inspection: "inspect", difference: "differ", talk: "talk", chat: "chat",
	inquiry: "inquire", enquiry: "enquire", selection: "select", correction: "correct", connection: "connect",
};
const NOMINAL_SUFFIX = /(tion|sion|ment|ance|ence)$/;
/** Ordinary nouns that happen to end in a nominal suffix. */
const NOT_NOMINAL = new Set([
	"station", "nation", "mission", "vision", "television", "pension", "passion", "session", "condition", "position",
	"mansion", "fraction", "portion", "motion", "potion", "ration", "lotion", "notion", "caption", "option",
	"fashion", "cushion", "onion", "region", "religion", "opinion", "companion", "champion", "million", "billion",
	"moment", "garment", "pavement", "ointment", "instrument", "document", "monument", "apartment", "department",
	"basement", "cement", "element", "segment", "compartment", "environment", "government", "parliament", "torment",
	"fragrance", "distance", "entrance", "balance", "romance", "substance", "instance", "chance", "finance",
	"science", "audience", "conscience", "sentence", "silence", "essence", "absence", "presence", "fence", "pence",
	"education", "election", "collection", "solution", "relation", "emotion", "reservation", "tradition", "ambition",
	"generation", "population", "situation", "information", "direction", "attention", "affection",
	"reputation", "vacation", "location", "function", "fiction", "action", "faction", "edition", "addition", "ammunition",
]);
const LOOKAHEAD = 6;

const isNounTag = (t: Token) => t.pos === "NOUN";
const isSkippable = (t: Token) =>
	["DET", "ADJ", "ADV", "CCONJ", "SCONJ"].includes(t.pos) || (t.pos === "PRON" && /^(his|her|their|my|our|your|its|him|them|me|us|it|you)$/.test(lower(t))) || /^(not|n't|no|some|another|out|forward|to)$/.test(lower(t));

/** Weak verb + noun built from a verb: "made a decision" → "decided". */
export function nominalizations(words: Token[]): Highlight[] {
	const out: Highlight[] = [];
	for (let i = 0; i < words.length; i++) {
		const v = words[i]!;
		if (v.pos !== "VERB" || !LIGHT_VERBS.has(v.lemma) || v.inDialogue) continue;
		const hit = nounAfter(words, i, v);
		if (!hit) continue;
		const [n, j] = hit;
		const verb = KNOWN[n.lemma] ?? KNOWN[lower(n)];
		const note = verb ? `Nominalisation. "${v.text} … ${n.text}" → "${verb}".` : `Nominalisation. The action is hiding in "${n.text}"; is there a verb for it?`;
		out.push({ from: v.from, to: words[j]!.to, kind: { check: "nominalization" }, note });
	}
	return out;
}

function nounAfter(words: Token[], i: number, v: Token): [Token, number] | null {
	const suffixOk = SUFFIX_VERBS.has(v.lemma);
	const haveForm = v.lemma === "have";
	for (let j = i + 1; j <= Math.min(words.length - 1, i + LOOKAHEAD); j++) {
		const t = words[j]!;
		if (t.sentence !== v.sentence) return null;
		if (isNominal(t, suffixOk, haveForm)) {
			let k = j;
			while (k + 1 < words.length && words[k + 1]!.sentence === t.sentence && isNounTag(words[k + 1]!) && isNominal(words[k + 1]!, suffixOk, haveForm)) k++;
			return [words[k]!, k];
		}
		if (isSkippable(t)) continue;
		if (isNounTag(t) && words[j + 1] && isNounTag(words[j + 1]!)) continue; // "signal failure" modifier
		return null;
	}
	return null;
}

function isNominal(t: Token, suffixOk: boolean, haveForm: boolean): boolean {
	const known = KNOWN[t.lemma] !== undefined || KNOWN[lower(t)] !== undefined;
	if (haveForm) return known && (HAVE_NOUNS.has(t.lemma) || HAVE_NOUNS.has(lower(t)));
	if (known) return t.pos === "NOUN" || t.pos === "VERB"; // "made use of": "use" may be tagged as a verb
	if (!suffixOk || t.pos !== "NOUN") return false;
	const singular = lower(t).replace(/s$/, "");
	return NOMINAL_SUFFIX.test(singular) && !NOT_NOMINAL.has(singular);
}
