import type { LookupHint } from "../analysis/types";
import { detectForm, inflect, matchCase } from "./inflect";
import { uposToWordPos } from "./rank";

export interface TextEdit {
	from: number;
	to: number;
	insert: string;
}

/** Reads the current document (or a test string) by offsets. */
export type Slice = (from: number, to: number) => string;

/** A hint moved from paragraph offsets to document offsets. */
export function shiftHint(hint: LookupHint, by: number): LookupHint {
	const move = <T extends { from: number; to: number }>(s: T): T => ({ ...s, from: s.from + by, to: s.to + by });
	return { ...hint, head: move(hint.head), replace: move(hint.replace), ...(hint.remove ? { remove: move(hint.remove) } : {}) };
}

/** The suggestion as it will read in place: "stroll" for "walked" → "strolled"; "freezing" for "Very cold" → "Freezing". */
export function displayFor(hint: LookupHint, suggestion: string, slice?: Slice): string {
	const pos = uposToWordPos(hint.head.pos);
	const form = detectForm({ text: hint.head.text, lemma: hint.head.lemma, upos: hint.head.pos, prev: hint.head.prev }, pos);
	const first = slice ? /^\S+/.exec(slice(hint.replace.from, hint.replace.to))?.[0] ?? hint.head.text : hint.replace.from === hint.head.from ? hint.head.text : "";
	return matchCase(first, inflect(suggestion, form));
}

/**
 * The edits for picking `suggestion`: replace the pair (or the head) and delete a separated partner,
 * tidying the comma or space it leaves and moving a capital it took from the sentence start
 * ("Slowly, she walked" → "She strolled"). Null if the text has changed since the analysis.
 */
export function pickEdits(hint: LookupHint, suggestion: string, slice: Slice): TextEdit[] | null {
	if (slice(hint.head.from, hint.head.to) !== hint.head.text) return null;
	const remove = hint.remove;
	if (remove && slice(remove.from, remove.to) !== remove.text) return null;
	let insert = displayFor(hint, suggestion, slice);
	const edits: TextEdit[] = [{ from: hint.replace.from, to: hint.replace.to, insert }];
	if (!remove) return edits;

	const before = slice(Math.max(0, remove.from - 2), remove.from);
	const after = slice(remove.to, remove.to + 2);
	if (/^\p{Lu}/u.test(remove.text)) {
		// Sentence-opening partner: take it, its comma and the space, and capitalise what follows.
		let end = remove.to + (after.startsWith(",") ? 1 : 0);
		while (slice(end, end + 1) === " ") end++;
		edits.push({ from: remove.from, to: end, insert: "" });
		if (end === hint.replace.from) edits[0]!.insert = insert = insert.charAt(0).toUpperCase() + insert.slice(1);
		else {
			const next = slice(end, end + 1);
			if (/\p{Ll}/u.test(next)) edits.push({ from: end, to: end + 1, insert: next.toUpperCase() });
		}
	} else if (before === ", ") {
		// "walked, slowly, across" → "strolled across"; "walked, slowly." → "strolled."
		edits.push({ from: remove.from - 2, to: remove.to + (after.startsWith(",") ? 1 : 0), insert: "" });
	} else if (before.endsWith(" ")) {
		edits.push({ from: remove.from - 1, to: remove.to, insert: "" });
	} else if (after.startsWith(" ")) {
		edits.push({ from: remove.from, to: remove.to + 1, insert: "" });
	} else {
		edits.push({ from: remove.from, to: remove.to, insert: "" });
	}
	return edits.sort((a, b) => a.from - b.from);
}
