import { type DialogueLine, NON_SPEECH_TAGS } from "../dialogue/speech";
import { dialogueRanges } from "../mask";
import type { Highlight, Token } from "../types";

/**
 * Standard fiction conventions for dialogue, on top of the punctuation slips in `dialogue.ts`. Each
 * finding has a hand-written guide; none of them rewrites anything. Token based: they read the tags
 * `speech.ts` found ("Linh said", "replied his father").
 */

/** Tag verbs that draw attention to themselves. A hint: used sparingly they're fine. */
export const SHOWY_TAGS = new Set([
	"hissed", "growled", "snarled", "exclaimed", "scoffed", "retorted", "barked", "bellowed", "spat", "sneered",
	"drawled", "purred", "chirped", "gushed", "declared", "proclaimed", "opined", "quipped", "interjected", "intoned",
	"chortled", "queried", "enquired", "inquired", "snapped", "rasped", "croaked", "wailed", "whined", "teased",
	"chided", "admonished", "cajoled", "simpered", "breathed", "ejaculated", "expostulated",
]);
const THOUGHT_VERBS = new Set(["thought", "thinks", "wondered", "wonders", "reflected", "reasoned"]);
const REFLEXIVE = /\b(thought|wondered|said|muttered)\s+(to\s+(himself|herself|themselves|themself|myself|yourself|itself))\b/giu;

const push = (out: Highlight[], from: number, to: number, check: Highlight["kind"], note: string, guide?: string) =>
	out.push({ from, to, kind: check, note, ...(guide ? { guide } : {}) });

export function dialogueConventions(masked: string, tokens: Token[], lines: DialogueLine[]): Highlight[] {
	const out: Highlight[] = [];
	const words = tokens.filter((t) => t.isWord);

	for (const span of lines.flatMap((l) => l.spans)) {
		const closing = masked[span.to - 1] ?? "";
		const closed = closing === '"' || closing === "”";
		const inner = masked.slice(span.from + 1, closed ? span.to - 1 : span.to).trimEnd();
		const last = inner[inner.length - 1] ?? "";
		const after = masked.slice(span.to);
		const tag = span.tag;

		// "Liar", Linh mouthed  →  "Liar," Linh mouthed
		const outside = /^\s*([,.])/.exec(after);
		if (closed && outside && /[\p{L}\p{N}…]/u.test(last) && !span.thought) {
			const at = span.to + outside.index + outside[0].length - 1;
			push(out, at, at + 1, { check: "dialoguePunct" }, outside[1] === ","
				? "The comma goes inside the closing quote: \"Liar,\" Linh mouthed."
				: "The full stop goes inside the closing quote: \"It's late.\"", "dialoguePunct.outside");
		}

		if (!tag) continue;
		const tagWords = words.filter((w) => w.from >= tag.from && w.to <= tag.to);
		const verb = tagWords.find((w) => w.text.toLowerCase() === tag.verb) ?? tagWords[tagWords.length - 1];
		const afterLine = tag.from >= span.to;

		// "No, mam." replied his father  →  "No, mam," replied his father. (Pronoun tags are in dialogue.ts.)
		if (afterLine && closed && last === "." && !inner.endsWith("..") && tag.kind !== "pronoun" && !NON_SPEECH_TAGS.has(tag.verb) && !THOUGHT_VERBS.has(tag.verb)) {
			const at = span.from + 1 + inner.length - 1;
			push(out, at, at + 1, { check: "dialoguePunct" }, `A speech tag joins its line with a comma, not a full stop: "No," ${tag.inverted ? `${tag.verb} ${tag.speaker}` : `${tag.speaker} ${tag.verb}`}.`);
		}

		// "Fine," she smiled.  →  "Fine." She smiled.
		if (verb && NON_SPEECH_TAGS.has(tag.verb) && afterLine && /[,?!…—-]/.test(last)) {
			push(out, verb.from, verb.to, { check: "nonSpeechTag" }, `People can't ${baseOf(tag.verb)} words. Make it an action beat ("Fine." She ${tag.verb}.) or use "said".`);
		} else if (verb && SHOWY_TAGS.has(tag.verb)) {
			push(out, verb.from, verb.to, { check: "showyTag" }, `"${tag.verb}" draws the eye to the tag. Fine now and then; often "said" and a line that carries the ${tag.verb === "hissed" ? "venom" : "tone"} do more.`);
		}

		// "said he", "replied Linh", "replied his father"  →  "he said", "Linh replied". A long subject may invert.
		if (tag.inverted && afterLine && verb) {
			const next = words.find((w) => w.from >= tag.to);
			const longSubject = next !== undefined && next.sentence === verb.sentence && next.pos === "ADP";
			if (!longSubject) {
				push(out, tag.from, tag.to, { check: "invertedTag" }, tag.kind === "pronoun"
					? `"${tag.verb} ${tag.speaker}" reads as old-fashioned: "${tag.speaker} ${tag.verb}".`
					: `Modern fiction puts the speaker first: "${tag.speaker} ${tag.verb}". Inverting suits a long subject ("said the man by the door").`);
			}
		}

		// "Strange," he thought.  →  Strange, he thought. (or italics)
		if (span.thought && THOUGHT_VERBS.has(tag.verb)) {
			push(out, span.from, span.from + 1, { check: "quotedThought" }, "Direct thought usually goes in italics without quote marks, so it isn't read as speech.");
		}
	}

	// Two different people tagged in one paragraph (a line counts as one: many writers give each speaker a line).
	for (const line of lines) {
		const tagged = line.spans.filter((s) => s.tag && s.tag.kind !== "pronoun" && s.tag.from >= line.from);
		const first = tagged[0]?.tag?.speaker.toLowerCase();
		const second = tagged.find((s) => s.tag!.speaker.toLowerCase() !== first)?.tag;
		if (first && second) {
			push(out, second.from, second.to, { check: "twoSpeakers" }, `A new speaker starts a new paragraph: "${tagged[0]!.tag!.speaker}" and "${second.speaker}" both speak here.`);
		}
	}

	// "he thought to himself": the "to himself" is implied.
	for (const m of masked.matchAll(REFLEXIVE)) {
		const at = m.index + m[0].length - m[2]!.length;
		push(out, at, at + m[2]!.length, { check: "quotedThought" }, `"${m[2]}" is implied: thinking is always to oneself.`);
	}

	// 'The fuck is that?",  →  one kind of quote mark at both ends.
	out.push(...mismatchedQuotes(masked));
	return out;
}

