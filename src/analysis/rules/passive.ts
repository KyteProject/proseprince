// Rule design adapted from Creative Writer's PassiveVoiceRule (MIT), retargeted to wink-nlp tags.
import { IRREGULAR_PARTICIPLES, NOT_PARTICIPLES, STATIVE_PARTICIPLES } from "../lexicon/participles";
import type { Highlight, Token } from "../types";
import { looksLikeName, lower } from "./common";

const AUXILIARIES = new Set(["is", "are", "was", "were", "be", "been", "being", "am", "'s", "'re", "'m", "get", "gets", "got", "gotten", "getting"]);
const MODALS = new Set(["will", "wo", "would", "shall", "should", "can", "ca", "could", "may", "might", "must", "has", "have", "had", "having", "'ll", "'d", "'ve"]);
/** Words allowed between auxiliary and participle: adverbs, negation, quantifiers. */
const GAP = new Set(["not", "n't", "never", "just", "already", "still", "often", "all", "very", "ever", "also", "once", "so", "even", "both", "then", "soon", "now", "again", "quite", "rather", "well", "long", "since"]);
const PRONOUN = new Set(["i", "you", "he", "she", "it", "we", "they", "this", "that", "there"]);
/** "by then", "by the time": temporal, not an agent. */
const BY_TEMPORAL = /^(then|now|morning|night|noon|midnight|dawn|dusk|evening|tomorrow|yesterday|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)/;

const looksLikeParticiple = (w: string) =>
	IRREGULAR_PARTICIPLES.has(w) || (!NOT_PARTICIPLES.has(w) && w.length > 3 && (w.endsWith("ed") || w.endsWith("en")) && !w.endsWith("een"));

const NOTE = "Passive voice. Who is doing this? Put them in front of the verb.";

/**
 * Passive voice in narration: auxiliary (be/get, optionally after modals and "have"), optional
 * adverbs/negation, past participle. Stative participles ("was tired") and names ("was Helen")
 * are left alone unless an agent follows ("was closed by the council") or the form is progressive.
 */
export function passive(words: Token[], tokens: Token[]): Highlight[] {
	const out: Highlight[] = [];
	let i = 0;
	while (i < words.length) {
		const end = words[i]!.inDialogue ? null : matchAt(words, tokens, i);
		if (end) {
			out.push({ from: words[i]!.from, to: words[end - 1]!.to, kind: { check: "passive" }, note: NOTE });
			i = end;
		} else i++;
	}
	return out;
}

function matchAt(words: Token[], tokens: Token[], i: number): number | null {
	const start = words[i]!;
	const inSentence = (k: number) => k < words.length && words[k]!.sentence === start.sentence;
	const isGap = (k: number) => GAP.has(lower(words[k])) || /ly$/.test(lower(words[k])) || words[k]!.pos === "ADV";
	let j = i;
	let hops = 0;
	while (inSentence(j) && hops < 4 && (MODALS.has(lower(words[j])) || (j > i && isGap(j)))) {
		j++;
		hops++;
	}
	if (!inSentence(j) || !AUXILIARIES.has(lower(words[j]))) return null;
	const aux = words[j]!;
	j++;
	// "Was the letter sent?": subject between auxiliary and participle in a question.
	if (aux.startsSentence && inSentence(j) && tokens.some((t) => t.sentence === aux.sentence && t.text === "?")) {
		if (PRONOUN.has(lower(words[j]))) j++;
		else if (/^(the|a|an|his|her|their|my|our|your|its)$/.test(lower(words[j])) && inSentence(j + 1)) j += 2;
	}
	let progressive = false;
	while (inSentence(j) && /^(being|been|getting)$/.test(lower(words[j]))) {
		if (lower(words[j]) !== "been") progressive = true;
		j++;
	}
	while (inSentence(j) && isGap(j)) j++;
	if (!inSentence(j)) return null;
	const head = words[j]!;
	if (looksLikeName(head)) return null;
	const w = lower(head);
	const agent = hasAgent(words, j + 1);
	const shape = looksLikeParticiple(w);
	const isParticiple = shape && (progressive || head.pos === "VERB" || agent || IRREGULAR_PARTICIPLES.has(w));
	if (!isParticiple) return null;
	if (!progressive && !agent && head.pos === "ADJ") return null;
	if (STATIVE_PARTICIPLES.has(w) && !progressive && !agent) return null;
	return j + 1;
}

/** "… by <agent>" later in the same sentence: the surest sign of a true passive. */
function hasAgent(words: Token[], from: number): boolean {
	const sentence = words[from - 1]?.sentence;
	for (let k = from; k < words.length && words[k]!.sentence === sentence; k++) {
		if (lower(words[k]) !== "by") continue;
		const next = words[k + 1];
		if (!next || next.sentence !== sentence || BY_TEMPORAL.test(lower(next))) return false;
		if (lower(next) === "the" && /^(time|morning|evening|end|way)$/.test(lower(words[k + 2]))) return false;
		return true;
	}
	return false;
}
