// Rule design adapted from Creative Writer's AdverbRule (MIT), retargeted to wink-nlp tags.
import { DIALOGUE_TAGS, LY_NOT_ADVERB, STRUCTURAL_ADVERBS } from "../lexicon/adverbExceptions";
import type { Highlight, Token } from "../types";
import { looksLikeName, lower } from "./common";

/** Pronoun that may sit between a dialogue tag and its adverb: "she told him gently". */
const TAG_OBJECT = /^(him|her|them|me|us|it)$/;

/**
 * -ly manner adverbs in narration: each is a place a stronger verb might do the work. An adverb
 * glued to a dialogue tag ("she said softly") is its own kind, the Tom Swifty. Stance and degree
 * adverbs ("suddenly", "obviously") are left alone: no verb replaces them.
 */
export function mannerAdverbs(words: Token[]): Highlight[] {
	const out: Highlight[] = [];
	words.forEach((tok, i) => {
		const w = lower(tok);
		if (w.length < 5 || !w.endsWith("ly") || /[^a-z]/.test(w)) return;
		if (STRUCTURAL_ADVERBS.has(w) || LY_NOT_ADVERB.has(w)) return;
		if (tok.inDialogue || looksLikeName(tok) || tok.pos !== "ADV") return;

		const prevTok = tok.startsSentence ? undefined : words[i - 1];
		const prev = lower(prevTok);
		// A speech tag needs speech: quoted words earlier in this sentence.
		const quoteInSentence = words.some((o) => o.sentence === tok.sentence && o.to <= tok.from && o.inDialogue);
		const tagTok = prevTok && TAG_OBJECT.test(prev) ? words[i - 2] : prevTok;
		const after = words[i + 1];
		const afterTag = words[i + 2];
		// Fronted: "Lazily she replied, "Oh, he…"": the quote may come after the tag.
		const fronted =
			after?.sentence === tok.sentence && (after.pos === "PRON" || after.pos === "PROPN") &&
			afterTag?.sentence === tok.sentence && DIALOGUE_TAGS.has(lower(afterTag)) &&
			words.some((o) => o.sentence === tok.sentence && o.inDialogue);
		const onTag = fronted || (quoteInSentence && tagTok !== undefined && DIALOGUE_TAGS.has(lower(tagTok)));
		if (onTag) {
			out.push({ from: tok.from, to: tok.to, kind: { check: "tagAdverb" }, note: `Adverb on a dialogue tag. Let the line itself carry the "${w}".` });
		} else {
			const note = prevTok && prevTok.to === tok.from - 1
				? `Adverb. Is there a verb that already means "${prev} ${w}"?`
				: `Adverb. Is there a verb that already carries "${w}"?`;
			out.push({ from: tok.from, to: tok.to, kind: { check: "adverb" }, note });
		}
	});
	return out;
}
