import { describe, expect, it } from "vitest";
import { inventory } from "../src/analysis/inventory";
import { bagChange, bagOf, dayOf, dayText, flagKey, hashOf, lastPass, needsALook, substantial, track, type Tracked } from "../src/analysis/needs";
import { buildRelations, canonNote } from "../src/analysis/relations";
import { buildBook, proseOf, sceneRecord } from "../src/analysis/story";

const at = (day: string, hour = 12) => {
	const [y, m, d] = day.split("-").map(Number);
	return new Date(y!, m! - 1, d!, hour).getTime();
};
const words = (n: number, word = "w") => Array.from({ length: n }, (_, i) => `${word}${i}`).join(" ");

describe("days", () => {
	it("reads a date from the front of a value and nothing else", () => {
		expect(dayOf("2030-01-05")! - dayOf("2030-01-03")!).toBe(2);
		expect(dayOf("2030-01-05T09:30")).toBe(dayOf("2030-01-05"));
		expect(dayOf("done")).toBeNull();
		expect(dayOf(undefined)).toBeNull();
		expect(dayText(at("2030-01-05", 23))).toBe("2030-01-05");
	});

	it("takes the latest dated pass", () => {
		expect(lastPass({ dev: "2030-01-02", continuity: "2030-01-05", line: "soon" })).toMatchObject({ name: "continuity", date: "2030-01-05" });
		expect(lastPass({ dev: "2030-01-02", continuity: "2030-01-05" }, ["dev"])).toMatchObject({ name: "dev" });
		expect(lastPass({ line: "soon" })).toBeNull();
		expect(flagKey({})).toBeUndefined();
		expect(flagKey({ line: "soon" })).toBe("|soon|");
	});
});

describe("how much a scene changed", () => {
	it("counts a reworded word once, and ignores case and order", () => {
		const before = bagOf("The gate opened. Mara counted the gulls.");
		expect(bagChange(before, bagOf("Mara counted the gulls. The gate OPENED."))).toEqual({ words: 0, of: 7 });
		expect(bagChange(before, bagOf("The gate opened. Mara counted the crows."))).toEqual({ words: 1, of: 7 });
		expect(bagChange(before, bagOf("The gate opened. Mara counted the gulls, twice over."))).toEqual({ words: 2, of: 9 });
	});

	it("keeps nothing of the prose", () => {
		expect(bagOf("Mara counted the gulls, and Mara waited.")).toMatch(/^[0-9a-z ]+$/);
		expect(bagOf("Mara counted the gulls, and Mara waited.")).not.toContain("mara");
	});

	it("needs ten words and one in a hundred before it counts", () => {
		const base = words(500);
		expect(substantial(bagChange(bagOf(base), bagOf(`${base} ${words(9, "x")}`)))).toBe(false);
		expect(substantial(bagChange(bagOf(base), bagOf(`${base} ${words(10, "x")}`)))).toBe(true);
		const long = words(2000);
		expect(substantial(bagChange(bagOf(long), bagOf(`${long} ${words(15, "x")}`)))).toBe(false);
		expect(substantial(bagChange(bagOf(long), bagOf(`${long} ${words(25, "x")}`)))).toBe(true);
	});
});

