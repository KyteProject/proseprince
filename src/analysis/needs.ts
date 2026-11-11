import type { Relations } from "./relations";
import { type Book, sceneLabel, type SceneRecord } from "./story";

/**
 * Needs a look: scenes whose last pass may no longer hold, each with the reason in one line and the
 * dates behind it. Advisory only: nothing here reads the prose for sense, and nothing is ever blocked.
 * A scene that has had no pass is never stale; it has simply had no pass yet.
 */

// ── Days ───────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const two = (n: number) => String(n).padStart(2, "0");

/** A date as a count of days, read from the front of `2026-11-10` or `2026-11-10T09:30`. Null when it isn't one. */
export function dayOf(s: string | null | undefined): number | null {
	const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(s ?? "");
	if (!m) return null;
	const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	return Number.isNaN(t) ? null : Math.round(t / DAY);
}

/** The local day of a moment, as `2026-11-10`. */
export function dayText(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

// ── Prints ─────────────────────────────────────────────────────────────────────

function fnv(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** A short print of a text, to tell whether it changed at all. */
export const hashOf = (text: string) => `#${fnv(text).toString(36)}`;

const WORD = /[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu;
const BUCKETS = 36 ** 3;

/**
 * A scene's prose as a bag of words: how many times each word is used, with the words themselves
 * reduced to three characters. Enough to say roughly how many words changed between two versions;
 * nothing of the prose can be read back from it.
 */
export function bagOf(prose: string): string {
	const counts = new Map<string, number>();
	for (const word of prose.toLowerCase().replace(/’/g, "'").match(WORD) ?? []) {
		const key = (fnv(word) % BUCKETS).toString(36).padStart(3, "0");
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, n]) => (n > 1 ? `${key}${n}` : key)).join(" ");
}

function readBag(bag: string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const part of bag.split(" ")) if (part.length >= 3) counts.set(part.slice(0, 3), Number(part.slice(3)) || 1);
	return counts;
}

export interface Change {
	/** Words added or words taken out, whichever is more: a reworded sentence counts once. */
	words: number;
	/** Words in the longer of the two versions. */
	of: number;
}

export function bagChange(before: string, after: string): Change {
	const a = readBag(before);
	const b = readBag(after);
	let added = 0;
	let removed = 0;
	let wasWords = 0;
	let nowWords = 0;
	for (const [key, n] of b) {
		nowWords += n;
		added += Math.max(0, n - (a.get(key) ?? 0));
	}
	for (const [key, n] of a) {
		wasWords += n;
		removed += Math.max(0, n - (b.get(key) ?? 0));
	}
	return { words: Math.max(added, removed), of: Math.max(wasWords, nowWords) };
}

/** The least that counts as an edit: ten words (about fifty characters) and one word in a hundred. A typo fix is neither. */
export const THRESHOLD = { words: 10, share: 0.01 };
export const substantial = (c: Change) => c.words >= THRESHOLD.words && c.words >= c.of * THRESHOLD.share;

// ── Passes ─────────────────────────────────────────────────────────────────────

export const PASSES = ["dev", "line", "continuity"] as const;
export type PassName = (typeof PASSES)[number];
type Flags = SceneRecord["flags"];

/** The pass dates as one string, to notice when any of them changes. Undefined when the note has none. */
export function flagKey(flags: Flags | undefined): string | undefined {
	const key = PASSES.map((p) => flags?.[p]?.trim() ?? "").join("|");
	return key === "||" ? undefined : key;
}

export interface Pass {
	name: PassName;
	date: string;
	day: number;
}

/** The most recent of a note's passes that carries a date. */
export function lastPass(flags: Flags | undefined, among: readonly PassName[] = PASSES): Pass | null {
	let last: Pass | null = null;
	for (const name of among) {
		const date = flags?.[name]?.trim();
		const day = dayOf(date);
		if (date && day !== null && (!last || day >= last.day)) last = { name, date, day };
	}
	return last;
}

// ── What is remembered about a note ────────────────────────────────────────────

/** What ProsePrince keeps about one note between sessions. It holds prints, never prose. */
export interface Tracked {
	/** The note as it stood at its last real change. */
	print: string;
	/** The day of that change. */
	changed: string;
	/** The moment of it, once ProsePrince has seen a change happen. Without it, `changed` is the file's own date. */
	changedAt?: number;
	/** The pass dates last seen. */
	flags?: string;
	/** The prose as it stood when those dates were set. */
	pass?: { print: string; words: number; at: number };
}

export interface Seen {
	/** `bagOf` a scene's prose, or `hashOf` anything else. */
	print: string;
	/** When the file was last modified. */
	modified: number;
	/** Whether the print is a bag, so a small change can be told from a real one. */
	bag?: boolean;
	flags?: Flags;
	words?: number;
	/** The file was saved since ProsePrince last looked at it, in this session. */
	touched?: boolean;
}

