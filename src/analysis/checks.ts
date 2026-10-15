import { ECHO_STOP_LEMMAS, NOT_PARTICIPLES, POSSESSIVES } from "./wordlists";
import type { Highlight, PosCategory, Token, UposTag } from "./types";

const POS_TO_CATEGORY: Partial<Record<UposTag, PosCategory>> = {
	ADJ: "ADJ", ADV: "ADV", NOUN: "NOUN", PROPN: "PROPN", PRON: "PRON", NUM: "NUM",
	VERB: "VERB", AUX: "AUX", CCONJ: "CONJ", SCONJ: "CONJ",
};

export function partOfSpeech(tokens: Token[]): Highlight[] {
	const out: Highlight[] = [];
	for (const t of tokens) {
		const category = t.isWord ? POS_TO_CATEGORY[t.pos] : undefined;
		if (category) out.push({ from: t.from, to: t.to, kind: { pos: category } });
	}
	return out;
}

const isParticipleForm = (t: Token) => t.text.length >= 5 && /(ed|ing)$/i.test(t.text) && !NOT_PARTICIPLES.has(t.normal);

/** Adjectives, plus participles, which wink often tags VERB ("the old, cracked step"). */
const isModifier = (t: Token | undefined) => t !== undefined && (t.pos === "ADJ" || (t.pos === "VERB" && isParticipleForm(t)));

const isDeterminerSlot = (t: Token | undefined) => t !== undefined && (t.pos === "DET" || (t.pos === "PRON" && POSSESSIVES.has(t.normal)));

/** Two or more adjectives stacked on one noun ("the silky green liquid"). */
export function stackedModifiers(tokens: Token[]): Highlight[] {
	const out: Highlight[] = [];
	let i = 0;
	while (i < tokens.length) {
		const first = tokens[i]!;
		const prev = tokens[i - 1];
		if (!isModifier(first) || (first.pos === "VERB" && !isDeterminerSlot(prev))) {
			i++;
			continue;
		}
		const modifiers: Token[] = [first];
		let j = i + 1;
		while (j < tokens.length) {
			const t = tokens[j]!;
			if (isModifier(t)) {
				modifiers.push(t);
				j++;
			} else if ((t.text === "," || t.normal === "and" || t.normal === "or") && isModifier(tokens[j + 1])) {
				j++;
			} else break;
		}
		let head = tokens[j];
		let hasHead = head?.pos === "NOUN" || head?.pos === "PROPN";
		// wink sometimes tags the head noun itself as ADJ ("the silky green liquid"). After a
		// determiner, a run of three modifiers with no noun after it almost always ends in that noun.
		if (!hasHead && modifiers.length >= 3 && isDeterminerSlot(prev)) {
			head = modifiers.pop();
			hasHead = true;
		}
		if (hasHead && head && modifiers.length >= 2) {
			out.push({
				from: modifiers[0]!.from,
				to: modifiers[modifiers.length - 1]!.to,
				kind: { check: "stackedModifier" },
				note: `${modifiers.length} modifiers on "${head.text}".`,
			});
		}
		i = j;
	}
	return out;
}

/** Particles that, followed by an object, make an -ing form a verb phrase ("letting out a scream"). */
const PARTICLES = new Set(["out", "up", "off", "down", "away", "back", "over", "on"]);
const OBJECT_START = new Set<UposTag>(["DET", "NOUN", "PROPN", "NUM"]);

/**
 * Verb forms doing an adjective's job. wink gives only coarse tags, so these are positional
 * heuristics; each one names its shape in the note:
 *   - before a noun: "his frayed mind", "disjointed thoughts", "half-formed questions"
 *   - an -ing form right after a noun: "the fog swirling", "hatred lapping at" (a bare -ing
 *     form cannot be a main verb, so after a noun it describes it). Ones that take a direct
 *     object act as verbs ("letting out a scream") and are left alone.
 *   - fronted before a comma: "Repulsed, he toppled"
 *   - listed with adjectives: "wet, naked and panting"
 * After-the-noun -ed forms ("arms wrapped around him") stay undetected: without a parse they are
 * indistinguishable from main verbs ("arms wrapped his navel").
 */
