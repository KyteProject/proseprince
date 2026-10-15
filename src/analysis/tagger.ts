import winkNLP, { type ItemSentence, type ItemToken } from "wink-nlp";
import model from "wink-eng-lite-web-model";
import { dialogueRanges, type Range } from "./mask";
import type { Token, UposTag } from "./types";

// Neopronouns the model tends to tag as NOUN/X/AUX (the same correction iwl.me applies).
const NEOPRONOUNS = /^(xie|hir|hirs|hirself|ze|zir|zirs|zirself|ve|vis|ver|verself|xe|xem|xyr|xyrs|xemself|ey|em|eir|eirs|emself)$/i;
const NON_WORD_TYPES = new Set(["punctuation", "tabCRLF", "emoticon", "symbol", "emoji"]);

let nlp: ReturnType<typeof winkNLP> | null = null;
function engine() {
	return (nlp ??= winkNLP(model));
}

const inside = (ranges: Range[], from: number, to: number) => ranges.some((r) => from >= r.from && to <= r.to);

/** Read one token property. wink's typings don't accept every `its` helper (e.g. `its.lemma`). */
const read = (t: ItemToken, its: unknown): string => (t.out as (f: unknown) => unknown)(its) as string;

/**
 * Tag one (already masked) paragraph. Offsets in the result index into `text`. Words in `names`
 * (characters known from the note or the cast list) are tagged as proper nouns wherever they appear capitalised.
 */
export function tag(text: string, names: ReadonlySet<string> = new Set()): Token[] {
	const nlpEngine = engine();
	const its = nlpEngine.its;
	const doc = nlpEngine.readDoc(text);
	const dialogue = dialogueRanges(text);
	const tokens: Token[] = [];
	let offset = 0;
	doc.sentences().each((sentence: ItemSentence, sentenceIndex: number) => {
		let sawWord = false;
		sentence.tokens().each((t: ItemToken) => {
			const value = t.out() as string;
			offset += read(t, its.precedingSpaces).length;
			// wink rebuilds offsets from token lengths; resynchronise if the token is not where we expect.
			if (text.slice(offset, offset + value.length) !== value) {
				const found = text.indexOf(value, offset);
				if (found !== -1) offset = found;
			}
			const from = offset;
			const to = offset + value.length;
			offset = to;
			let pos = read(t, its.pos) as UposTag;
			const normal = read(t, its.normal);
			if ((pos === "NOUN" || pos === "X" || pos === "AUX") && NEOPRONOUNS.test(normal)) pos = "PRON";
			const isName = names.has(value);
			if (isName) pos = "PROPN";
			const type = read(t, its.type);
			const isWord = !NON_WORD_TYPES.has(type) && pos !== "PUNCT" && pos !== "SPACE" && pos !== "SYM";
			tokens.push({
				from,
				to,
				text: value,
				normal,
				lemma: isName ? normal : read(t, its.lemma).toLowerCase(),
				pos,
				sentence: sentenceIndex,
				isWord,
				inDialogue: inside(dialogue, from, to),
				startsSentence: isWord && !sawWord,
			});
			if (isWord) sawWord = true;
		});
	});
	retagSentenceStarts(text, tokens, names);
	return tokens;
}

/** Tags a lowercased sentence opener may take instead of PROPN. NOUN is not one: "Shin felt" stays a name. */
const RETAG_TO = new Set<UposTag>(["ADJ", "ADV", "VERB", "AUX", "DET", "ADP", "PRON", "CCONJ", "SCONJ", "NUM", "PART", "INTJ"]);

/**
 * wink reads a capitalised sentence opener as a name ("Slender arms…", "Wet, naked…"). Re-tag
 * such sentences with the first letter lowercased and take the new tag when it is clearly not a
 * name. Same length, so offsets are unchanged.
 */
function retagSentenceStarts(text: string, tokens: Token[], names: ReadonlySet<string>): void {
	const nlpEngine = engine();
	const its = nlpEngine.its;
	for (let i = 0; i < tokens.length; i++) {
		const first = tokens[i]!;
		if (!first.startsSentence || first.pos !== "PROPN" || names.has(first.text) || !/^\p{Lu}\p{Ll}/u.test(first.text)) continue;
		let end = i;
		while (end + 1 < tokens.length && tokens[end + 1]!.sentence === first.sentence) end++;
		const sentence = text.slice(first.from, tokens[end]!.to);
		const lowered = sentence[0]!.toLowerCase() + sentence.slice(1);
		const retagged = nlpEngine.readDoc(lowered).tokens().itemAt(0);
		const pos = read(retagged, its.pos) as UposTag;
		// "White flashed across…": an opener read as an adjective but followed by a verb is the subject.
		const nextWord = tokens.slice(i + 1, end + 1).find((t) => t.isWord);
		if (pos === "ADJ" && nextWord && (nextWord.pos === "VERB" || nextWord.pos === "AUX") && nextWord.from === first.to + 1) {
			first.pos = "NOUN";
			first.lemma = first.normal;
			continue;
		}
		if (RETAG_TO.has(pos)) {
			first.pos = pos;
			first.lemma = read(retagged, its.lemma).toLowerCase();
		}
	}
}