/** "smiled" → "smile", for the note. */
const BASE: Record<string, string> = {
	smiled: "smile", grinned: "grin", laughed: "laugh", chuckled: "chuckle", giggled: "giggle", sighed: "sigh",
	shrugged: "shrug", nodded: "nod", frowned: "frown", smirked: "smirk", winked: "wink", beamed: "beam",
	scowled: "scowl", glared: "glare", snorted: "snort", sniffed: "sniff", huffed: "huff", coughed: "cough",
};
const baseOf = (verb: string) => BASE[verb] ?? verb;

/** A line opened with one kind of quote and closed with another: 'What?" or "What?' */
function mismatchedQuotes(masked: string): Highlight[] {
	const out: Highlight[] = [];
	// Single open, double close: 'The fuck is that?",
	for (const m of masked.matchAll(/(?<=^|[\s(—–])(['‘])(\p{Lu}[^'‘’"“”\n]{0,300}?[.!?,…])(["”])/gu)) {
		push(out, m.index, m.index + 1, { check: "dialoguePunct" }, "This line opens with a single quote and closes with a double. Use the same mark at both ends.", "dialoguePunct.mismatch");
	}
	// Double open, single close, only when the double quote is left unpaired.
	const doubles = dialogueRanges(masked).filter((r) => masked[r.to - 1] !== '"' && masked[r.to - 1] !== "”");
	for (const r of doubles) {
		const m = /[.!?,…](['’])(?=\s|$)/u.exec(masked.slice(r.from, r.to));
		if (m) {
			const at = r.from + m.index + 1;
			push(out, at, at + 1, { check: "dialoguePunct" }, "This line opens with a double quote and closes with a single. Use the same mark at both ends.", "dialoguePunct.mismatch");
		}
	}
	return out;
}