export function participles(tokens: Token[]): Highlight[] {
	const out: Highlight[] = [];
	const push = (from: number, to: number, shape: "before" | "after" | "fronted" | "listed", note: string) =>
		out.push({ from, to, kind: { check: "participle" }, note, guide: `participle.${shape}` });
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i]!;
		if (t.inDialogue || (t.pos !== "VERB" && t.pos !== "ADJ" && t.pos !== "NOUN") || t.text.length < 5) continue;
		if (!/(ed|ing)$/i.test(t.text) || NOT_PARTICIPLES.has(t.normal)) continue;
		// A hyphenated compound ("half-formed") starts at the word before the hyphen.
		const hyphen = tokens[i - 1]?.text === "-" && tokens[i - 1]!.to === t.from && tokens[i - 2]?.to === tokens[i - 1]!.from;
		const start = hyphen ? tokens[i - 2]! : t;
		const startIndex = hyphen ? i - 2 : i;
		const prev = tokens[startIndex - 1];
		const next = tokens[i + 1];
		const nextNext = tokens[i + 2];
		const sentenceStart = !prev || prev.sentence !== t.sentence || !tokens.slice(0, startIndex).some((o) => o.sentence === t.sentence && o.isWord);

		const beforeNoun = next?.pos === "NOUN" || (next?.pos === "ADJ" && nextNext?.pos === "NOUN");
		const modifierSlot =
			sentenceStart || prev!.pos === "DET" || prev!.pos === "ADJ" || prev!.pos === "ADP" || prev!.pos === "CCONJ" ||
			prev!.text === "," || (prev!.pos === "PRON" && POSSESSIVES.has(prev!.normal));
		if (t.pos !== "NOUN" && beforeNoun && modifierSlot) {
			push(start.from, t.to, "before", `"${tokens.slice(startIndex, i + 1).map((x) => x.text).join("")}" sits before "${next!.pos === "NOUN" ? next!.text : nextNext!.text}" like an adjective.`);
			continue;
		}

		const isIng = /ing$/i.test(t.text);
		const afterNoun = !hyphen && prev !== undefined && prev.sentence === t.sentence && prev.to < t.from && (prev.pos === "NOUN" || prev.pos === "PROPN");
		const takesObject = next !== undefined && (OBJECT_START.has(next.pos) || (PARTICLES.has(next.normal) && nextNext !== undefined && OBJECT_START.has(nextNext.pos)));
		// wink sometimes reads "hatred lapping" as a compound noun; a preposition after it says otherwise.
		const ingAsVerb = t.pos !== "NOUN" || next?.pos === "ADP";
		if (isIng && ingAsVerb && afterNoun && !takesObject) {
			push(t.from, t.to, "after", `"${prev!.text} ${t.text}": a verb form hanging off the noun. Any verb in this slot has the same shape.`);
			continue;
		}

		if (t.pos !== "NOUN" && sentenceStart && next?.text === ",") {
			push(start.from, t.to, "fronted", `The sentence opens with a verb form ("${t.text}") before its subject.`);
			continue;
		}

		const listedWithAdjectives = prev?.pos === "CCONJ" && tokens[startIndex - 2]?.pos === "ADJ";
		if (listedWithAdjectives && next?.text === ",") push(start.from, t.to, "listed", `"${t.text}" is listed among adjectives.`);
	}
	return out;
}

/** The same content word used again within `window` content words (by lemma; names excluded). */
export function echoes(tokens: Token[], window: number): Highlight[] {
	const content = tokens.filter(
		(t) => t.isWord && ["NOUN", "VERB", "ADJ", "ADV"].includes(t.pos) && t.lemma.length >= 3 && !ECHO_STOP_LEMMAS.has(t.lemma),
	);
	const lastSeen = new Map<string, number>();
	const flagged = new Set<number>();
	content.forEach((t, index) => {
		const previous = lastSeen.get(t.lemma);
		if (previous !== undefined && index - previous <= window) {
			flagged.add(previous);
			flagged.add(index);
		}
		lastSeen.set(t.lemma, index);
	});
	return [...flagged]
		.sort((a, b) => a - b)
		.map((index) => {
			const t = content[index]!;
			return { from: t.from, to: t.to, kind: { check: "echo" as const }, note: `"${t.lemma}" is repeated nearby.` };
		});
}
