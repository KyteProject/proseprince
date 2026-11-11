import { excludedBlocks } from "./mask";
import { countWords } from "./outline";
import { ANNOTATION_LABELS, type AnnotationKind, type Book, type BookChapter, type SceneRecord, TO_CLEAR, toClear } from "./story";

/**
 * The manuscript: a chapter, or the whole book, as one clean Markdown note for export. It is a copy,
 * made fresh each time and never edited by hand: the scenes stay the only place the book is written.
 * Nothing is reworded. What is left out is what was never the story (properties, comments, callouts,
 * headings, fix-later lines), and the marks the writer leaves for himself come off the words they sit on.
 */

const HEADING = /^\s*#{1,6}\s/;
const LIST = /^\s*(?:[-*+]|\d+[.)])\s/;
/** A scene break on a line of its own: `***`, `---`, `* * *`. */
const BREAK = /^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
/** A task line under the prose is a note to the writer, ticked or not. */
const TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\](?:\s|$)/;

/**
 * One scene's prose as the reader gets it: the same lines the word count counts, less fix-later
 * lines. Comments go, with the space before them; `==highlight==` and `@@` lose their marks and keep
 * their words; a link reads as its text; a tag goes. Emphasis, a scene break between two stretches of
 * prose and a `[placeholder]` stay exactly as written.
 */
export function cleanProse(raw: string): string {
	const text = raw.replace(/\r\n?/g, "\n");
	const excluded = excludedBlocks(text);
	const paragraphs: string[][] = [[]];
	let offset = 0;
	let block = 0;
	for (const line of text.split("\n")) {
		const from = offset;
		offset += line.length + 1;
		while (block < excluded.length && excluded[block]!.to <= from) block++;
		if (block < excluded.length && excluded[block]!.from <= from) continue;
		if (line.trim() === "") paragraphs.push([]);
		else if (!HEADING.test(line) && !TASK.test(line)) paragraphs[paragraphs.length - 1]!.push(line);
	}
	const out: string[] = [];
	for (const lines of paragraphs) {
		if (!lines.length) continue;
		const cleaned = lines.join("\n")
			// A comment can run over a line break inside a paragraph.
			.replace(/[ \t]*%%[\s\S]*?%%/g, "")
			.replace(/[ \t]*<!--[\s\S]*?-->/g, "")
			.replace(/!\[\[[^\]\n]*\]\]/g, "")
			.replace(/\[\[[^\]|\n]+\|([^\]\n]+)\]\]/g, "$1")
			.replace(/\[\[([^\]\n]+)\]\]/g, "$1")
			.replace(/==([^=\n]+)==/g, "$1")
			.replace(/@@/g, "")
			// A tag has a letter in it: "#4" is a number, and stays.
			.replace(/(^|[ \t])#(?=[\p{N}_\-/]*\p{L})[\p{L}\p{N}_\-/]+/gmu, "")
			.split("\n")
			.map((line) => (LIST.test(line) ? line.trimEnd() : line.trim()).replace(/(?<=\S)[ \t]{2,}/g, " "))
			.filter((line) => line !== "");
		if (cleaned.length) out.push(cleaned.join("\n"));
	}
	// A break with nothing on one side of it divides nothing: one left above the notes at the foot of a scene, say.
	const kept = out.filter((p, i) => !BREAK.test(p) || (i > 0 && !BREAK.test(out[i - 1]!)));
	while (kept.length && BREAK.test(kept[kept.length - 1]!)) kept.pop();
	return kept.join("\n\n");
}

/** What a scene still carries that a reader of the manuscript shouldn't meet, or that isn't settled. */
export interface InTheWay {
	scene: SceneRecord;
	counts: [kind: AnnotationKind, n: number][];
	total: number;
}

export interface Compiled {
	/** The note's name, without its extension. */
	name: string;
	text: string;
	/** Prose words in the manuscript. */
	words: number;
	chapters: number;
	scenes: number;
	/** In reading order: only scenes that are in the manuscript. */
	inTheWay: InTheWay[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const safe = (name: string) => name.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim();

/** A chapter's heading in the manuscript: "Chapter 4: The Job". */
export const chapterHeading = (c: Pick<BookChapter, "number" | "title">) => `Chapter ${c.number}${c.title ? `: ${c.title}` : ""}`;

/** What is in the way, said in a line: "3 notes to file, 1 placeholder". */
export function inTheWayLabel(counts: readonly [AnnotationKind, number][]): string {
	return counts.map(([k, n]) => `${n.toLocaleString()} ${ANNOTATION_LABELS[k][n === 1 ? 0 : 1]}`).join(", ");
}

/** The counts of everything in the way, over all the scenes given. */
export function inTheWayTotals(rows: readonly InTheWay[]): [AnnotationKind, number][] {
	return TO_CLEAR.map((k) => [k, rows.reduce((n, r) => n + (r.counts.find(([kind]) => kind === k)?.[1] ?? 0), 0)] as [AnnotationKind, number]).filter(([, n]) => n);
}

/**
 * Compile a chapter, or the whole book: chapter headings, each written scene's prose in reading
 * order, and a scene break between scenes. Null when nothing is written.
 * @param texts each scene's note as it is now, by path; a scene without one is left out.
 * @param written when it is compiled: `2026-11-10 22:58`.
 */
export function compile(book: Book, texts: ReadonlyMap<string, string>, options: { chapter?: number; written: string }): Compiled | null {
	const { chapter, written } = options;
	const parts: string[] = [];
	const inTheWay: InTheWay[] = [];
	let words = 0;
	let scenes = 0;
	let first: BookChapter | undefined;
	for (const c of book.chapters) {
		if (chapter !== undefined && c.number !== chapter) continue;
		const prose: string[] = [];
		for (const scene of c.scenes) {
			const text = texts.get(scene.path);
			const clean = text === undefined ? "" : cleanProse(text);
			if (!clean) continue;
			prose.push(clean);
			words += countWords(clean);
			scenes++;
			const counts = TO_CLEAR.map((k) => [k, scene.annotations[k]] as [AnnotationKind, number]).filter(([, n]) => n);
			if (counts.length) inTheWay.push({ scene, counts, total: toClear(scene.annotations) });
		}
		if (!prose.length) continue;
		first ??= c;
		parts.push(`# ${chapterHeading(c)}\n\n${prose.join("\n\n***\n\n")}\n`);
	}
	if (!parts.length || !first) return null;
	const head = [
		"---",
		"proseprince: false",
		`written: ${written.replace(" ", "T")}`,
		`words: ${words}`,
		// In the properties, where an export leaves it behind: a comment in the page would be exported with the prose.
		"note: \"Made by ProsePrince from your scenes. It is replaced whole each time, so change the scenes and never this.\"",
		"---",
	];
	return {
		name: safe(chapter === undefined ? "Manuscript" : `Manuscript ${pad(first.number)}${first.title ? ` ${first.title}` : ""}`),
		text: `${head.join("\n")}\n\n${parts.join("\n")}`,
		words,
		chapters: parts.length,
		scenes,
		inTheWay,
	};
}
