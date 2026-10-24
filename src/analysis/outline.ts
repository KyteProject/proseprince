import type { Range } from "./mask";
import { maskInline } from "./mask";
import { ECHO_STOP_LEMMAS } from "./wordlists";

/**
 * The note's outline for the sidebar: headings (a title and its beats) and prose-only counts. Prose
 * means what a reader would read: no frontmatter, `%% … %%` comments, code, headings or callouts.
 */

export interface Heading {
	level: number;
	text: string;
	/** Document offsets of the heading line. */
	from: number;
	to: number;
}

/** Headings outside frontmatter and code blocks, in order. */
export function headingsIn(doc: string, excluded: readonly Range[]): Heading[] {
	const out: Heading[] = [];
	let at = 0;
	for (const line of doc.split("\n")) {
		const from = at;
		at += line.length + 1;
		const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
		if (!m || excluded.some((r) => from >= r.from && from < r.to)) continue;
		out.push({ level: m[1]!.length, text: m[2]!.replace(/[*_`]|%%.*?%%/g, "").trim(), from, to: from + line.length });
	}
	return out;
}

/** Headings and callouts (`> [!todo]`) aren't prose: they're labels and notes to the writer. */
export const isProseLine = (line: string) => line.trim() !== "" && !/^\s*#{1,6}\s/.test(line) && !/^\s*>/.test(line);

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export interface ProseCount {
	words: number;
	/** Characters including spaces, as Obsidian counts them, after hidden comments and Markdown are removed. */
	characters: number;
}

/** Words and characters in one line of prose (zero for headings and callouts). */
export function countLine(line: string): ProseCount {
	if (!isProseLine(line)) return { words: 0, characters: 0 };
	const text = maskInline(line).replace(/\s+/g, " ").trim();
	return { words: text.match(WORD)?.length ?? 0, characters: text.length };
}

export const countWords = (text: string) => text.match(WORD)?.length ?? 0;

/** Average adult silent reading speed for fiction, words a minute. */
export const READING_WPM = 230;

/**
 * Which headings are the title and which are beats: a single `#` heading is the note's title and
 * everything else is a beat (indented by level). With several `#` headings, they are beats too.
 */
export function beatsOf(headings: readonly Heading[]): { title: Heading | null; beats: Heading[] } {
	const h1 = headings.filter((h) => h.level === 1);
	if (h1.length === 1) return { title: h1[0]!, beats: headings.filter((h) => h !== h1[0]) };
	return { title: null, beats: [...headings] };
}

/** Index of the beat containing a document offset: the last beat starting at or before it, -1 before the first. */
export function beatAt(beats: readonly Heading[], pos: number): number {
	let found = -1;
	beats.forEach((b, i) => {
		if (b.from <= pos) found = i;
	});
	return found;
}

/** Tags that are meant to be invisible: repeating them is the point. */
const PLAIN_TAGS = new Set(["said", "says", "asked", "asks", "replied"]);

/**
 * The note's most used content words (nouns, verbs, adjectives, adverbs), leaving out names, world
 * terms, very common words and anything shorter than four letters. "door" and "doors" count together.
 */
export function repeatedWords(words: readonly string[], exclude: ReadonlySet<string>, limit = 12, min = 3): { word: string; n: number }[] {
	const counts = new Map<string, number>();
	for (const raw of words) {
		const w = raw.toLowerCase().replace(/[’']s$/, "");
		if (w.length < 4 || ECHO_STOP_LEMMAS.has(w) || PLAIN_TAGS.has(w) || exclude.has(w)) continue;
		counts.set(w, (counts.get(w) ?? 0) + 1);
	}
	// Fold simple plurals into their singular when both appear.
	for (const [w, n] of [...counts]) {
		const singular = w.endsWith("s") ? w.slice(0, -1) : null;
		if (singular && counts.has(singular)) {
			counts.set(singular, counts.get(singular)! + n);
			counts.delete(w);
		}
	}
	return [...counts].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([word, n]) => ({ word, n }));
}
