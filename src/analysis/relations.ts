import { excludedBlocks } from "./mask";
import { isNamedPerson } from "./outline";
import { asNames, type Book, linkTarget, type SceneRecord } from "./story";

/**
 * How the book and the notes about it connect: which fact the reader was shown in which scene, who
 * was there to learn it, who is in which scene, and which notes a scene touches. All of it is read
 * from what the writer already keeps: a fact filed in a note ends with the scene it came from, a
 * scene lists its characters, and a note lists the names its subject goes by. Nothing is inferred
 * from the prose beyond finding those names in it.
 */

// ── Notes about the story ──────────────────────────────────────────────────────

export interface CanonFact {
	text: string;
	/** The notes linked in the closing bracket: `… ([[04.02 - Breakfast Bar]])`. */
	cites: string[];
	/** Line in the note, from 0. */
	line: number;
	/** The date of the `## Added YYYY-MM-DD` heading the fact sits under, when it sits under one. */
	added?: string;
}

export interface CanonNote {
	path: string;
	basename: string;
	/** The name without its number: `20.2 Ruoi` is "Ruoi". */
	title: string;
	type?: string;
	status?: string;
	/** What the note's subject is called in the prose: `aliases`, and a character note's own title. */
	names: string[];
	facts: CanonFact[];
}

const fold = (s: string) => s.trim().toLowerCase();
/** "The Lurch" and "Lurch" are one name. */
const bare = (s: string) => s.trim().replace(/^(?:the|an?)\s+/i, "");
const nameKey = (s: string) => fold(bare(s));
const unique = <T>(items: readonly T[], key: (item: T) => string): T[] => {
	const seen = new Set<string>();
	return items.filter((item) => {
		const k = key(item);
		if (!k || seen.has(k)) return false;
		seen.add(k);
		return true;
	});
};

const scalar = (v: unknown): string | undefined => (v === null || v === undefined || typeof v === "object" ? undefined : String(v).trim() || undefined);
const plain = (s: string) => s.replace(/\[\[(?:[^\]|\n]*\|)?([^\]\n]+)\]\]/g, "$1").replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim();

/** A line that ends by naming where it came from: text, then a bracket holding one or more links. */
const CITED = /^(.*?)\s*\(((?:[^()[\]]*\[\[[^\]\n]+\]\])+[^()[\]]*)\)\s*$/;

/** A character note's title as names: "Oskar (The Clerk)" is Oskar and The Clerk. A sentence is not a name. */
function titleNames(title: string): string[] {
	const parts = [title.replace(/\s*\([^)]*\)\s*/g, " "), ...[...title.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]!)];
	return parts.map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p && p.split(" ").length <= 3);
}

/**
 * What a note says about the story: the names its subject goes by, and each fact that cites a
 * scene. A fact is a line (usually a list item) ending `([[scene]])`, anywhere in the note outside
 * comments, code and callouts.
 */
export function canonNote(path: string, basename: string, text: string, frontmatter: Record<string, unknown>): CanonNote {
	const title = basename.replace(/^\d+(?:\.\d+)*\s*[-–—:]?\s*/, "").trim() || basename;
	const type = scalar(frontmatter.type);
	const names = unique(
		[...asNames(frontmatter.aliases), ...asNames(frontmatter.alias), ...asNames(frontmatter.name), ...asNames(frontmatter.names), ...(fold(type ?? "") === "character" ? titleNames(title) : [])],
		nameKey,
	);
	const facts: CanonFact[] = [];
	const excluded = excludedBlocks(text);
	let offset = 0;
	let block = 0;
	let added: string | undefined;
	text.split("\n").forEach((line, i) => {
		const from = offset;
		offset += line.length + 1;
		while (block < excluded.length && excluded[block]!.to <= from) block++;
		if (block < excluded.length && excluded[block]!.from <= from) return;
		const heading = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
		if (heading) {
			// A deeper heading inside a dated section keeps the section's date.
			if (heading[1]!.length <= 2) added = /^Added\s+(\d{4}-\d{2}-\d{2})/i.exec(heading[2]!)?.[1];
			return;
		}
		const m = CITED.exec(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "").replace(/%%.*?%%/g, "").trim());
		if (!m) return;
		const cites = unique([...m[2]!.matchAll(/\[\[([^\]\n]+)\]\]/g)].map((l) => linkTarget(l[1]!)), fold);
		const fact = plain(m[1]!);
		if (fact && cites.length) facts.push({ text: fact, cites, line: i, ...(added ? { added } : {}) });
	});
	return { path, basename, title, ...(type ? { type } : {}), ...(scalar(frontmatter.status) ? { status: scalar(frontmatter.status) } : {}), names, facts };
}