/**
 * Bring what is remembered about a note up to date with how it is now. A scene's small edits add up
 * against the last print until they pass the threshold, and only then does its date of change move.
 * When the pass dates change, the prose as it stands is kept as what that pass read: always when the
 * date was typed in front of ProsePrince with the prose standing still, and otherwise only when the
 * file hasn't been saved since the day of the pass. Failing both, the file's date is all there is to
 * go on. Pass dates that go missing are not forgotten: frontmatter can be read a moment late.
 */
export function track(prev: Tracked | undefined, seen: Seen): Tracked {
	const day = dayText(seen.modified);
	let next: Tracked;
	let moved = false;
	if (!prev) next = { print: seen.print, changed: day };
	else if (prev.print !== seen.print && (!seen.bag || substantial(bagChange(prev.print, seen.print)))) {
		next = { ...prev, print: seen.print, changed: day, changedAt: seen.modified };
		moved = true;
	} else next = { ...prev };
	const key = flagKey(seen.flags);
	if (!key || prev?.flags === key) return next;
	const last = lastPass(seen.flags);
	next.flags = key;
	// A date typed while the prose stood still is a pass on the prose as it is.
	const live = !!prev && !moved && seen.touched === true;
	if (live || (last && dayOf(day)! <= last.day)) next.pass = { print: seen.print, words: seen.words ?? 0, at: seen.modified };
	else delete next.pass;
	return next;
}

// ── Reasons ────────────────────────────────────────────────────────────────────

export const NEED_KINDS = ["paid-early", "edited", "earlier", "canon", "shape"] as const;
export type NeedKind = (typeof NEED_KINDS)[number];

export interface Need {
	kind: NeedKind;
	/** The scene, or chapter note, to look at. */
	scene: SceneRecord;
	text: string;
	/** What it is about, to open: a note, or an earlier scene. */
	cause?: { path: string; line?: number };
}

export interface Needs {
	/** In reading order. */
	list: Need[];
	byScene: Map<string, Need[]>;
	/** Written scenes with no pass date at all. */
	noPass: SceneRecord[];
	/** Written scenes with at least one. */
	passed: number;
}

export const EMPTY_NEEDS: Needs = { list: [], byScene: new Map(), noPass: [], passed: 0 };

