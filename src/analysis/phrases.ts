import { tag } from "./tagger";
import { POSSESSIVES } from "./wordlists";
import type { Token, UposTag } from "./types";

/**
 * Phrase matching over tagged word tokens. Phrases are tokenised with the same tagger as the
 * text (so "a day's work" splits exactly like the prose does), stored in a trie keyed by word
 * stems, and matched longest-first without crossing sentence boundaries. Stems come from the
 * tagger's lemma, so one entry covers inflections and irregular forms: "bite the bullet" also
 * finds "bit", "bites" and "biting the bullet"; "take a toll" finds "took a toll".
 */

const POSS = "<poss>";
const POSS_PLACEHOLDER = "his";
const ARTICLES = new Set(["a", "an", "the"]);

export interface PhraseEntry<T> {
	/** The phrase as written in the lexicon. */
	phrase: string;
	/** Word index range [start, end) to highlight; defaults to the whole phrase. */
	target: [number, number];
	/** For single-word entries: required part-of-speech tags. */
	pos?: readonly UposTag[];
	value: T;
}

export interface PhraseMatch<T> {
	entry: PhraseEntry<T>;
	/** Word-token indices [start, end) of the whole phrase. */
	start: number;
	end: number;
	/** Offsets of the highlighted part. */
	from: number;
	to: number;
}

interface Node<T> {
	next: Map<string, Node<T>>;
	entries: PhraseEntry<T>[];
}

const normalise = (s: string) => s.toLowerCase().replace(/[’ʼ‘]/g, "'");

/** Crude English stem, enough to make "wave"/"waves"/"waved"/"waving" collide. */
export function stem(word: string): string {
	let w = normalise(word);
	if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
	else if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
	else if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
	if (w.length > 4 && w.endsWith("ing")) w = w.slice(0, -3);
	else if (w.length > 3 && w.endsWith("ed") && !w.endsWith("eed")) w = w.slice(0, -2);
	if (w.length > 3 && /([bdfgklmnprstz])\1$/.test(w)) w = w.slice(0, -1);
	if (w.length > 3 && w.endsWith("e") && !w.endsWith("ee")) w = w.slice(0, -1);
	return w;
}

/** Trie keys a text token can match. */
function tokenKeys(t: Token): Set<string> {
	const form = normalise(t.text);
	const keys = new Set([stem(t.lemma), stem(form)]);
	if (POSSESSIVES.has(form)) keys.add(POSS);
	return keys;
}

/** Tokenise a lexicon phrase in context, keeping track of a bracketed target and <poss> slots. */
function phraseKeys(phrase: string): { keys: string[]; target: [number, number] } {
	let plain = "";
	let targetFrom = -1;
	let targetTo = -1;
	const possAt: number[] = [];
	for (const part of phrase.split(/(\[|\]|<poss>)/)) {
		if (part === "[") targetFrom = plain.length;
		else if (part === "]") targetTo = plain.length;
		else if (part === POSS) {
			possAt.push(plain.length);
			plain += POSS_PLACEHOLDER;
		} else plain += part;
	}
	const words = tag(plain).filter((t) => t.isWord);
	// Any possessive in a phrase stands for all of them: "ace up your sleeve" matches "ace up his sleeve".
	const keys = words.map((t) => (possAt.includes(t.from) || POSSESSIVES.has(normalise(t.text)) ? POSS : stem(t.lemma)));
	if (targetFrom === -1) return { keys, target: [0, keys.length] };
	const start = words.findIndex((t) => t.from >= targetFrom);
	const end = words.findIndex((t) => t.from >= targetTo);
	return { keys, target: [start, end === -1 ? words.length : end] };
}

export class PhraseMatcher<T> {
	private readonly root: Node<T> = { next: new Map(), entries: [] };

	/** Entries are "phrase" or "word@POS" (single word with a part-of-speech guard). */
	constructor(entries: Iterable<readonly [phrase: string, value: T]>) {
		for (const [raw, value] of entries) {
			const [phrase, posSpec] = raw.split("@") as [string, string | undefined];
			const { keys, target } = phraseKeys(phrase.trim());
			if (keys.length === 0) continue;
			const pos = posSpec ? (posSpec.split("|") as UposTag[]) : undefined;
			this.insert(keys, { phrase: raw, target, pos, value });
			// A leading article is optional for longer phrases: "an arm and a leg" also matches "arm and a leg".
			if (keys.length >= 3 && ARTICLES.has(keys[0]!)) {
				this.insert(keys.slice(1), { phrase: raw, target: [Math.max(0, target[0] - 1), target[1] - 1], pos, value });
			}
		}
	}

	private insert(keys: string[], entry: PhraseEntry<T>): void {
		let node = this.root;
		for (const k of keys) {
			let child = node.next.get(k);
			if (!child) node.next.set(k, (child = { next: new Map(), entries: [] }));
			node = child;
		}
		node.entries.push(entry);
	}

	/** Non-overlapping matches, longest first, left to right. `words` must be word tokens only. */
	findAll(words: readonly Token[], accept: (m: PhraseMatch<T>) => boolean = () => true): PhraseMatch<T>[] {
		const out: PhraseMatch<T>[] = [];
		let i = 0;
		while (i < words.length) {
			const match = this.longestAt(words, i, accept);
			if (match) {
				out.push(match);
				i = match.end;
			} else i++;
		}
		return out;
	}

	private longestAt(words: readonly Token[], start: number, accept: (m: PhraseMatch<T>) => boolean): PhraseMatch<T> | null {
		let best: PhraseMatch<T> | null = null;
		const visit = (node: Node<T>, j: number) => {
			for (const entry of node.entries) {
				if (entry.pos && (j - start !== 1 || !entry.pos.includes(words[start]!.pos))) continue;
				const m: PhraseMatch<T> = {
					entry,
					start,
					end: j,
					from: words[start + entry.target[0]]!.from,
					to: words[start + entry.target[1] - 1]!.to,
				};
				if ((!best || m.end > best.end) && accept(m)) best = m;
			}
			const t = words[j];
			if (!t || (j > start && t.sentence !== words[start]!.sentence)) return;
			for (const key of tokenKeys(t)) {
				const child = node.next.get(key);
				if (child) visit(child, j + 1);
			}
		};
		visit(this.root, start);
		return best;
	}
}