// ── Relations ──────────────────────────────────────────────────────────────────

/** Something the reader was shown. */
export interface Reveal {
	text: string;
	/** The note the fact is filed in; null for a `> [!note]` still waiting in the scene. */
	note: CanonNote | null;
	/** Line in the note, from 0. */
	line?: number;
	/** The first scene, in reading order, that the fact cites. */
	scene: SceneRecord;
	/** Other scenes the same fact cites. */
	also: SceneRecord[];
	added?: string;
	/** Who was in the scene: its `pov` and `characters`. Presence, which is not the same as noticing. */
	knownTo: string[];
}

export type Declared = "pov" | "character" | "setting" | "beat";

/** One note a scene is connected to, and each way it is. */
export interface Touch {
	note: CanonNote;
	/** Named in the scene's properties, or in its beat's `who:`. */
	declared: Declared[];
	/** Facts in the note that cite the scene. */
	facts: number;
	/** `%% filed → [[note]] %%` comments in the scene. */
	filed: number;
	/** The note's names found in the scene's prose. */
	mentions: string[];
}

/** A scene's `filed` comments that the named note doesn't bear out. */
export interface Filing {
	scene: SceneRecord;
	/** Null when no note of that name was found. */
	note: CanonNote | null;
	name: string;
	count: number;
	/** Scenes of the same chapter the note cites instead: after a scene is split, citations keep the old name. */
	elsewhere: SceneRecord[];
}

export type CastIssueKind = "unnamed" | "beat-only" | "scene-only";

export interface CastRow {
	name: string;
	note: CanonNote | null;
	/** Scenes whose `pov` or `characters` name them. */
	present: SceneRecord[];
	/** Scenes whose prose names them though the properties don't. */
	mentioned: SceneRecord[];
	first?: SceneRecord;
	last?: SceneRecord;
	issues: { kind: CastIssueKind; scene: SceneRecord }[];
}

export interface Relations {
	/** Every note that says something about the story: it has names, or facts that cite a scene. */
	notes: CanonNote[];
	/** In reading order. */
	reveals: Reveal[];
	/** By scene path. */
	touches: Map<string, Touch[]>;
	/** By note path, in reading order. */
	touchedBy: Map<string, { scene: SceneRecord; touch: Touch }[]>;
	cast: CastRow[];
	filings: Filing[];
	/** A name two notes both claim: it isn't counted as a mention of either. */
	ambiguous: { name: string; notes: CanonNote[] }[];
	/** Notes the prose names in two scenes or more, with no fact recorded from any scene. */
	quiet: { note: CanonNote; scenes: SceneRecord[] }[];
	/** Whether any scene has `day` filled in with something that can be ordered. */
	hasDays: boolean;
}

export const EMPTY_RELATIONS: Relations = { notes: [], reveals: [], touches: new Map(), touchedBy: new Map(), cast: [], filings: [], ambiguous: [], quiet: [], hasDays: false };

/**
 * A name as a whole-word search. Written with a capital it matches as written ("Rat" is not "rat");
 * written all in lower case it matches any case ("salt pan" finds "Salt pan"). A leading article is
 * left out, so "The Lurch" finds "the Lurch".
 */
export function nameMatcher(name: string, anyCase = false): RegExp | null {
	const core = bare(name);
	if (core.length < 2) return null;
	const escaped = core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+").replace(/['’]/g, "['’]");
	return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, anyCase || core === core.toLowerCase() ? "iu" : "u");
}

/** A name the prose can be expected to use: "Ruoi", "Madame Voss". "The Inspector" and "Two guards" describe someone. */
const isProperName = (name: string) => isNamedPerson(name) && !/^(?:the|an?)\s/i.test(name.trim());