describe("what is remembered about a note", () => {
	const base = words(400);
	const seen = (text: string, day: string, flags?: Record<string, string>, touched = false) => ({ print: bagOf(text), modified: at(day), bag: true, flags, words: text.split(" ").length, touched });

	it("starts from the file's date, and moves the date only for a real change", () => {
		const first = track(undefined, seen(base, "2030-01-03"));
		expect(first).toEqual({ print: bagOf(base), changed: "2030-01-03" });
		const typo = track(first, seen(`${base} oops`, "2030-01-04"));
		expect(typo).toEqual(first);
		// Small edits add up against the print that was kept.
		const more = track(typo, seen(`${base} ${words(12, "x")}`, "2030-01-06"));
		expect(more.changed).toBe("2030-01-06");
		expect(more.changedAt).toBe(at("2030-01-06"));
		expect(more.print).toBe(bagOf(`${base} ${words(12, "x")}`));
	});

	it("moves the date for any change to a note that isn't prose", () => {
		const first = track(undefined, { print: hashOf("Lie first."), modified: at("2030-01-03") });
		expect(track(first, { print: hashOf("Lie first, then stack."), modified: at("2030-01-04") }).changed).toBe("2030-01-04");
	});

	it("keeps the prose a pass read, when it can tell what that was", () => {
		// First sight, file untouched since the day of the pass: the prose now is what was read.
		const clean = track(undefined, seen(base, "2030-01-05", { continuity: "2030-01-05" }));
		expect(clean.pass).toEqual({ print: bagOf(base), words: 400, at: at("2030-01-05") });
		// First sight, file edited later: there is no telling.
		const late = track(undefined, seen(base, "2030-01-09", { continuity: "2030-01-05" }));
		expect(late.flags).toBe("||2030-01-05");
		expect(late.pass).toBeUndefined();
		// The same dates again change nothing.
		expect(track(late, seen(base, "2030-01-09", { continuity: "2030-01-05" }))).toEqual(late);
		// A date typed in front of it while the prose stood still is a pass on the prose as it is, whatever the date says.
		const set = track(late, seen(base, "2030-01-10", { continuity: "2030-01-08" }, true));
		expect(set.pass?.at).toBe(at("2030-01-10"));
		// The same new date found on a file that wasn't saved in front of it (frontmatter read late) is not.
		expect(track(late, seen(base, "2030-01-10", { continuity: "2030-01-08" })).pass).toBeUndefined();
		// Prose and date both changed since it was last seen, and the file is newer than the pass: no telling again.
		const both = track(set, seen(`${base} ${words(30, "x")}`, "2030-01-20", { continuity: "2030-01-12" }, true));
		expect(both.pass).toBeUndefined();
		// Dates that go missing are not forgotten: they may only have been read late.
		expect(track(set, seen(base, "2030-01-11"))).toEqual(set);
	});
});

/** An invented book: a promise made in chapter one and paid in chapter two, two notes, a shape note. */
const body = { harbour: words(300, "h"), ledger: words(300, "l"), ferry: words(300, "f"), shore: words(300, "s") };
function fixture(over: { ferry?: Record<string, unknown>; harbourBody?: string; ferryBody?: string } = {}) {
	const drafts = [
		{ name: "01.01 - Harbour", fm: { characters: ["Mara"], promises: ["the cracked bell"], dev: "2030-01-02" }, text: over.harbourBody ?? body.harbour },
		{ name: "01.02 - Ledger", fm: { characters: ["Oskar"] }, text: body.ledger },
		{ name: "02.00 - The Crossing", fm: { type: "chapter" }, text: "# The Crossing\n%%Card.\nshape: lie first\n%%\n\n## Ferry\n[[02.01 - Ferry]]\n" },
		{ name: "02.01 - Ferry", fm: { characters: ["Mara"], pays: ["the cracked bell"], continuity: "2030-01-10", ...over.ferry }, text: over.ferryBody ?? body.ferry },
		{ name: "02.02 - Far Shore", fm: { characters: ["Mara"], pays: ["the drowned bell"] }, text: body.shore },
		{ name: "03.01 - Inland", fm: { promises: ["the drowned bell"] }, text: "" },
	];
	const records = drafts.map((d) => sceneRecord(`draft/${d.name}.md`, d.name, d.text, d.fm)!);
	const notes = [
		canonNote("people/Mara.md", "Mara", "- Mara counts things. ([[01.01 - Harbour]])\n\n## Added 2030-01-12\n- Mara cannot swim. ([[01.02 - Ledger]])\n- Mara pays in tokens. ([[02.01 - Ferry]])\n", { type: "character", status: "decided" }),
		canonNote("people/Oskar.md", "Oskar", "", { type: "character" }),
	];
	const book = buildBook(records);
	const relations = buildRelations(book, notes, new Map(drafts.map((d, i) => [records[i]!.path, proseOf(d.text)])));
	const prints = new Map(drafts.map((d, i) => [records[i]!.path, bagOf(proseOf(d.text))]));
	const path = (name: string) => records.find((r) => r.basename.startsWith(name))!.path;
	return { book, relations, prints, path, records };
}
const texts = (needs: ReturnType<typeof needsALook>, kind?: string) => needs.list.filter((n) => !kind || n.kind === kind).map((n) => `${n.scene.basename.slice(0, 5)} ${n.text}`);
const quiet = (f: ReturnType<typeof fixture>) => new Map(f.records.map((r) => [r.path, at("2030-01-01")]));