export interface NeedsInput {
	book: Book;
	relations: Relations;
	tracked: ReadonlyMap<string, Tracked>;
	/** Each scene's prose now, as `bagOf`. */
	prints: ReadonlyMap<string, string>;
	/** When each file was last modified, for a note nothing is remembered about. */
	modified: ReadonlyMap<string, number>;
	/** The note that holds the shape of the book, when there is one. */
	shape?: { path: string; title: string } | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function needsALook({ book, relations, tracked, prints, modified, shape }: NeedsInput): Needs {
	const list: Need[] = [];
	const order = new Map(book.scenes.map((s, i) => [s.path, i]));

	/** When a note last really changed: remembered, or failing that the file's date. */
	const changeOf = (path: string): { day: number; text: string; at?: number } | null => {
		const t = tracked.get(path);
		const ms = modified.get(path);
		const text = t?.changed ?? (ms === undefined ? undefined : dayText(ms));
		const day = dayOf(text);
		if (!text || day === null) return null;
		return { day, text: t?.changedAt === undefined ? `${text} (file date)` : text, ...(t?.changedAt === undefined ? {} : { at: t.changedAt }) };
	};
	/** A scene's last pass, with the moment it was set when ProsePrince saw that happen on the day itself. */
	const passOf = (scene: SceneRecord, among?: readonly PassName[]): (Pass & { at?: number }) | null => {
		const pass = lastPass(scene.flags, among);
		if (!pass) return null;
		const t = tracked.get(scene.path);
		const at = t?.pass && t.flags === flagKey(scene.flags) && dayText(t.pass.at) === pass.date ? t.pass.at : undefined;
		return at === undefined ? pass : { ...pass, at };
	};
	const after = (change: { day: number; at?: number }, pass: { day: number; at?: number }) =>
		change.day > pass.day || (change.day === pass.day && change.at !== undefined && pass.at !== undefined && change.at > pass.at);

	// A promise paid before it was made.
	for (const row of book.promises) {
		if (row.status !== "paid-before-made") continue;
		for (const ref of row.paid) {
			const scene = book.scenes.find((s) => s.path === ref.path) ?? book.chapters.find((c) => c.note?.path === ref.path)?.note;
			const made = row.made[0];
			if (scene) list.push({ kind: "paid-early", scene, text: `Pays "${row.name}" before it is made${made ? `, in ${made.label}` : ""}`, ...(made ? { cause: { path: made.path } } : {}) });
		}
	}

	const written = book.scenes.filter((s) => s.words > 0);
	for (const scene of written) {
		// Edited since its last pass.
		const last = passOf(scene);
		const mine = tracked.get(scene.path);
		if (last) {
			const print = prints.get(scene.path);
			if (mine?.pass && mine.flags === flagKey(scene.flags)) {
				const change = print === undefined ? null : bagChange(mine.pass.print, print);
				if (change && substantial(change)) list.push({ kind: "edited", scene, text: `About ${plural(change.words, "word")} changed since its ${last.name} pass of ${last.date} (${mine.pass.words.toLocaleString()} then, ${scene.words.toLocaleString()} now)` });
			} else {
				const ms = modified.get(scene.path);
				if (ms !== undefined && dayOf(dayText(ms))! > last.day) list.push({ kind: "edited", scene, text: `File changed on ${dayText(ms)}, after its ${last.name} pass of ${last.date}` });
			}
		}

		// An earlier scene it pays or moves on a promise from has changed since this scene was last read for story.
		const story = passOf(scene, ["dev", "continuity"]);
		if (story) {
			const at = order.get(scene.path)!;
			const earlier = new Map<string, { roles: string[]; scene: SceneRecord }>();
			for (const row of book.promises) {
				if (![...row.paid, ...row.progressed].some((ref) => ref.path === scene.path)) continue;
				for (const [role, refs] of [["makes", row.made], ["moves on", row.progressed]] as const) {
					for (const ref of refs) {
						const from = book.scenes.find((s) => s.path === ref.path);
						if (!from || (order.get(from.path) ?? at) >= at) continue;
						const entry = earlier.get(from.path) ?? { roles: [], scene: from };
						entry.roles.push(`${role} "${row.name}"`);
						earlier.set(from.path, entry);
					}
				}
			}
			for (const { roles, scene: from } of earlier.values()) {
				const change = changeOf(from.path);
				if (change && after(change, story)) list.push({ kind: "earlier", scene, text: `${sceneLabel(from)} changed on ${change.text}, after this scene's ${story.name} pass of ${story.date}: it ${roles.join(", ")}`, cause: { path: from.path } });
			}
		}

		// Canon changed since its continuity pass, in a note it touches.
		const continuity = passOf(scene, ["continuity"]);
		if (continuity) {
			for (const touch of relations.touches.get(scene.path) ?? []) {
				const note = touch.note;
				const fresh = relations.reveals.filter((r) => r.note === note && r.scene !== scene && !r.also.includes(scene) && (dayOf(r.added) ?? -Infinity) > continuity.day);
				if (fresh.length) {
					const latest = fresh.reduce((a, b) => (dayOf(b.added)! > dayOf(a.added)! ? b : a));
					const first = fresh.reduce((a, b) => ((b.line ?? 0) < (a.line ?? 0) ? b : a));
					list.push({ kind: "canon", scene, text: `${note.title}: ${plural(fresh.length, "fact")} added ${fresh.length === 1 ? "on" : "up to"} ${latest.added}, after its continuity pass of ${continuity.date}`, cause: { path: note.path, ...(first.line === undefined ? {} : { line: first.line }) } });
					continue;
				}
				const change = changeOf(note.path);
				if (change && after(change, continuity)) list.push({ kind: "canon", scene, text: `${note.title} changed on ${change.text}, after its continuity pass of ${continuity.date}`, cause: { path: note.path } });
			}
		}
	}

	// The shape of the book changed after a chapter's card was written.
	const reshaped = shape ? changeOf(shape.path) : null;
	if (shape && reshaped) {
		for (const chapter of book.chapters) {
			const note = chapter.note;
			if (!note?.outline?.card.length) continue;
			const card = changeOf(note.path);
			if (card && after(reshaped, card)) list.push({ kind: "shape", scene: note, text: `${shape.title} changed on ${reshaped.text}, after this chapter's card was last changed on ${card.text}`, cause: { path: shape.path } });
		}
	}

	const place = (r: SceneRecord) => r.name.chapter * 1000 + r.name.scene;
	list.sort((a, b) => place(a.scene) - place(b.scene) || NEED_KINDS.indexOf(a.kind) - NEED_KINDS.indexOf(b.kind));
	const byScene = new Map<string, Need[]>();
	for (const need of list) byScene.set(need.scene.path, [...(byScene.get(need.scene.path) ?? []), need]);
	const noPass = written.filter((s) => !flagKey(s.flags));
	return { list, byScene, noPass, passed: written.length - noPass.length };
}