const TYPE_ORDER = ["character", "system", "concept", "question", "source"];
const byType = (a: CanonNote, b: CanonNote) => {
	const at = (n: CanonNote) => {
		const i = TYPE_ORDER.indexOf(fold(n.type ?? ""));
		return i < 0 ? TYPE_ORDER.length : i;
	};
	return at(a) - at(b) || a.basename.localeCompare(b.basename, undefined, { numeric: true });
};

/**
 * Everything that connects the book to its notes.
 * @param prose each scene's prose by path, for finding names in; a scene without it has no mentions.
 * @param canonical the shown name for an alias ("Effie" is "Eufemie"), from the World note.
 */
export function buildRelations(book: Book, allNotes: readonly CanonNote[], prose: ReadonlyMap<string, string>, canonical: (name: string) => string = (n) => n): Relations {
	const sceneAt = new Map(book.scenes.map((s, i) => [s.path, i]));
	const sceneNamed = new Map(book.scenes.map((s) => [fold(s.basename), s]));
	const inOrder = (a: SceneRecord, b: SceneRecord) => sceneAt.get(a.path)! - sceneAt.get(b.path)!;
	const citedScenes = (cites: readonly string[]) => unique(cites.map((c) => sceneNamed.get(fold(c))).filter((s): s is SceneRecord => !!s), (s) => s.path).sort(inOrder);

	const notes = allNotes.filter((n) => n.names.length || n.facts.some((f) => citedScenes(f.cites).length)).sort(byType);
	const noteNamed = new Map(allNotes.map((n) => [fold(n.basename), n]));

	// Who a name belongs to. A name two notes share belongs to neither, unless only one of them is a character.
	const claims = new Map<string, CanonNote[]>();
	for (const note of notes) for (const name of note.names) claims.set(nameKey(name), [...(claims.get(nameKey(name)) ?? []), note]);
	const owner = (name: string): CanonNote | null => {
		const found = claims.get(nameKey(name)) ?? [];
		if (found.length === 1) return found[0]!;
		const people = found.filter((n) => fold(n.type ?? "") === "character");
		return people.length === 1 ? people[0]! : null;
	};
	const resolve = (name: string) => owner(canonical(name)) ?? owner(name);
	const ambiguous = [...claims].filter(([name, found]) => found.length > 1 && !owner(name)).map(([, found]) => ({ name: found[0]!.names.find((n) => found.every((o) => o.names.some((m) => nameKey(m) === nameKey(n))))!, notes: found }));
	const matchers = new Map<CanonNote, { name: string; re: RegExp }[]>();
	for (const note of notes) {
		const list = note.names.filter((name) => owner(name) === note).map((name) => ({ name, re: nameMatcher(name) })).filter((m): m is { name: string; re: RegExp } => m.re !== null);
		if (list.length) matchers.set(note, list);
	}
	const namedIn = (note: CanonNote, scene: SceneRecord) => {
		const text = prose.get(scene.path);
		return text ? (matchers.get(note) ?? []).filter((m) => m.re.test(text)).map((m) => m.name) : [];
	};

	const people = (s: SceneRecord) => unique([...(s.pov ? asNames(s.pov) : []), ...s.characters].map(canonical), nameKey);

	// ── Reveals ──
	const reveals: Reveal[] = [];
	for (const note of notes) {
		for (const fact of note.facts) {
			const scenes = citedScenes(fact.cites);
			if (!scenes.length) continue;
			reveals.push({ text: fact.text, note, line: fact.line, scene: scenes[0]!, also: scenes.slice(1), ...(fact.added ? { added: fact.added } : {}), knownTo: people(scenes[0]!) });
		}
	}
	for (const scene of book.scenes) for (const text of scene.unfiled) reveals.push({ text, note: null, scene, also: [], knownTo: people(scene) });
	reveals.sort((a, b) => inOrder(a.scene, b.scene) || Number(!a.note) - Number(!b.note) || (a.note && b.note ? byType(a.note, b.note) : 0) || (a.line ?? 0) - (b.line ?? 0));

	// ── Touches ──
	const touches = new Map<string, Touch[]>();
	const touchedBy = new Map<string, { scene: SceneRecord; touch: Touch }[]>();
	const filings: Filing[] = [];
	for (const scene of book.scenes) {
		const found = new Map<CanonNote, Touch>();
		const at = (note: CanonNote) => {
			if (!found.has(note)) found.set(note, { note, declared: [], facts: 0, filed: 0, mentions: [] });
			return found.get(note)!;
		};
		const declare = (name: string | undefined, how: Declared) => {
			const note = name ? resolve(name) : null;
			if (note && !at(note).declared.includes(how)) at(note).declared.push(how);
		};
		for (const name of scene.pov ? asNames(scene.pov) : []) declare(name, "pov");
		for (const name of scene.characters) declare(name, "character");
		declare(scene.setting, "setting");
		for (const name of book.places.get(scene.path)?.beat?.who ?? []) declare(name, "beat");
		for (const note of notes) {
			const facts = note.facts.filter((f) => f.cites.some((c) => fold(c) === fold(scene.basename))).length;
			if (facts) at(note).facts = facts;
			const mentions = namedIn(note, scene);
			if (mentions.length) at(note).mentions = mentions;
		}
		for (const name of unique(scene.filed, fold)) {
			const note = noteNamed.get(fold(name)) ?? null;
			const count = scene.filed.filter((f) => fold(f) === fold(name)).length;
			if (note && notes.includes(note)) at(note).filed = count;
			if (note?.facts.some((f) => f.cites.some((c) => fold(c) === fold(scene.basename)))) continue;
			const cited = note ? unique(note.facts.flatMap((f) => citedScenes(f.cites)), (s) => s.path) : [];
			filings.push({ scene, note, name: note?.basename ?? name, count, elsewhere: cited.filter((s) => s.name.chapter === scene.name.chapter).sort(inOrder) });
		}
		const list = [...found.values()].sort((a, b) => byType(a.note, b.note));
		if (list.length) touches.set(scene.path, list);
		for (const touch of list) touchedBy.set(touch.note.path, [...(touchedBy.get(touch.note.path) ?? []), { scene, touch }]);
	}
	const quiet = notes
		.map((note) => ({ note, scenes: (touchedBy.get(note.path) ?? []).filter((t) => t.touch.mentions.length).map((t) => t.scene) }))
		.filter((q) => q.scenes.length >= 2 && !q.note.facts.some((f) => citedScenes(f.cites).length));

	// ── Cast ──
	const rows = new Map<string, CastRow>();
	const keyOf = (written: string) => resolve(written)?.path ?? nameKey(canonical(written));
	const row = (written: string): CastRow => {
		const key = keyOf(written);
		if (!rows.has(key)) rows.set(key, { name: canonical(written), note: resolve(written), present: [], mentioned: [], issues: [] });
		return rows.get(key)!;
	};
	for (const note of notes) if (fold(note.type ?? "") === "character" && note.names.length) row(note.names[0]!);
	for (const scene of book.scenes) for (const name of people(scene)) row(name).present.push(scene);
	for (const chapter of book.chapters) {
		for (const beat of chapter.beats) {
			// A described entry ("Unnamed partner") is nobody to hold the scene to, though it still counts as planned.
			const who = (beat.who ?? []).filter(isNamedPerson);
			const planned = new Set((beat.who ?? []).map(keyOf));
			// Only once the scenes list anyone at all: empty properties are a gap, and not a disagreement.
			const listing = beat.scenes.filter((s) => people(s).length);
			if (!who.length || !listing.length) {
				for (const name of who) row(name);
				continue;
			}
			for (const r of new Set(who.map(row))) if (!listing.some((s) => r.present.includes(s))) r.issues.push({ kind: "beat-only", scene: listing[0]! });
			for (const scene of listing) for (const name of people(scene)) if (isNamedPerson(name) && !planned.has(keyOf(name))) row(name).issues.push({ kind: "scene-only", scene });
		}
	}
	for (const r of rows.values()) {
		// A name typed into a scene's properties is typed loosely: "Lantern Man" there, "Lantern man" in the prose.
		const own = r.note ? null : nameMatcher(r.name, /\s/.test(r.name.trim()));
		// Only someone with a name can go unnamed: "The Inspector" is "the inspector" in prose, or "she".
		const expected = r.note ? r.note.names.some(isProperName) : isProperName(r.name);
		// Someone with a name and a description ("Tien", "The Inspector") may be only "the inspector" in a scene, and that is no gap.
		const described = (r.note?.names ?? []).filter((n) => !isProperName(n)).flatMap((n) => nameMatcher(n, true) ?? []);
		const named = (scene: SceneRecord) => {
			const text = prose.get(scene.path);
			if (text === undefined) return null;
			return r.note ? namedIn(r.note, scene).length > 0 : !!own?.test(text);
		};
		for (const scene of book.scenes) {
			const found = named(scene);
			if (r.present.includes(scene)) {
				if (found === false && scene.words > 0 && expected && !described.some((d) => d.test(prose.get(scene.path) ?? ""))) r.issues.push({ kind: "unnamed", scene });
			} else if (found) r.mentioned.push(scene);
		}
		const seen = [...r.present, ...r.mentioned].sort(inOrder);
		r.first = seen[0];
		r.last = seen[seen.length - 1];
		r.issues.sort((a, b) => inOrder(a.scene, b.scene));
	}
	const cast = [...rows.values()].sort((a, b) => b.present.length - a.present.length || b.mentioned.length - a.mentioned.length || a.name.localeCompare(b.name));

	return { notes, reveals, touches, touchedBy, cast, filings, ambiguous, quiet, hasDays: book.scenes.some((s) => Number.isFinite(dayValue(s.day))) };
}

