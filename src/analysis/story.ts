import { excludedBlocks, type Range } from "./mask";
import { maskInline } from "./mask";
import { beatNotes, beatsOf, countLine, headingsIn, isProseLine } from "./outline";

/**
 * The book, derived from the notes: chapters and scenes from file names, a chapter's beats from its
 * chapter note, the writer's own annotations, and promises made, progressed and paid. Nothing here
 * detects anything: every row comes from something the writer (or their filing pipeline) wrote.
 */

export interface SceneName {
	chapter: number;
	/** 0 for a chapter note (`04.00 - The Job`). */
	scene: number;
	title: string;
}

/** `04.02 - Breakfast Bar`, `01.02 The processing`, `04.00 - The Job`; null for any other name. */
export function parseSceneName(basename: string): SceneName | null {
	const m = /^(\d{1,3})\.(\d{1,3})(?:\s*[-–—:]\s*|\s+|$)(.*)$/.exec(basename.trim());
	if (!m) return null;
	return { chapter: Number(m[1]), scene: Number(m[2]), title: m[3]!.trim() };
}

// ── Annotations ────────────────────────────────────────────────────────────────

export const ANNOTATION_KINDS = ["note", "question", "todo", "check", "fix", "stumble", "placeholder", "filed", "checked"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

/** The kinds that are still work to do; `filed` and `checked` are what the pipeline leaves behind. */
export const TO_CLEAR: readonly AnnotationKind[] = ["note", "question", "todo", "check", "fix", "stumble", "placeholder"];

export interface Annotation {
	kind: AnnotationKind;
	/** Document offset to jump to. */
	from: number;
	text: string;
	/** The notes a `filed` or `checked` comment names. */
	links?: string[];
}

const CALLOUT = /^\s*(?:>\s*)+\[!(\w+)\][-+]?\s*(.*)$/;
const CALLOUT_KINDS: Record<string, AnnotationKind> = { note: "note", question: "question", todo: "todo", filed: "filed" };
const HANDLED = /%%\s*(filed|checked)\s*(?:→|->|=>)\s*(.*?)\s*%%/gi;
const TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[ \]\s*(.*)$/;
/** A bracket left in the prose: `[FIX: …]`, `[world name]`. Not a link, an embed, a footnote or a task box. */
const PLACEHOLDER = /(?<![[!\]])\[(?!\[|\^|!|[ xX]\])([^\][\n]{1,80})\](?![[(\]])/g;

/**
 * Every annotation in a note, in document order:
 * - `> [!note]` a fact to file, `> [!question]` an open loop, `> [!todo]` a fix (or `check:` a claim);
 * - `%% filed → [[x]] %%` and `%% checked → [[x]] %%`, already handled;
 * - `- [ ]` on a prose line, `==highlight==` or `@@` at a stumble, a `[bracket]` left to fill, `#openloop`.
 * Only a callout's first line counts. Frontmatter, code and multi-line comments are skipped.
 */
export function annotationsIn(doc: string, excluded: readonly Range[] = excludedBlocks(doc)): Annotation[] {
	const out: Annotation[] = [];
	let offset = 0;
	let block = 0;
	for (const line of doc.split("\n")) {
		const from = offset;
		offset += line.length + 1;
		while (block < excluded.length && excluded[block]!.to <= from) block++;
		const hidden = block < excluded.length && excluded[block]!.from <= from;
		if (hidden) {
			// Only a quote block holds callouts: the same line inside code or a comment is just text.
			const start = excluded[block]!.from;
			if (!doc.slice(start, doc.indexOf("\n", start) < 0 ? doc.length : doc.indexOf("\n", start)).trimStart().startsWith(">")) continue;
			const callout = CALLOUT.exec(line);
			const kind = callout ? CALLOUT_KINDS[callout[1]!.toLowerCase()] : undefined;
			if (callout && kind) out.push({ kind: kind === "todo" && /^check\s*:/i.test(callout[2]!) ? "check" : kind, from, text: callout[2]!.replace(/#openloop\b/gi, "").trim() });
			continue;
		}
		for (const m of line.matchAll(HANDLED)) {
			const links = [...m[2]!.matchAll(/\[\[([^\]\n]+)\]\]/g)].map((l) => linkTarget(l[1]!)).filter(Boolean);
			out.push({ kind: m[1]!.toLowerCase() as "filed" | "checked", from: from + m.index, text: m[2]!.replace(/\[\[|\]\]/g, ""), links: links.length ? links : [m[2]!.trim()].filter(Boolean) });
		}
		// Comments keep their length, so offsets stay true.
		const clean = line.replace(/%%.*?%%/g, (c) => " ".repeat(c.length));
		const task = TASK.exec(clean);
		if (task) out.push({ kind: "fix", from, text: task[1]!.trim() });
		for (const m of clean.matchAll(/==([^=\n]+)==/g)) out.push({ kind: "stumble", from: from + m.index, text: m[1]!.trim() });
		// `@@` marks a spot, or wraps a phrase: a pair is one stumble.
		[...clean.matchAll(/@@/g)].forEach((m, i) => {
			if (i % 2 === 0) out.push({ kind: "stumble", from: from + m.index, text: clean.slice(m.index + 2, m.index + 42).split("@@")[0]!.trim() });
		});
		let loopInBracket = false;
		for (const m of clean.matchAll(PLACEHOLDER)) {
			out.push({ kind: "placeholder", from: from + m.index, text: m[1]!.trim() });
			if (/#openloop\b/i.test(m[1]!)) loopInBracket = true;
		}
		const loop = /#openloop\b/i.exec(clean);
		if (loop && !loopInBracket) out.push({ kind: "question", from: from + loop.index, text: clean.replace(/#openloop\b/i, "").trim() });
	}
	return out.sort((a, b) => a.from - b.from);
}

export function countAnnotations(list: readonly Annotation[]): Record<AnnotationKind, number> {
	const counts = Object.fromEntries(ANNOTATION_KINDS.map((k) => [k, 0])) as Record<AnnotationKind, number>;
	for (const a of list) counts[a.kind]++;
	return counts;
}

export const toClear = (counts: Record<AnnotationKind, number>) => TO_CLEAR.reduce((n, k) => n + counts[k], 0);

// ── Frontmatter ────────────────────────────────────────────────────────────────

/** A frontmatter list as clean strings: an empty `- ` entry, `[[links]]` and blanks all fall away. */
export function asNames(v: unknown): string[] {
	const items: unknown[] = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : v === null || v === undefined ? [] : [v];
	return items.map((x) => (x === null || x === undefined ? "" : String(x).replace(/\[\[(?:[^\]|]*\|)?|\]\]/g, "").trim())).filter(Boolean);
}

const asText = (v: unknown): string | undefined => asNames(Array.isArray(v) ? v : v === null || v === undefined ? [] : [String(v)]).join(", ") || undefined;

/** A pass flag's date, `YYYY-MM-DD`, or undefined when the flag is empty. */
function asDate(v: unknown): string | undefined {
	if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
	const s = v === null || v === undefined ? "" : String(v).trim();
	return s || undefined;
}

function asCount(v: unknown): number | undefined {
	const n = Number(String(v ?? "").replace(/[,"\s]/g, ""));
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

// ── Cards and chapter outlines ─────────────────────────────────────────────────

/**
 * The `key: value` lines of a hidden card (`%%Beat. … %%`, `%%Card. … %%`), as written, with the
 * card's label. Empty lines and list items under a key (an `outline:`) are left out.
 */
export function cardLines(block: string): { label: string | null; lines: [string, string][] } {
	const rows = block.split("\n");
	const first = rows.findIndex((r) => r.trim() !== "");
	const label = first < 0 ? null : (/^\s*\**([A-Za-z]+)\**(?:\.|\s*$)/.exec(rows[first]!)?.[1] ?? null);
	const lines: [string, string][] = [];
	for (const row of rows.slice(label ? first + 1 : 0)) {
		const m = /^(?:[-*]\s+)?\**([^:*\n]{1,40}?)\**\s*:\**\s*(\S.*?)\s*$/.exec(row);
		// Indented lines are a list under a key (an outline), not card lines of their own.
		if (m && !/^(?:\t| {2,})/.test(row)) lines.push([m[1]!.trim(), m[2]!]);
	}
	return { label, lines };
}

/** The card in a stretch of a note: the block labelled `label`, else the first block with card lines. */
function cardIn(section: string, label: string): [string, string][] {
	const cards = [...section.matchAll(/%%([\s\S]*?)%%/g)].map((m) => cardLines(m[1]!));
	// An unlabelled block only counts when it reads like a card: a speaker pin or a "not here" comment doesn't.
	const cardLike = (c: (typeof cards)[number]) => c.label === null && c.lines.some(([key]) => /^(target|who|change)$/i.test(key));
	return (cards.find((c) => c.label?.toLowerCase() === label) ?? cards.find(cardLike))?.lines ?? [];
}

/** The note a `[[link]]` points at: no folder, heading, alias or extension. */
export function linkTarget(inner: string): string {
	return inner.split("|")[0]!.split("#")[0]!.split("/").pop()!.replace(/\.md$/i, "").trim();
}

export interface ChapterBeat {
	text: string;
	target?: number;
	change?: string;
	who?: string[];
	/** The beat's card, line by line, as written. */
	card: [string, string][];
	/** Notes linked from the beat's section: its scenes. */
	links: string[];
}

/** A chapter note's plan: its title, its own card, and each heading as a beat with its card and scene links. */
export function chapterOutline(doc: string): { title: string | null; card: [string, string][]; beats: ChapterBeat[] } {
	const headings = headingsIn(doc, excludedBlocks(doc));
	const { title, beats } = beatsOf(headings);
	const notes = beatNotes(doc, beats);
	const sorted = [...beats].sort((a, b) => a.from - b.from);
	return {
		title: title?.text ?? null,
		card: cardIn(doc.slice(0, sorted[0]?.from ?? doc.length), "card"),
		beats: beats.map((h, i) => {
			const next = sorted.find((o) => o.from > h.from);
			const section = doc.slice(h.to, next ? next.from : doc.length);
			const links = [...section.replace(/%%[\s\S]*?%%/g, "").matchAll(/\[\[([^\]\n]+)\]\]/g)].map((m) => linkTarget(m[1]!)).filter(Boolean);
			return { text: h.text, ...notes[i], card: cardIn(section, "beat"), links: [...new Set(links)] };
		}),
	};
}

// ── Records ────────────────────────────────────────────────────────────────────

export interface SceneRecord {
	path: string;
	basename: string;
	name: SceneName;
	kind: "chapter" | "scene";
	/** Prose words. A chapter note is a plan, so its own words never count towards the book. */
	words: number;
	target?: number;
	summary?: string;
	pov?: string;
	characters: string[];
	setting?: string;
	day?: string;
	promises: string[];
	progresses: string[];
	pays: string[];
	flags: { dev?: string; line?: string; continuity?: string };
	annotations: Record<AnnotationKind, number>;
	/** The notes this scene's `%% filed → [[note]] %%` comments name, one entry per comment. */
	filed: string[];
	/** The first line of each `> [!note]` still waiting to be filed. */
	unfiled: string[];
	/** A chapter note's plan. */
	outline?: ReturnType<typeof chapterOutline>;
}

/** The lines of a note outside frontmatter, code, comments and callouts. */
function proseLines(text: string, excluded: readonly Range[]): string[] {
	const out: string[] = [];
	let offset = 0;
	let block = 0;
	for (const line of text.split("\n")) {
		const from = offset;
		offset += line.length + 1;
		while (block < excluded.length && excluded[block]!.to <= from) block++;
		if (!(block < excluded.length && excluded[block]!.from <= from)) out.push(line);
	}
	return out;
}

/** A note's prose as the reader gets it, for finding names in: no headings, comments, callouts or Markdown. */
export function proseOf(text: string, excluded: readonly Range[] = excludedBlocks(text)): string {
	return proseLines(text, excluded).filter(isProseLine).map((line) => maskInline(line).replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

/** What the book needs from one note, or null when its name isn't `chapter.scene`. */
export function sceneRecord(path: string, basename: string, text: string, frontmatter: Record<string, unknown>): SceneRecord | null {
	const name = parseSceneName(basename);
	if (!name) return null;
	const excluded = excludedBlocks(text);
	let words = 0;
	for (const line of proseLines(text, excluded)) words += countLine(line).words;
	const kind = name.scene === 0 ? "chapter" : "scene";
	const annotations = annotationsIn(text, excluded);
	return {
		path, basename, name, kind, words,
		target: asCount(frontmatter.target),
		summary: asText(frontmatter.summary),
		pov: asText(frontmatter.pov),
		characters: asNames(frontmatter.characters),
		setting: asText(frontmatter.setting),
		day: asText(frontmatter.day),
		promises: asNames(frontmatter.promises),
		progresses: asNames(frontmatter.progresses),
		pays: asNames(frontmatter.pays),
		flags: { dev: asDate(frontmatter.dev), line: asDate(frontmatter.line), continuity: asDate(frontmatter.continuity) },
		annotations: countAnnotations(annotations),
		filed: annotations.filter((a) => a.kind === "filed").flatMap((a) => a.links ?? []),
		unfiled: annotations.filter((a) => a.kind === "note").map((a) => a.text).filter(Boolean),
		...(kind === "chapter" ? { outline: chapterOutline(text) } : {}),
	};
}

// ── The book ───────────────────────────────────────────────────────────────────

export interface BookBeat {
	text: string;
	target?: number;
	change?: string;
	who?: string[];
	card: [string, string][];
	scenes: SceneRecord[];
	words: number;
}

export interface BookChapter {
	number: number;
	/** The chapter note, when the chapter has one. */
	note: SceneRecord | null;
	title: string;
	/** The chapter note's beats, in outline order, with the scenes attached to each. */
	beats: BookBeat[];
	/** Scenes of this chapter that no beat claims. */
	unplanned: SceneRecord[];
	/** Every scene of the chapter, in reading order. */
	scenes: SceneRecord[];
	words: number;
	target?: number;
	/** The outline lists scenes in a different order from their numbers. */
	outOfOrder: boolean;
}

export type PromiseStatus = "open" | "progressing" | "paid" | "paid-before-made" | "never-made";

export interface PromiseRef {
	path: string;
	/** What to call the place: a scene's name, or the chapter's when the promise belongs to the chapter. */
	label: string;
	chapter: number;
	scene: number;
	/** How many scenes of the chapter repeat the same promise, when more than one does. */
	repeats?: number;
}

export interface PromiseRow {
	name: string;
	made: PromiseRef[];
	progressed: PromiseRef[];
	paid: PromiseRef[];
	status: PromiseStatus;
}

export interface Book {
	chapters: BookChapter[];
	/** Every scene, in reading order. */
	scenes: SceneRecord[];
	promises: PromiseRow[];
	words: number;
	/** Where each scene sits, by path. */
	places: Map<string, { chapter: BookChapter; beat: BookBeat | null }>;
}

export const EMPTY_BOOK: Book = { chapters: [], scenes: [], promises: [], words: 0, places: new Map() };

const fold = (s: string) => s.trim().toLowerCase();
const pad = (n: number) => String(n).padStart(2, "0");
export const sceneLabel = (r: SceneRecord) => `${pad(r.name.chapter)}.${pad(r.name.scene)} ${r.name.title}`.trim();

/**
 * Chapters and scenes in reading order (file names), each chapter's beats from its chapter note, and
 * each scene attached to a beat: by a link under the beat, else by a title matching the beat's
 * heading, else left as unplanned.
 */
export function buildBook(records: readonly SceneRecord[]): Book {
	const order = (a: SceneRecord, b: SceneRecord) => a.name.chapter - b.name.chapter || a.name.scene - b.name.scene || a.basename.localeCompare(b.basename);
	const scenes = records.filter((r) => r.kind === "scene").sort(order);
	const byName = new Map(scenes.map((s) => [fold(s.basename), s]));
	const numbers = [...new Set(records.map((r) => r.name.chapter))].sort((a, b) => a - b);
	const claimed = new Set<SceneRecord>();
	const places: Book["places"] = new Map();

	const chapters = numbers.map((number): BookChapter => {
		const note = records.find((r) => r.kind === "chapter" && r.name.chapter === number) ?? null;
		const own = scenes.filter((s) => s.name.chapter === number);
		const beats: BookBeat[] = (note?.outline?.beats ?? []).map((b) => ({ text: b.text, target: b.target, change: b.change, who: b.who, card: b.card, scenes: [], words: 0 }));
		const claim = (beat: BookBeat, scene: SceneRecord | undefined) => {
			if (!scene || claimed.has(scene)) return;
			claimed.add(scene);
			beat.scenes.push(scene);
		};
		// Links first: they survive renames. Then titles, for scenes named after their beat.
		(note?.outline?.beats ?? []).forEach((b, i) => b.links.forEach((link) => claim(beats[i]!, byName.get(fold(link)))));
		for (const beat of beats) for (const s of own) if (fold(s.name.title) === fold(beat.text)) claim(beat, s);
		for (const beat of beats) beat.words = beat.scenes.reduce((n, s) => n + s.words, 0);
		const listed = beats.flatMap((b) => b.scenes);
		const chapter: BookChapter = {
			number, note, beats,
			title: note?.outline?.title ?? note?.name.title ?? "",
			unplanned: [],
			scenes: own,
			words: own.reduce((n, s) => n + s.words, 0),
			target: note?.target,
			outOfOrder: listed.some((s, i) => i > 0 && order(listed[i - 1]!, s) > 0),
		};
		for (const beat of beats) for (const s of beat.scenes) places.set(s.path, { chapter, beat });
		return chapter;
	});
	for (const chapter of chapters) {
		chapter.unplanned = chapter.scenes.filter((s) => !claimed.has(s));
		for (const s of chapter.unplanned) places.set(s.path, { chapter, beat: null });
	}
	return { chapters, scenes, promises: promiseRows(records, chapters), words: scenes.reduce((n, s) => n + s.words, 0), places };
}

const STATUS_ORDER: PromiseStatus[] = ["never-made", "paid-before-made", "open", "progressing", "paid"];

/**
 * One row per promise name. Open: made and not paid. Progressing: made, moved on, not paid. The two
 * warnings are usually a slip in the name: paid before it was made, or paid (or progressed) and never
 * made. A promise made by several scenes of one chapter is shown once, for the chapter.
 */
function promiseRows(records: readonly SceneRecord[], chapters: readonly BookChapter[]): PromiseRow[] {
	const titleOf = (n: number) => chapters.find((c) => c.number === n)?.title ?? "";
	const rows = new Map<string, PromiseRow>();
	const row = (name: string) => {
		const key = fold(name);
		if (!rows.has(key)) rows.set(key, { name: name.trim(), made: [], progressed: [], paid: [], status: "open" });
		return rows.get(key)!;
	};
	const ref = (r: SceneRecord): PromiseRef => ({
		path: r.path,
		label: r.kind === "chapter" ? `Chapter ${r.name.chapter}${titleOf(r.name.chapter) ? `: ${titleOf(r.name.chapter)}` : ""}` : sceneLabel(r),
		chapter: r.name.chapter,
		scene: r.name.scene,
	});
	const ordered = [...records].sort((a, b) => a.name.chapter - b.name.chapter || a.name.scene - b.name.scene);
	for (const r of ordered) {
		for (const name of new Set(r.promises.map(fold))) {
			const made = row(r.promises.find((p) => fold(p) === name)!).made;
			const same = made.find((m) => m.chapter === r.name.chapter);
			// The same promise again in the same chapter: one promise, repeated in the frontmatter.
			if (same) {
				same.repeats = (same.repeats ?? 1) + 1;
				same.label = `Chapter ${same.chapter}${titleOf(same.chapter) ? `: ${titleOf(same.chapter)}` : ""}`;
			} else made.push(ref(r));
		}
		for (const name of new Set(r.progresses.map(fold))) row(r.progresses.find((p) => fold(p) === name)!).progressed.push(ref(r));
		for (const name of new Set(r.pays.map(fold))) row(r.pays.find((p) => fold(p) === name)!).paid.push(ref(r));
	}
	const before = (a: PromiseRef, b: PromiseRef) => a.chapter < b.chapter || (a.chapter === b.chapter && a.scene < b.scene);
	for (const r of rows.values()) {
		const first = r.made[0];
		if (!first) r.status = "never-made";
		else if (r.paid.some((p) => before(p, first))) r.status = "paid-before-made";
		else if (r.paid.length) r.status = "paid";
		else if (r.progressed.length) r.status = "progressing";
	}
	const at = (r: PromiseRow) => r.made[0] ?? r.progressed[0] ?? r.paid[0]!;
	return [...rows.values()].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || at(a).chapter - at(b).chapter || at(a).scene - at(b).scene || a.name.localeCompare(b.name));
}

/** The status of each promise a scene makes, progresses or pays, for the scene's own card. */
export function scenePromises(book: Book, r: SceneRecord): { role: "Makes" | "Progresses" | "Pays"; name: string; status: PromiseStatus }[] {
	const status = (name: string) => book.promises.find((p) => fold(p.name) === fold(name))?.status ?? "open";
	return [
		...r.promises.map((name) => ({ role: "Makes" as const, name, status: status(name) })),
		...r.progresses.map((name) => ({ role: "Progresses" as const, name, status: status(name) })),
		...r.pays.map((name) => ({ role: "Pays" as const, name, status: status(name) })),
	];
}

/** The number for the next scene file of a chapter. */
export function nextSceneNumber(names: readonly SceneName[], chapter: number): number {
	return Math.max(0, ...names.filter((n) => n.chapter === chapter).map((n) => n.scene)) + 1;
}

/** `04.03 - Tien's Office`: a file name for a new scene, with characters a file system refuses taken out. */
export function sceneFileName(chapter: number, scene: number, title: string): string {
	const clean = title.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim();
	return `${pad(chapter)}.${pad(scene)}${clean ? ` - ${clean}` : ""}`;
}

/** The note a new scene starts from when the vault has no template of its own. */
export const SCENE_TEMPLATE = "---\ntype: draft\npov:\ncharacters:\n  - \nsetting:\nday:\nsummary:\npromises:\n  - \nprogresses:\n  - \npays:\n  - \ndev:\nline:\ncontinuity:\n---\n# {{title}}\n\n";

const yamlScalar = (s: string) => (/^[\p{L}\p{N}][\p{L}\p{N} '’._-]*$/u.test(s) ? s : JSON.stringify(s));

/**
 * A new scene's text from a template: `{{title}}` and `{{date}}` filled in, and the frontmatter's empty
 * `pov:` and `characters:` set from the chapter and the beat. Anything the template already fills in is
 * left alone, and the rest of its frontmatter is not touched or re-formatted.
 */
export function fillSceneTemplate(template: string, fill: { title: string; date: string; pov?: string; characters?: readonly string[] }): string {
	let text = template.replace(/\r\n/g, "\n").replace(/\{\{\s*title\s*\}\}/gi, fill.title).replace(/\{\{\s*date\s*\}\}/gi, fill.date);
	const fm = /^---\n([\s\S]*?)\n---(?=\n|$)/.exec(text);
	if (!fm) return text;
	let head = fm[1]!;
	if (fill.pov) head = head.replace(/^pov:[ \t]*$/m, `pov: ${yamlScalar(fill.pov)}`);
	if (fill.characters?.length) {
		const list = fill.characters.map((c) => `  - ${yamlScalar(c)}`).join("\n");
		// `characters:` with nothing after it, an empty `[]`, or only empty `- ` items.
		head = head.replace(/^characters:[ \t]*(?:\[\s*\])?[ \t]*(?:\n[ \t]+-[ \t]*(?=\n|$))*$/m, `characters:\n${list}`);
	}
	text = `---\n${head}\n---${text.slice(fm[0].length)}`;
	return text;
}

/** The class a read-through note carries, so its embedded scenes can be styled as one continuous page. */
export const READ_CLASS = "pp-readthrough";

/**
 * A read-through of one chapter, or of the whole book: a note of embeds, one per scene, in reading
 * order. It holds no copy of the prose, so the page always shows the scenes as they are now. Scenes
 * with nothing written yet are left out. Null when there is nothing to read.
 */
export function readThrough(book: Book, chapter?: number): { name: string; text: string } | null {
	const chapters = book.chapters.filter((c) => (chapter === undefined || c.number === chapter) && c.scenes.some((s) => s.words > 0));
	if (!chapters.length) return null;
	const heading = (c: BookChapter) => `${pad(c.number)}${c.title ? ` ${c.title}` : ""}`;
	const parts = chapters.map((c) => {
		const scenes = c.scenes.filter((s) => s.words > 0).map((s) => `![[${s.path.replace(/\.md$/i, "")}]]`);
		return `# ${heading(c)}\n\n${scenes.join("\n\n***\n\n")}\n`;
	});
	const name = chapter === undefined ? "Read the book" : `Read ${heading(chapters[0]!)}`;
	return {
		name: name.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim(),
		text: `---\ncssclasses:\n  - ${READ_CLASS}\nproseprince: false\n---\n%% Made by ProsePrince: each scene is embedded, in reading order, so this page always shows the scenes as they are now. Run "Read through…" again after adding, removing or renumbering scenes; anything typed here is replaced. %%\n\n${parts.join("\n")}`,
	};
}
