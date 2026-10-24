import { DIALOGUE_TAGS } from "../lexicon/adverbExceptions";
import { dialogueRanges } from "../mask";
import type { Token } from "../types";

/**
 * Speech and thought in one paragraph, and the evidence for who says each line: a tag next to
 * the quote ("Linh said", "replied his father") and the people named in the narration around
 * it. Worker side and cached per paragraph; deciding the speaker across paragraphs (turn-taking)
 * happens later, in `attribute.ts`.
 */

export type SpeakerKind = "name" | "described" | "pronoun";

export interface Tag {
	/** As written for names ("Linh"); lowercased for described speakers ("the inspector") and pronouns ("she"). */
	speaker: string;
	kind: SpeakerKind;
	/** The tag verb, lowercased ("said", "replied"). */
	verb: string;
	/** Verb before the speaker: "said Linh", "replied his father". */
	inverted: boolean;
	/** The tag's span in the paragraph, speaker and verb together. */
	from: number;
	to: number;
}

export interface SpeechSpan {
	/** Paragraph offsets, quotes included. */
	from: number;
	to: number;
	thought: boolean;
	tag: Tag | null;
}

export interface DialogueInfo {
	spans: SpeechSpan[];
	/** Speakers named in the narration outside any tag, in order: action beats ("Linh set down his cup"). */
	beats: { speaker: string; kind: SpeakerKind }[];
	/**
	 * "he" or "she" picking up the only person named before it in the paragraph ("Shaddid looked up.
	 * She frowned."), so pronoun tags can be resolved for the rest of the scene.
	 */
	pronouns: { pronoun: "he" | "she"; speaker: string }[];
	/** Everyone named in the narration, in order: who is present in the scene. */
	mentions: string[];
}

/** Verbs that tag thought rather than speech. */
const THOUGHT_VERBS = new Set(["thought", "thinks", "wondered", "wonders", "reflected", "reasoned", "realised", "realized"]);
/** Verbs often used as tags though they don't make words ("she smiled"); still evidence of who spoke. */
export const NON_SPEECH_TAGS = new Set([
	"smiled", "grinned", "laughed", "chuckled", "giggled", "sighed", "shrugged", "nodded", "frowned", "smirked",
	"winked", "beamed", "scowled", "glared", "snorted", "sniffed", "huffed", "coughed",
]);
const EXTRA_TAGS = ["mused", "breathed", "joked", "managed", "offered", "pressed", "ventured", "trailed", "mouthed", "scoffed", "corrected", "lied", "says", "asks", "replies", "whispers", "shouts"];
export const TAG_VERBS: ReadonlySet<string> = new Set([...DIALOGUE_TAGS, ...EXTRA_TAGS, ...THOUGHT_VERBS, ...NON_SPEECH_TAGS]);

const PRONOUNS = new Set(["he", "she", "they", "i", "we", "you", "it"]);
/** Titles before a name: "Captain Shaddid" is Shaddid. */
const TITLES = new Set([
	"captain", "detective", "inspector", "doctor", "dr", "mr", "mrs", "ms", "miss", "mister", "sergeant", "lieutenant",
	"commander", "officer", "professor", "sir", "lady", "lord", "madam", "agent", "major", "colonel", "general", "admiral",
	"father", "mother", "sister", "brother", "aunt", "uncle", "auntie", "nan", "grandma", "grandpa", "king", "queen", "prince", "princess",
]);
const DETERMINERS = new Set(["the", "a", "an", "his", "her", "their", "my", "our", "your", "its"]);

const word = (t: Token | undefined) => (t ? t.text.toLowerCase().replace(/[’ʼ]/g, "'") : "");
const isTagVerb = (t: Token | undefined) => !!t && t.isWord && TAG_VERBS.has(word(t));
/** Capitalised function words the note's name finder can mistake for names ("An", "His"). */
const NOT_NAMES = /^(the|a|an|his|her|their|its|my|our|your|this|that|these|those|there|then|when|what|he|she|they|it|we|you|i|and|but|so|if)$/i;

/** A name: known to the story or the note, or tagged as one mid-sentence ("Grin returning…" at a sentence start is not). */
const isName = (t: Token | undefined, names: ReadonlySet<string>) =>
	!!t && t.isWord && /^\p{Lu}/u.test(t.text) && !NOT_NAMES.test(t.text) && (names.has(t.text) || (t.pos === "PROPN" && !t.startsSentence));

interface Subject {
	speaker: string;
	kind: SpeakerKind;
	/** Index after the subject's last token. */
	end: number;
}

