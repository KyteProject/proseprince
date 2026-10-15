// Rule design adapted from Creative Writer's MetaphorCandidateRule (MIT), retargeted to wink-nlp tags.
import { concreteness } from "../concreteness";
import { DEAD_METAPHORS, DEAD_METAPHORS_OPEN } from "../lexicon/deadMetaphors";
import { PhraseMatcher } from "../phrases";
import { POSSESSIVES } from "../wordlists";
import type { Highlight, Token } from "../types";
import { lower } from "./common";

const T = { verbMin: 3.5, modifierMin: 3.8, abstractMax: 3.4, minGap: 0.7 };
const WINDOW = 4;
/** Light verbs carry nominalisations ("reached an agreement"); a different finding, not a metaphor. */
const LIGHT_VERBS = new Set(["make", "take", "give", "have", "do", "reach", "come", "get", "put", "hold", "keep", "bring", "go", "set", "let", "carry", "conduct", "perform", "provide", "offer"]);
/** Verbs whose literal objects are routinely abstract: "cut the budget", "wrote the law". */
const LITERAL_WITH_ABSTRACT = new Set([
	"cut", "write", "read", "print", "sign", "study", "learn", "teach", "file", "lodge", "sketch", "record", "publish",
	"draft", "type", "discuss", "draw", "mark", "note", "list", "count", "spell", "cite", "quote", "copy", "send", "post",
	// verbs of showing and meaning: "signalled the return", "marked the end" are literal
	"signal", "indicate", "show", "reveal", "represent", "suggest", "denote", "express", "display", "demonstrate",
	"prove", "symbolise", "symbolize", "convey", "betray", "announce", "herald",
]);
/** Heads of "a X of Y" that are measures or kinds, not images: "a piece of advice", "a sign of hope". */
const MEASURE_NOUNS = new Set([
	"piece", "bit", "lot", "kind", "sort", "type", "form", "part", "number", "amount", "deal", "state", "sense", "matter",
	"point", "sign", "symbol", "mark", "moment", "period", "series", "set", "pair", "couple", "group", "list", "row", "line",
	"top", "bottom", "side", "edge", "end", "middle", "front", "back", "cup", "glass", "bottle", "box", "bag", "handful", "word",
]);
/** Generic nouns the norms rate abstract; never a metaphor partner. */
const GENERIC_NOUNS = new Set(["thing", "things", "stuff", "way", "ways", "time", "times", "lot", "lots", "something", "anything", "everything", "nothing", "one", "ones", "part", "parts", "kind", "sort", "bit", "end", "ends", "start", "side", "sides", "place", "places", "order",
	// quantities wink tags as nouns ("he half cried")
	"half", "halves", "quarter", "third", "rest", "most", "all", "both", "each", "none", "plenty"]);
/** "The problem was a car": specificational, not figurative. */
const SHELL_NOUNS = new Set([
	"problem", "answer", "solution", "issue", "question", "point", "cause", "reason", "trouble", "result", "goal", "plan",
	"subject", "topic", "theme", "winner", "prize", "gift", "job", "name", "target", "choice", "option", "source", "key",
	"idea", "aim", "object", "purpose", "matter", "case", "rest", "only", "first", "last", "next", "best", "worst",
]);
/** Nouns that work as figurative modifiers ("velvet silence", "iron will"). */
const MATERIAL_MODIFIERS = new Set([
	"velvet", "silk", "satin", "iron", "steel", "stone", "granite", "marble", "glass", "ice", "honey", "sugar", "lead",
	"wool", "paper", "wax", "butter", "oil", "salt", "sand", "smoke", "water", "fire", "ash", "rust", "copper", "silver",
	"gold", "mud", "blood", "bone", "leather", "lace", "cotton", "linen", "chalk", "clay", "crystal", "diamond", "pearl",
	"syrup", "treacle", "milk", "cream", "snow", "frost", "flint", "brass", "tin", "amber", "ivory", "ebony",
]);

