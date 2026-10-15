import { DIALOGUE_TAGS } from "../lexicon/adverbExceptions";
import { dialogueRanges } from "../mask";
import type { Highlight } from "../types";

/**
 * Dialogue punctuation: mechanical conventions only, written to stay quiet unless the pattern
 * is unambiguous. Choices (ellipsis or dash, how much stammer, italics for thought) are left to the writer.
 */

/** Speech verbs beyond Creative Writer's tag list that fiction uses as tags. */
const EXTRA_TAGS = ["mused", "breathed", "joked", "managed", "offered", "pressed", "ventured", "trailed"];
const TAGS = new Set([...DIALOGUE_TAGS, ...EXTRA_TAGS]);
const TAG_PATTERN = [...TAGS].join("|");
const PRONOUN = "he|she|they|we|you|it|i";
/** After a closing quote: optional speaker, then a speech verb. */
const TAG_AFTER = new RegExp(`^\\s+(?:(?:${PRONOUN}|\\p{Lu}[\\p{Ll}'’-]+)\\s+)?(?:\\p{Ll}+ly\\s+)?(${TAG_PATTERN})\\b`, "iu");
const CAPITAL_PRONOUN_TAG = new RegExp(`^\\s+(He|She|They|We|You|It)\\s+(?:\\p{Ll}+ly\\s+)?(${TAG_PATTERN})\\b`, "u");
const LOWER_PRONOUN_TAG = new RegExp(`^\\s+(?:${PRONOUN})\\s+(?:\\p{Ll}+ly\\s+)?(${TAG_PATTERN})\\b`, "u");
/** After a closing quote: a speaker followed by any verb-like word (a tag or an action beat). */
const SPEAKER_THEN_WORD = /^\s+(?:he|she|they|we|you|it|i|\p{Lu}[\p{Ll}'’-]+)\s+\p{Ll}/u;
const CLOSERS = new Set(['"', "”"]);

const note = (text: string): Highlight["note"] => text;

export function dialoguePunctuation(text: string): Highlight[] {
	const out: Highlight[] = [];
	const push = (from: number, to: number, message: string) => out.push({ from, to, kind: { check: "dialoguePunct" }, note: note(message) });

	for (const r of dialogueRanges(text)) {
		const closing = text[r.to - 1];
		if (r.to - r.from < 2 || !closing || !CLOSERS.has(closing)) continue;
		const inner = text.slice(r.from + 1, r.to - 1).trimEnd();
		const last = inner[inner.length - 1] ?? "";
		const after = text.slice(r.to);
		const before = text.slice(0, r.from).trimEnd();
		// A line of dialogue starts a sentence; mid-sentence quotes are titles or scare quotes.
		const startsSentence = before === "" || /[.!?…:—]["”’)]*$/.test(before);

		// "Well… that's new" she mused  →  "Well… that's new," she mused
		if (startsSentence && /[\p{L}\p{N}]/u.test(last) && SPEAKER_THEN_WORD.test(after)) {
			const tag = TAG_AFTER.test(after);
			push(r.to - 1, r.to, tag
				? "Missing comma inside the closing quote before the speech tag: \"…new,\" she mused."
				: "Missing punctuation inside the closing quote: a comma before a speech tag, a full stop before an action.");
			continue;
		}
		// "Go." she said  →  "Go," she said
		if (last === "." && !inner.endsWith("..") && LOWER_PRONOUN_TAG.test(after)) {
			push(r.to - 2, r.to - 1, "A speech tag joins its line with a comma, not a full stop: \"Go,\" she said.");
			continue;
		}
		// "Go," She said  →  "Go," she said
		const capital = CAPITAL_PRONOUN_TAG.exec(after);
		if ((last === "," || last === "?" || last === "!") && capital) {
			const at = r.to + after.indexOf(capital[1]!);
			push(at, at + capital[1]!.length, "The speech tag continues the sentence, so it starts lowercase: \"Go,\" she said.");
			continue;
		}
		// "What about the boy?".  →  "What about the boy?"
		if ((last === "?" || last === "!") && after.startsWith(".")) {
			push(r.to, r.to + 1, `Drop the full stop: the ${last === "?" ? "question" : "exclamation"} mark already ends the sentence.`);
		}
		// his father called out, "what about the boy?"  →  "What about the boy?"
		const firstLetter = /\p{L}/u.exec(inner);
		const tagBefore = new RegExp(`\\b(${TAG_PATTERN})(?:\\s+(?:out|back|up))?[,:]?$`, "iu").test(before);
		const tagInterruptsLine = /["”][^"“”]*$/.test(before);
		if (firstLetter && /\p{Ll}/u.test(firstLetter[0]) && tagBefore && !tagInterruptsLine && !inner.startsWith("…") && !inner.startsWith("...")) {
			const at = r.from + 1 + firstLetter.index;
			push(at, at + 1, "Dialogue after a speech tag starts with a capital: he called out, \"What about the boy?\"");
		}
	}

	// Two-dot "ellipses": "What..?"
	for (const m of text.matchAll(/(?<!\.)\.\.(?!\.)/g)) {
		push(m.index, m.index + 2, "An ellipsis has three dots (or the … character): \"What…?\"");
	}

	// A paragraph that ends on a speech tag with no punctuation: the line it introduces has been split off.
	const tail = new RegExp(`\\b(${TAG_PATTERN})(?:\\s+(?:out|back|up))?\\s*$`, "iu").exec(text.trimEnd());
	if (tail && !/[.!?…:,;"”—]$/.test(text.trimEnd())) {
		push(tail.index, tail.index + tail[0].trimEnd().length, "This paragraph ends on a speech tag: keep the line it introduces in the same paragraph, after a comma.");
	}
	return out;
}