describe("needs a look", () => {
	it("says nothing against a scene with no pass, and lists it as having none", () => {
		const f = fixture();
		const needs = needsALook({ ...f, tracked: new Map(), modified: new Map([...quiet(f), [f.path("01.02"), at("2030-02-01")]]) });
		expect(needs.list.some((n) => n.scene.basename.startsWith("01.02"))).toBe(false);
		expect(needs.noPass.map((s) => s.basename.slice(0, 5))).toEqual(["01.02", "02.02"]);
		expect(needs.passed).toBe(2);
	});

	it("flags a promise paid before it is made", () => {
		const f = fixture();
		const needs = needsALook({ ...f, tracked: new Map(), modified: quiet(f) });
		expect(texts(needs, "paid-early")).toEqual(['02.02 Pays "the drowned bell" before it is made, in 03.01 Inland']);
	});

	it("flags canon that changed after the continuity pass, in a note the scene touches", () => {
		const f = fixture();
		const modified = new Map([...quiet(f), ["people/Mara.md", at("2030-01-12")]]);
		const needs = needsALook({ ...f, tracked: new Map(), modified });
		// The fact the scene itself gave rise to is not news to it.
		expect(texts(needs, "canon")).toEqual(["02.01 Mara: 1 fact added on 2030-01-12, after its continuity pass of 2030-01-10"]);
		expect(needs.list.find((n) => n.kind === "canon")!.cause).toEqual({ path: "people/Mara.md", line: 3 });
		// A later pass has read it.
		const later = fixture({ ferry: { continuity: "2030-01-12" } });
		expect(texts(needsALook({ ...later, tracked: new Map(), modified }), "canon")).toEqual([]);
	});

	it("falls back on the note's own date of change when no dated fact explains it", () => {
		const f = fixture({ ferry: { continuity: "2030-01-12" } });
		const base = new Map([...quiet(f), ["people/Mara.md", at("2030-01-20")]]);
		expect(texts(needsALook({ ...f, tracked: new Map(), modified: base }), "canon")).toEqual(["02.01 Mara changed on 2030-01-20 (file date), after its continuity pass of 2030-01-12"]);
		// Once a change has been seen, its date is used, and the file's is not.
		const tracked = new Map<string, Tracked>([["people/Mara.md", { print: "#a", changed: "2030-01-11", changedAt: at("2030-01-11") }]]);
		expect(texts(needsALook({ ...f, tracked, modified: base }), "canon")).toEqual([]);
	});

	it("flags a scene edited since its pass, by how much once it has seen the pass", () => {
		const f = fixture();
		const ferry = f.path("02.01");
		// Nothing remembered: the file's date is all there is.
		const dated = needsALook({ ...f, tracked: new Map(), modified: new Map([...quiet(f), [ferry, at("2030-01-15")]]) });
		expect(texts(dated, "edited")).toEqual(["02.01 File changed on 2030-01-15, after its continuity pass of 2030-01-10"]);
		// The pass was seen: a typo since is nothing, twenty words is something, whatever the file's date.
		const pass = { print: bagOf(body.ferry), words: 300, at: at("2030-01-10") };
		const tracked = new Map<string, Tracked>([[ferry, { print: pass.print, changed: "2030-01-10", flags: "||2030-01-10", pass }]]);
		const modified = new Map([...quiet(f), [ferry, at("2030-01-15")]]);
		expect(texts(needsALook({ ...f, tracked, modified, prints: new Map([[ferry, bagOf(`${body.ferry} oops`)]]) }), "edited")).toEqual([]);
		const edited = fixture({ ferryBody: `${body.ferry} ${words(20, "x")}` });
		expect(texts(needsALook({ ...edited, tracked, modified }), "edited")).toEqual(["02.01 About 20 words changed since its continuity pass of 2030-01-10 (300 then, 320 now)"]);
	});

	it("flags an earlier scene that changed after this one's pass, when this one pays its promise", () => {
		const f = fixture();
		const harbour = f.path("01.01");
		const before = needsALook({ ...f, tracked: new Map(), modified: new Map([...quiet(f), [harbour, at("2030-01-09")]]) });
		expect(texts(before, "earlier")).toEqual([]);
		const tracked = new Map<string, Tracked>([[harbour, { print: "x", changed: "2030-01-14", changedAt: at("2030-01-14") }]]);
		const needs = needsALook({ ...f, tracked, modified: quiet(f) });
		expect(texts(needs, "earlier")).toEqual(['02.01 01.01 Harbour changed on 2030-01-14, after this scene\'s continuity pass of 2030-01-10: it makes "the cracked bell"']);
		expect(needs.byScene.get(f.path("02.01"))!.map((n) => n.kind)).toContain("earlier");
	});

	it("tells morning from afternoon on the day of a pass, once it has seen both", () => {
		const f = fixture();
		const harbour = f.path("01.01");
		const ferry = f.path("02.01");
		const pass = { print: bagOf(body.ferry), words: 300, at: at("2030-01-10", 14) };
		const mine: Tracked = { print: pass.print, changed: "2030-01-10", flags: "||2030-01-10", pass };
		const morning = new Map<string, Tracked>([[ferry, mine], [harbour, { print: "x", changed: "2030-01-10", changedAt: at("2030-01-10", 9) }]]);
		expect(texts(needsALook({ ...f, tracked: morning, modified: quiet(f) }), "earlier")).toEqual([]);
		const evening = new Map<string, Tracked>([[ferry, mine], [harbour, { print: "x", changed: "2030-01-10", changedAt: at("2030-01-10", 19) }]]);
		expect(texts(needsALook({ ...f, tracked: evening, modified: quiet(f) }), "earlier")).toHaveLength(1);
	});

	it("flags a chapter card older than the shape of the book", () => {
		const f = fixture();
		const shape = { path: "concept/Shape.md", title: "Shape of the book" };
		const chapter = f.path("02.00");
		const older = new Map([...quiet(f), [shape.path, at("2030-01-01")], [chapter, at("2030-01-05")]]);
		expect(texts(needsALook({ ...f, tracked: new Map(), modified: older, shape }), "shape")).toEqual([]);
		const newer = new Map([...quiet(f), [shape.path, at("2030-01-08")], [chapter, at("2030-01-05")]]);
		expect(texts(needsALook({ ...f, tracked: new Map(), modified: newer, shape }), "shape")).toEqual(["02.00 Shape of the book changed on 2030-01-08 (file date), after this chapter's card was last changed on 2030-01-05 (file date)"]);
	});
});