// ── Order, and what is known when ──────────────────────────────────────────────

/** A `day` as something to sort by: a date, or the first number in it ("Day 3", "-2"). NaN when it has neither. */
export function dayValue(day: string | undefined): number {
	if (!day) return Number.NaN;
	const date = /^\d{4}-\d{2}-\d{2}/.exec(day.trim());
	if (date) return Date.parse(`${date[0]}T00:00:00Z`) / 86_400_000;
	const n = /-?\d+(?:\.\d+)?/.exec(day);
	return n ? Number(n[0]) : Number.NaN;
}

/** The scenes in reading order, or by in-world `day` (scenes with no day keep their reading order, after the rest). */
export function sceneOrder(book: Book, by: "reading" | "day"): SceneRecord[] {
	if (by === "reading") return [...book.scenes];
	const dated = book.scenes.filter((s) => Number.isFinite(dayValue(s.day)));
	const at = new Map(book.scenes.map((s, i) => [s.path, i]));
	dated.sort((a, b) => dayValue(a.day) - dayValue(b.day) || at.get(a.path)! - at.get(b.path)!);
	return [...dated, ...book.scenes.filter((s) => !Number.isFinite(dayValue(s.day)))];
}

/** Everything shown up to and including a scene, in the given order. With no scene, everything. */
export function revealsUpTo(relations: Relations, order: readonly SceneRecord[], path: string | null): Reveal[] {
	const at = new Map(order.map((s, i) => [s.path, i]));
	const limit = path === null ? Number.POSITIVE_INFINITY : (at.get(path) ?? Number.POSITIVE_INFINITY);
	return relations.reveals.filter((r) => (at.get(r.scene.path) ?? 0) <= limit).sort((a, b) => (at.get(a.scene.path) ?? 0) - (at.get(b.scene.path) ?? 0));
}

