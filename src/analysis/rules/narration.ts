import { EMOTIONS } from "../lexicon/emotions";
import type { Highlight, Token } from "../types";
import { lower } from "./common";

/** Subjects that can open the main clause after an action clause: "…, she", "…, the man", "…, Linh". */
const isSubjectStart = (t: Token | undefined) => !!t && (t.pos === "PRON" || t.pos === "PROPN" || t.pos === "DET");

/**
 * Actions held in a subordinate clause (Self-Editing for Fiction Writers, ch. 11): "Pulling off her
 * gloves, she turned" and "As she turned, she pulled off her gloves". The main action loses its
 * weight, and the two often can't happen at once. Narration only.
 */
export function actionClauses(tokens: Token[]): Highlight[] {
	const out: Highlight[] = [];
	const words = tokens.filter((t) => t.isWord || t.text === ",");
	for (let i = 0; i < words.length; i++) {
		const t = words[i]!;
		if (t.inDialogue || !t.isWord) continue;
		const prev = words[i - 1];
		const opens = t.startsSentence || prev?.text === ",";
		if (!opens) continue;
		// The clause runs to the next comma in the same sentence.
		let j = i + 1;
		while (j < words.length && words[j]!.sentence === t.sentence && words[j]!.text !== ",") j++;
		const comma = words[j];
		if (!comma || comma.text !== "," || comma.sentence !== t.sentence) continue;
		const clause = words.slice(i, j);
		const after = words[j + 1];
		// "Pulling off her gloves, she…": an -ing verb opening the sentence, then the subject.
		if (t.startsSentence && /ing$/i.test(t.text) && t.pos === "VERB" && clause.length >= 2 && isSubjectStart(after)) {
			out.push({ from: t.from, to: clause[clause.length - 1]!.to, kind: { check: "actionClause" }, note: `"${t.text} …," holds an action in a clause. Give it its own verb: "She pulled off her gloves and turned."` });
			continue;
		}
		// "As she turned, …" or "…, as he closed the door": as + subject + verb.
		if (lower(t) === "as" && isSubjectStart(words[i + 1]) && clause.slice(1, 4).some((w) => w.pos === "VERB") && lower(words[i + 1]) !== "if" && !clause.some((w) => lower(w) === "if" || lower(w) === "though")) {
			out.push({ from: t.from, to: clause[clause.length - 1]!.to, kind: { check: "actionClause" }, note: "\"As …\" makes two actions happen at once, and the one in the clause loses its weight. Can they come one after the other?" });
		}
	}
	return out;
}

/**
 * Feelings named in the narration (Self-Editing, ch. 1: "resist the urge to explain"). The scene
 * usually shows them already; naming them tells the reader what to feel. Narration only.
 */
export function namedEmotions(words: Token[]): Highlight[] {
	return words
		.filter((t) => !t.inDialogue && (EMOTIONS.has(lower(t)) || EMOTIONS.has(t.lemma.toLowerCase())) && t.pos !== "PROPN")
		.map((t) => ({ from: t.from, to: t.to, kind: { check: "namedEmotion" as const }, note: `"${t.text}" names the feeling. What would the reader see or hear that shows it?` }));
}