const isPossessive = (t: Token) => t.pos === "PRON" && POSSESSIVES.has(lower(t));
const isCandidateNoun = (t: Token) => t.pos === "NOUN" && !GENERIC_NOUNS.has(lower(t));
/** wink sometimes calls a past-tense verb an adjective ("bruised"); a differing lemma says otherwise. */
const isHeadVerb = (t: Token) => t.pos === "VERB" || (t.pos === "ADJ" && t.lemma !== lower(t) && /ed$/.test(lower(t)));
const isCopula = (t: Token) => t.pos === "AUX" && t.lemma === "be";
const isTransparent = (t: Token) => ["AUX", "PART", "ADV", "DET", "ADJ"].includes(t.pos) || isPossessive(t);
const score = (t: Token) => concreteness(t.lemma) ?? concreteness(lower(t));

let dead: PhraseMatcher<string> | null = null;
let deadOpen: PhraseMatcher<string> | null = null;

/**
 * Metaphor candidates, as a selectional-preference signal: a concrete verb with an abstract
 * subject or object ("the silence bruised"), a concrete modifier on an abstract noun ("velvet
 * silence"), or an abstract subject said to be a concrete thing ("his sorrow was a stone").
 * Hedged on purpose: whether the figure is fresh is the writer's call. Dead metaphors get a firmer note.
 */
export function metaphors(words: Token[], tokens: Token[]): Highlight[] {
	const breaks = punctuationBreaks(tokens);
	dead ??= new PhraseMatcher(DEAD_METAPHORS.map((p) => [p, p] as const));
	deadOpen ??= new PhraseMatcher(DEAD_METAPHORS_OPEN.map((p) => [p, p] as const));
	const out: Highlight[] = [];
	const claimed: [number, number][] = [];
	const claim = (from: number, to: number, note: string) => {
		if (claimed.some(([a, b]) => from < b && to > a)) return;
		claimed.push([from, to]);
		out.push({ from, to, kind: { check: "metaphor" }, note });
	};
	const deadNote = (p: string) => `Dead metaphor: "${p}". The image has worn off; say it plainly or find a live one.`;

	for (const m of dead.findAll(words)) claim(m.from, m.to, deadNote(m.entry.phrase));
	for (const m of deadOpen.findAll(words)) {
		const complement = nounAt(words, m.end);
		const s = complement ? score(complement) : null;
		if (complement && s !== null && s <= T.abstractMax) claim(m.from, complement.to, deadNote(`${m.entry.phrase} ${complement.text}`));
	}

	// "a lance of panic", "a gust of clarity": a concrete thing made of an abstract one.
	for (let i = 0; i + 2 < words.length; i++) {
		const head = words[i]!;
		const of = words[i + 1]!;
		if (head.pos !== "NOUN" || lower(of) !== "of" || MEASURE_NOUNS.has(head.lemma) || GENERIC_NOUNS.has(lower(head))) continue;
		if (of.sentence !== head.sentence || breaks.has(of)) continue;
		let j = i + 2;
		while (j < words.length && (words[j]!.pos === "DET" || words[j]!.pos === "ADJ" || isPossessive(words[j]!)) && !breaks.has(words[j]!)) j++;
		const noun = words[j];
		if (!noun || noun.sentence !== head.sentence || breaks.has(noun) || !isCandidateNoun(noun)) continue;
		const hs = score(head);
		const ns = score(noun);
		if (hs === null || ns === null || hs < T.modifierMin || ns > T.abstractMax || hs - ns < T.minGap) continue;
		const det = words[i - 1];
		const from = det && det.pos === "DET" && det.sentence === head.sentence && !breaks.has(head) ? det.from : head.from;
		claim(from, noun.to, `Possibly figurative: "${head.text}" made of "${noun.text}", a concrete thing standing for an abstract one. Fresh, or familiar?`);
	}

	for (let i = 0; i < words.length; i++) {
		const t = words[i]!;
		if (isHeadVerb(t) && !LIGHT_VERBS.has(t.lemma) && !LITERAL_WITH_ABSTRACT.has(t.lemma)) {
			const vs = score(t);
			if (vs === null || vs < T.verbMin) continue;
			const partner = abstractNoun(words, breaks, i, +1, vs) ?? abstractNoun(words, breaks, i, -1, vs);
			if (partner) claim(Math.min(t.from, partner.from), Math.max(t.to, partner.to), note(t, partner, "verb"));
		} else if (isCopula(t)) {
			const subject = abstractNoun(words, breaks, i, -1, Infinity);
			if (!subject || SHELL_NOUNS.has(lower(subject))) continue;
			const predicate = concreteNounAfter(words, breaks, i);
			if (predicate) claim(subject.from, predicate.to, `Possibly figurative: "${subject.text}" is said to be a "${predicate.text}". Fresh, or familiar?`);
		} else if (!isPossessive(t) && (t.pos === "ADJ" || MATERIAL_MODIFIERS.has(lower(t)))) {
			const ms = score(t);
			if (ms === null || ms < T.modifierMin) continue;
			const n = words[i + 1];
			if (!n || n.sentence !== t.sentence || breaks.has(n) || !isCandidateNoun(n)) continue;
			const ns = score(n);
			if (ns === null || ns > T.abstractMax || ms - ns < T.minGap) continue;
			claim(t.from, n.to, note(t, n, t.pos === "ADJ" ? "adjective" : "modifier"));
		}
	}
	return out.sort((a, b) => a.from - b.from);
}