/** A speaker starting at `words[i]`: a pronoun, a name (one or two words), or the/his + (adjectives) + noun. */
function subjectAt(words: Token[], i: number, names: ReadonlySet<string>): Subject | null {
	const t = words[i];
	if (!t) return null;
	if (t.pos === "PRON" && PRONOUNS.has(word(t))) return { speaker: word(t), kind: "pronoun", end: i + 1 };
	const titled = TITLES.has(word(t).replace(/\.$/, "")) && /^\p{Lu}/u.test(t.text);
	if (isName(t, names) || (titled && isName(words[i + 1], names))) {
		const second = isName(words[i + 1], names) && words[i + 1]!.from - t.to <= 2 ? words[i + 1]! : null;
		// "Captain Shaddid" → "Shaddid"; "Eufemie Kanda" stays whole.
		if (titled && second) return { speaker: second.text, kind: "name", end: i + 2 };
		return { speaker: second ? `${t.text} ${second.text}` : t.text, kind: "name", end: i + (second ? 2 : 1) };
	}
	if (DETERMINERS.has(word(t))) {
		let j = i + 1;
		while (j < words.length && words[j]!.pos === "ADJ" && j - i <= 2) j++;
		const noun = words[j];
		if (noun?.pos !== "NOUN") return null;
		const det = word(t) === "a" || word(t) === "an" ? "the" : word(t);
		const phrase = [det, ...words.slice(i + 1, j + 1).map(word)].join(" ");
		return { speaker: phrase, kind: "described", end: j + 1 };
	}
	return null;
}

/**
 * The tag right after a closing quote: "Linh said", "said Linh", "the inspector said", "replied his
 * father", allowing one adverb either side of the verb ("he softly said", "she said quietly").
 */
function tagAfter(words: Token[], i: number, names: ReadonlySet<string>): Tag | null {
	const first = words[i];
	if (!first || first.inDialogue) return null;
	// Verb first: "said Linh".
	if (isTagVerb(first)) {
		// "said he" is archaic, but still a tag.
		const s = subjectAt(words, i + 1, names);
		return s ? { speaker: s.speaker, kind: s.kind, verb: word(first), inverted: true, from: first.from, to: words[s.end - 1]!.to } : null;
	}
	const s = subjectAt(words, i, names);
	if (!s) return null;
	let v = s.end;
	if (words[v]?.pos === "ADV" && !isTagVerb(words[v])) v++;
	const verb = words[v];
	if (!isTagVerb(verb)) return null;
	return { speaker: s.speaker, kind: s.kind, verb: word(verb), inverted: false, from: first.from, to: verb!.to };
}

/** The tag before an opening quote: `Linh said, "…"` or `The inspector asked: "…"`. */
function tagBefore(words: Token[], tokens: Token[], spanFrom: number, names: ReadonlySet<string>): Tag | null {
	// The token just before the quote must be a comma or colon.
	const before = tokens.filter((t) => t.to <= spanFrom && t.text.trim() !== "" && t.pos !== "SPACE");
	const last = before[before.length - 1];
	if (!last || (last.text !== "," && last.text !== ":")) return null;
	const prior = words.filter((w) => w.to <= last.from);
	let v = prior.length - 1;
	if (prior[v]?.pos === "ADV" && !isTagVerb(prior[v])) v--;
	const verb = prior[v];
	if (!isTagVerb(verb)) return null;
	for (let start = Math.max(0, v - 4); start < v; start++) {
		const s = subjectAt(prior, start, names);
		if (s && s.end === v) return { speaker: s.speaker, kind: s.kind, verb: word(verb), inverted: false, from: prior[start]!.from, to: verb!.to };
	}
	return null;
}