describe("the inventory", () => {
	it("writes the book's open ends as one note", () => {
		const f = fixture();
		const needs = needsALook({ ...f, tracked: new Map(), modified: new Map([...quiet(f), ["people/Mara.md", at("2030-01-12")]]) });
		const text = inventory({ ...f, needs, written: "2030-01-20 09:05", open: f.path("02.01") });
		expect(text.startsWith("---\nwritten: 2030-01-20T09:05\nproseprince: false\n---\n")).toBe(true);
		expect(text).toContain("### Paid before made (1)\n\n- the drowned bell: made in [[03.01 - Inland]]; paid in [[02.02 - Far Shore]]");
		expect(text).toContain("1 promise paid, not listed.");
		expect(text).toContain("## Needs a look (2 scenes, 2 reasons)\n\n- [[02.01 - Ferry]]\n  - Mara: 1 fact added on 2030-01-12, after its continuity pass of 2030-01-10 → [[Mara]]\n- [[02.02 - Far Shore]]\n  - Pays \"the drowned bell\" before it is made, in 03.01 Inland → [[03.01 - Inland]]");
		expect(text).toContain("No pass yet (2): [[01.02 - Ledger]], [[02.02 - Far Shore]]");
		expect(text).toContain("## To clear, by chapter\n\nNothing to clear.");
		expect(text).toContain("## Scene: 02.01 Ferry");
		expect(text).toContain("### Reading list\n\n- [[Mara]] (character, decided): in the scene · 1 fact");
		expect(text).toContain("By this scene the reader has been shown 3 facts, 1 of them here.");
		expect(text).toContain("Shown here:\n\n- Mara pays in tokens. ([[Mara]], [[02.01 - Ferry]]) — there: Mara");
		expect(text.endsWith("\n")).toBe(true);
		expect(text).not.toMatch(/\n\n\n/);
	});

	it("leaves the scene part out when no scene was open, and counts what is left to clear", () => {
		const records = [sceneRecord("d/01.01 - Harbour.md", "01.01 - Harbour", "Mara waited.\n\n> [!note] The bell is cracked.\n\n> [!question] Who rang it?\n", {})!];
		const book = buildBook(records);
		const relations = buildRelations(book, [], new Map());
		const needs = needsALook({ book, relations, tracked: new Map(), prints: new Map(), modified: new Map() });
		const text = inventory({ book, relations, needs, written: "2030-01-20 09:05" });
		expect(text).toContain("- 01: 1 note to file, 1 question\n  - [[01.01 - Harbour]]: 2");
		expect(text).toContain("No scene names a promise yet.");
		expect(text).toContain("Nothing can be said yet: no scene has a pass date.");
		expect(text).not.toContain("## Scene:");
	});
});