/** The noun-phrase head at word index `i`: skips determiners and adjectives. */
function nounAt(words: Token[], i: number): Token | null {
	for (let step = 0; step < 3 && i + step < words.length; step++) {
		const t = words[i + step]!;
		if (t.pos === "DET" || t.pos === "ADJ" || isPossessive(t)) continue;
		return isCandidateNoun(t) ? t : null;
	}
	return null;
}

/** Words preceded by punctuation (a comma, a quote mark): a pairing never reaches across one. */
function punctuationBreaks(tokens: Token[]): Set<Token> {
	const out = new Set<Token>();
	let pending = false;
	for (const t of tokens) {
		if (t.isWord) {
			if (pending) out.add(t);
			pending = false;
		} else if (t.pos !== "SPACE") pending = true;
	}
	return out;
}

/** Nearest noun in one direction; abstract means candidate, concrete means literal. */
function abstractNoun(words: Token[], breaks: Set<Token>, i: number, dir: 1 | -1, headScore: number): Token | null {
	const v = words[i]!;
	for (let step = 1; step <= WINDOW; step++) {
		const n = words[i + dir * step];
		if (!n || n.sentence !== v.sentence) return null;
		// Crossing punctuation: forward, the next word is past it; backward, the word we left was.
		if (breaks.has(dir === 1 ? n : words[i + dir * (step - 1)]!)) return null;
		if (n.pos === "ADP" || n.pos === "CCONJ" || n.pos === "SCONJ" || n.pos === "VERB") return null;
		// A personal pronoun in between is the verb's real subject or object ("his exposure he walked").
		if (n.pos === "PRON" && !isPossessive(n)) return null;
		if (isTransparent(n)) continue;
		if (!isCandidateNoun(n)) continue;
		const ns = score(n);
		if (ns === null) continue;
		return ns <= T.abstractMax && headScore - ns >= T.minGap ? n : null;
	}
	return null;
}

/** "was a stone": determiners, then a concrete noun, before any preposition. */
function concreteNounAfter(words: Token[], breaks: Set<Token>, i: number): Token | null {
	for (let step = 1; step <= WINDOW; step++) {
		const n = words[i + step];
		if (!n || n.sentence !== words[i]!.sentence || breaks.has(n) || n.pos === "ADP" || n.pos === "VERB") return null;
		if (n.pos === "DET" || n.pos === "ADJ") continue;
		if (n.pos !== "NOUN") return null;
		const ns = score(n);
		return ns !== null && ns >= T.modifierMin ? n : null;
	}
	return null;
}

function note(head: Token, noun: Token, kind: string): string {
	return `Possibly figurative: a concrete ${kind} ("${head.text}") on an abstract noun ("${noun.text}"). Fresh, or familiar?`;
}