/** A quote that starts a sentence, follows a tag or opens the paragraph is speech; "called it "home"" is not. */
function opensSpeech(text: string, from: number): boolean {
	const before = text.slice(0, from).trimEnd();
	return before === "" || /[.!?…:,;—–\-]["”’'*_)]*$/.test(before);
}

/** Italics covering a whole sentence of three or more words: direct thought by convention. */
function italicThoughts(raw: string): { from: number; to: number }[] {
	const out: { from: number; to: number }[] = [];
	for (const m of raw.matchAll(/(?<![*_\p{L}\p{N}])([*_])(?![*_\s])([^*_\n]+?)(?<!\s)\1(?![*_\p{L}\p{N}])/gu)) {
		const from = m.index;
		const to = from + m[0].length;
		const inner = m[2]!;
		if (inner.split(/\s+/).length < 3) continue;
		const before = raw.slice(0, from).trimEnd();
		const after = raw.slice(to).trimStart();
		const startsSentence = before === "" || /[.!?…"”]$/.test(before);
		const endsSentence = /[.!?…]$/.test(inner) || after === "" || /^[.!?…,]/.test(after);
		if (startsSentence && endsSentence) out.push({ from, to });
	}
	return out;
}

/**
 * Speech, thought and speaker evidence for one paragraph. `masked` is the paragraph with Markdown
 * blanked (same offsets), `raw` the original (for italics), `tokens` the tagged masked text.
 */
/** One line of a paragraph and its dialogue. Writers often put each speaker on their own line with no blank line between. */
export interface DialogueLine extends DialogueInfo {
	/** Paragraph offsets of the line. */
	from: number;
	to: number;
}

/**
 * Dialogue line by line: in Obsidian a single line break shows as a new line, and many writers give
 * each speaker their own line without a blank one between, so a line is the unit of dialogue.
 */
export function dialogueLines(raw: string, masked: string, tokens: Token[], names: ReadonlySet<string> = new Set()): DialogueLine[] {
	const out: DialogueLine[] = [];
	let from = 0;
	// Lines of the raw text: masking blanks "***" and headings, which still end an exchange.
	for (const line of raw.split("\n")) {
		const to = from + line.length;
		if (line.trim() !== "") out.push({ from, to, ...dialogueInfo(raw, masked, tokens, names, { from, to }) });
		from = to + 1;
	}
	return out;
}

export function dialogueInfo(raw: string, masked: string, tokens: Token[], names: ReadonlySet<string> = new Set(), window = { from: 0, to: masked.length }): DialogueInfo {
	const allWords = tokens.filter((t) => t.isWord);
	// Tags, beats and names come from this line; a tag before the line ("Tien said:") may sit on the line above.
	const words = allWords.filter((t) => t.from >= window.from && t.to <= window.to);
	const spans: SpeechSpan[] = [];
	const tagSpans: { from: number; to: number }[] = [];
	const local = masked.slice(window.from, window.to);
	for (const r of dialogueRanges(local).map((r) => ({ from: r.from + window.from, to: r.to + window.from }))) {
		if (r.to - r.from < 2 || !opensSpeech(masked, r.from)) continue;
		const nextWord = words.findIndex((w) => w.from >= r.to);
		const tag = (nextWord >= 0 ? tagAfter(words, nextWord, names) : null) ?? tagBefore(allWords, tokens, r.from, names);
		if (tag) tagSpans.push(tag);
		spans.push({ from: r.from, to: r.to, thought: !!tag && THOUGHT_VERBS.has(tag.verb), tag });
	}
	for (const r of italicThoughts(raw.slice(window.from, window.to)).map((r) => ({ from: r.from + window.from, to: r.to + window.from }))) {
		if (!spans.some((s) => r.from < s.to && r.to > s.from)) spans.push({ from: r.from, to: r.to, thought: true, tag: null });
	}
	spans.sort((a, b) => a.from - b.from);

	// Beats: people doing something in the narration ("Linh set down his cup", "The inspector frowned").
	// Only subjects count: "She looked at Linh" is about Linh, not by him.
	const actsNext = (t: Token | undefined, sentence: number) => !!t && t.sentence === sentence && (t.pos === "VERB" || t.pos === "AUX" || t.pos === "ADV");
	const beats: DialogueInfo["beats"] = [];
	const add = (speaker: string, kind: SpeakerKind) => {
		if (!beats.some((b) => b.speaker === speaker)) beats.push({ speaker, kind });
	};
	const inSpeech = (t: Token) => spans.some((s) => t.from >= s.from && t.to <= s.to);
	const inTag = (t: Token) => tagSpans.some((s) => t.from >= s.from && t.to <= s.to);
	for (let i = 0; i < words.length; i++) {
		const t = words[i]!;
		if (inSpeech(t) || inTag(t)) continue;
		if (isName(t, names)) {
			const s = subjectAt(words, i, names)!;
			if (actsNext(words[s.end], t.sentence)) add(s.speaker, "name");
			i = s.end - 1;
		} else if (t.startsSentence && DETERMINERS.has(word(t))) {
			const s = subjectAt(words, i, names);
			if (s && s.kind === "described" && actsNext(words[s.end], t.sentence)) add(s.speaker, "described");
		}
	}
	return { spans, beats, ...pronounLinks(words, spans, names) };
}

/**
 * "Shaddid looked up from her terminal. She frowned.": a subject "he" or "she" in the narration, when
 * exactly one person has been named before it in the paragraph (tags included), refers to them.
 */
function pronounLinks(words: Token[], spans: SpeechSpan[], names: ReadonlySet<string>): Pick<DialogueInfo, "pronouns" | "mentions"> {
	const out: DialogueInfo["pronouns"] = [];
	const named: string[] = [];
	const inSpeech = (t: Token) => spans.some((s) => t.from >= s.from && t.to <= s.to);
	for (let i = 0; i < words.length; i++) {
		const t = words[i]!;
		if (inSpeech(t)) continue;
		const s = isName(t, names) || TITLES.has(word(t)) ? subjectAt(words, i, names) : null;
		if (s?.kind === "name") {
			if (!named.includes(s.speaker)) named.push(s.speaker);
			i = s.end - 1;
			continue;
		}
		const w = word(t);
		if ((w === "he" || w === "she") && t.pos === "PRON" && named.length === 1) {
			const prev = words[i - 1];
			const subject = t.startsSentence || !prev || inSpeech(prev) || /^(and|but|then|so|as|while|when)$/.test(word(prev)) || /^\p{Lu}/u.test(t.text);
			if (subject && !out.some((l) => l.pronoun === w && l.speaker !== named[0])) out.push({ pronoun: w, speaker: named[0]! });
		}
	}
	return { pronouns: out, mentions: named };
}