export interface SceneKnowledge {
	/** Shown in this scene. */
	here: Reveal[];
	/** How many facts the reader had been shown before this scene. */
	before: number;
	/** Recorded from later scenes: a draft of this scene can't lean on them. */
	later: Reveal[];
	pov?: string;
	/** Shown to the reader, by this scene, in scenes the point-of-view character wasn't in. */
	ahead: Reveal[];
}

/** What the reader knows at a scene, in reading order, and what its point-of-view character was not there for. */
export function sceneKnowledge(relations: Relations, book: Book, path: string, canonical: (name: string) => string = (n) => n): SceneKnowledge | null {
	const index = book.scenes.findIndex((s) => s.path === path);
	if (index < 0) return null;
	const at = new Map(book.scenes.map((s, i) => [s.path, i]));
	const scene = book.scenes[index]!;
	const pov = scene.pov ? asNames(scene.pov)[0] : undefined;
	const upTo = relations.reveals.filter((r) => at.get(r.scene.path)! <= index);
	return {
		here: upTo.filter((r) => r.scene.path === path),
		before: upTo.filter((r) => r.scene.path !== path).length,
		later: relations.reveals.filter((r) => at.get(r.scene.path)! > index),
		...(pov ? { pov } : {}),
		ahead: pov ? upTo.filter((r) => !r.knownTo.some((k) => nameKey(k) === nameKey(canonical(pov)))) : [],
	};
}
