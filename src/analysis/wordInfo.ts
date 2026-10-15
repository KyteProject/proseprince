import { isKnownLemma } from "./concreteness";
import { maskInline } from "./mask";
import { tag } from "./tagger";

/** A word in the editor, as the tagger read it in its sentence. */
export interface WordInfo {
	text: string;
	lemma: string;
	/** Universal Dependencies tag from wink-nlp. */
	upos: string;
	/** The word before it, lowercased, for telling "walked" (past) from "had walked" (participle). */
	prev: string;
}

/**
 * Tag a line of text and describe the word at `from`–`to` (the range the editor picked out), so a
 * lookup can use its lemma and part of speech. Null when no single word covers that range.
 */
export function wordInfoAt(text: string, from: number, to: number, names: readonly string[] = []): WordInfo | null {
	const tokens = tag(maskInline(text), new Set(names));
	const i = tokens.findIndex((t) => t.isWord && t.from <= from && t.to >= to);
	const t = tokens[i];
	if (!t) return null;
	let prev = "";
	for (let j = i - 1; j >= 0; j--) {
		const p = tokens[j]!;
		if (p.sentence !== t.sentence) break;
		if (p.isWord) {
			prev = p.normal;
			break;
		}
	}
	return { text: text.slice(t.from, t.to), lemma: comparableBase(t.normal, t.lemma, t.pos), upos: t.pos, prev };
}

/**
 * wink leaves some comparatives and superlatives as they are ("darkest"). Strip the ending and keep
 * the first candidate that is a known word: darkest → dark, biggest → big, happiest → happy, latest → late.
 */
function comparableBase(word: string, lemma: string, pos: string): string {
	if ((pos !== "ADJ" && pos !== "ADV") || lemma.toLowerCase() !== word.toLowerCase() || isKnownLemma(word)) return lemma;
	const m = /^(.+?)(est|er)$/.exec(word.toLowerCase());
	if (!m) return lemma;
	const stem = m[1]!;
	const candidates = [stem, `${stem}e`, stem.replace(/i$/, "y"), stem.replace(/(.)\1$/, "$1")];
	return candidates.find((c) => c.length > 1 && isKnownLemma(c)) ?? lemma;
}
