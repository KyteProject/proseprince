import { describe, expect, it } from "vitest";
import { buildRelations, canonNote, dayValue, nameMatcher, revealsUpTo, sceneKnowledge, sceneOrder } from "../src/analysis/relations";
import { buildBook, proseOf, sceneRecord, type SceneRecord } from "../src/analysis/story";

/** A small invented book: two chapters, a chapter note with beats, and four notes about the story. */
const scene = (name: string, fm: Record<string, unknown>, body: string) => ({ record: sceneRecord(`draft/${name}.md`, name, body, fm)!, body });
const drafts = [
	scene("01.01 - Harbour", { pov: "Mara", characters: ["Mara", "Oskar"], setting: "the Saltmarket", day: "Day 3" }, "Mara counted the gulls. Oskar laughed.\n\n> [!note]- The harbour bell is cracked.\n"),
	scene("01.02 - Ledger", { pov: "Oskar", characters: ["Oskar"], day: "Day 1" }, "Oskar opened the ledger. A tide token lay inside, and he thought of Mara.\n\n%% filed → [[Tide tokens]] %%\n"),
	scene("02.00 - The Crossing", { type: "chapter" }, "# The Crossing\n\n## Ferry\n%%Beat.\nwho: Mara, Oskar, the Ferryman\n%%\n[[02.01 - Ferry]]\n"),
	scene("02.01 - Ferry", { pov: "Mara", characters: ["Mara", "Pell"] }, "Mara paid with tide tokens. Behind them the Saltmarket sank into fog.\n\n%% filed → [[Mara]] %%\n%% filed → [[Lost note]] %%\n"),
	scene("02.02 - Far Shore", { pov: "Mara", characters: ["Mara"] }, ""),
];
const notes = [
	canonNote("people/Mara.md", "Mara", ["# Mara", "", "- Mara counts things when she is afraid. ([[01.01 - Harbour]])", "", "## Added 2030-01-05", "- Mara cannot swim. ([[02.01 - Ferry]], [[01.01 - Harbour]])", "### Detail", "- Her mother drowned. ([[02.02 - Far Shore]])"].join("\n"), { type: "character", status: "decided" }),
	canonNote("people/10.2 Oskar (The Clerk).md", "10.2 Oskar (The Clerk)", "- Oskar keeps two ledgers. ([[01.02 - Ledger]])\n- Not a fact: see [[Mara]].\n", { type: "character", status: "open" }),
	canonNote("world/Tide tokens.md", "Tide tokens", "Tokens are stamped at the harbour.\n", { type: "system", status: "open", aliases: ["tide token", "tide tokens"] }),
	canonNote("world/20.1 The Saltmarket.md", "20.1 The Saltmarket", "- The market floods at spring tide. ([[01.01 - Harbour]])\n", { type: "system", aliases: ["The Saltmarket"] }),
	canonNote("world/Unrelated.md", "Unrelated", "Nothing about the book.\n", {}),
];
const book = buildBook(drafts.map((d) => d.record));
const prose = new Map(drafts.map((d) => [d.record.path, proseOf(d.body)]));
const relations = buildRelations(book, notes, prose);
const names = (scenes: readonly SceneRecord[]) => scenes.map((s) => s.basename.slice(0, 5));

describe("notes about the story", () => {
	it("reads names from aliases and a character note's title", () => {
		expect(notes[0]!.names).toEqual(["Mara"]);
		expect(notes[1]!.title).toBe("Oskar (The Clerk)");
		expect(notes[1]!.names).toEqual(["Oskar", "The Clerk"]);
		expect(notes[2]!.names).toEqual(["tide token", "tide tokens"]);
		// A system note's title is not a name unless it is listed as an alias.
		expect(canonNote("w/Salt Farms.md", "Salt Farms", "", { type: "system" }).names).toEqual([]);
		// A character note whose title is a sentence is an idea about a character.
		expect(canonNote("p/x.md", "20.15 Mara has always suspected her mother", "", { type: "character" }).names).toEqual([]);
	});

	it("reads each cited line as a fact, with the date of its Added section", () => {
		expect(notes[0]!.facts).toEqual([
			{ text: "Mara counts things when she is afraid.", cites: ["01.01 - Harbour"], line: 2 },
			{ text: "Mara cannot swim.", cites: ["02.01 - Ferry", "01.01 - Harbour"], line: 5, added: "2030-01-05" },
			{ text: "Her mother drowned.", cites: ["02.02 - Far Shore"], line: 7, added: "2030-01-05" },
		]);
		expect(notes[1]!.facts.map((f) => f.text)).toEqual(["Oskar keeps two ledgers."]);
	});

	it("keeps brackets in the fact and in the link apart from the citation", () => {
		const note = canonNote("p/t.md", "Pell", "- Pell (the ferryman) drinks rum. ([[10.2 Oskar (The Clerk)|Oskar]], [[02.01 - Ferry#top]])\n```\n- in code ([[02.01 - Ferry]])\n```\n", {});
		expect(note.facts).toEqual([{ text: "Pell (the ferryman) drinks rum.", cites: ["10.2 Oskar (The Clerk)", "02.01 - Ferry"], line: 0 }]);
	});
});

describe("names in prose", () => {
	it("matches a capitalised name as written and a lower-case one in any case", () => {
		expect(nameMatcher("Wren")!.test("a wren sang")).toBe(false);
		expect(nameMatcher("Wren")!.test("Then Wren's knife")).toBe(true);
		expect(nameMatcher("salt pan")!.test("A Salt  Pan.")).toBe(true);
		expect(nameMatcher("The Lurch")!.test("into the Lurch")).toBe(true);
		expect(nameMatcher("Mara")!.test("Tamara")).toBe(false);
		expect(nameMatcher("a")).toBeNull();
	});
});

describe("reveals", () => {
	it("lists what the reader was shown, by the first scene a fact cites", () => {
		expect(relations.reveals.map((r) => [r.scene.basename.slice(0, 5), r.note?.title ?? "unfiled", r.text])).toEqual([
			["01.01", "Mara", "Mara counts things when she is afraid."],
			["01.01", "Mara", "Mara cannot swim."],
			["01.01", "The Saltmarket", "The market floods at spring tide."],
			["01.01", "unfiled", "The harbour bell is cracked."],
			["01.02", "Oskar (The Clerk)", "Oskar keeps two ledgers."],
			["02.02", "Mara", "Her mother drowned."],
		]);
		expect(names(relations.reveals[1]!.also)).toEqual(["02.01"]);
	});

	it("says who was there", () => {
		expect(relations.reveals[0]!.knownTo).toEqual(["Mara", "Oskar"]);
		expect(relations.reveals[4]!.knownTo).toEqual(["Oskar"]);
	});

	it("rewinds to a scene, in reading order or by day", () => {
		const reading = sceneOrder(book, "reading");
		expect(revealsUpTo(relations, reading, "draft/01.01 - Harbour.md")).toHaveLength(4);
		expect(revealsUpTo(relations, reading, null)).toHaveLength(6);
		const days = sceneOrder(book, "day");
		expect(names(days)).toEqual(["01.02", "01.01", "02.01", "02.02"]);
		expect(revealsUpTo(relations, days, "draft/01.02 - Ledger.md").map((r) => r.text)).toEqual(["Oskar keeps two ledgers."]);
		expect(relations.hasDays).toBe(true);
		expect(dayValue("2030-01-02")).toBeLessThan(dayValue("2030-01-03"));
		expect(dayValue("the day after")).toBeNaN();
	});

	it("knows what a scene's point of view was not there for, and what comes later", () => {
		const k = sceneKnowledge(relations, book, "draft/02.01 - Ferry.md")!;
		expect(k.pov).toBe("Mara");
		expect(k.before).toBe(5);
		expect(k.here).toEqual([]);
		expect(k.ahead.map((r) => r.text)).toEqual(["Oskar keeps two ledgers."]);
		expect(k.later.map((r) => r.text)).toEqual(["Her mother drowned."]);
		expect(sceneKnowledge(relations, book, "draft/nope.md")).toBeNull();
	});
});

describe("touches", () => {
	const of = (name: string) => (relations.touches.get(`draft/${name}.md`) ?? []).map((t) => [t.note.title, t.declared.join("+"), t.facts, t.filed, t.mentions.join("|")]);

	it("joins a scene to its notes by what is declared, recorded and mentioned", () => {
		expect(of("01.01 - Harbour")).toEqual([
			["Oskar (The Clerk)", "character", 0, 0, "Oskar"],
			["Mara", "pov+character", 2, 0, "Mara"],
			["The Saltmarket", "setting", 1, 0, ""],
		]);
		expect(of("01.02 - Ledger")).toEqual([
			["Oskar (The Clerk)", "pov+character", 1, 0, "Oskar"],
			["Mara", "", 0, 0, "Mara"],
			["Tide tokens", "", 0, 1, "tide token"],
		]);
	});

	it("takes a beat's who: as declared, and finds a name whatever its article", () => {
		expect(of("02.01 - Ferry")).toEqual([
			["Oskar (The Clerk)", "beat", 0, 0, ""],
			["Mara", "pov+character+beat", 1, 1, "Mara"],
			// Characters first, then by name; "the Saltmarket" is found without its article's capital.
			["The Saltmarket", "", 0, 0, "The Saltmarket"],
			["Tide tokens", "", 0, 0, "tide tokens"],
		]);
	});

	it("lists the scenes that touch a note, in reading order", () => {
		expect(names(relations.touchedBy.get("world/Tide tokens.md")!.map((t) => t.scene))).toEqual(["01.02", "02.01"]);
	});

	it("flags a note the prose keeps naming with nothing recorded", () => {
		expect(relations.quiet.map((q) => [q.note.title, names(q.scenes)])).toEqual([["Tide tokens", ["01.02", "02.01"]]]);
	});

	it("flags a filed comment its note doesn't bear out", () => {
		expect(relations.filings.map((f) => [f.scene.basename.slice(0, 5), f.name, f.count, !!f.note, names(f.elsewhere)])).toEqual([
			["01.02", "Tide tokens", 1, true, []],
			["02.01", "Lost note", 1, false, []],
		]);
	});

	it("points at the scene a split chapter's citations still name", () => {
		const split = [
			sceneRecord("d/04.01 - Attic.md", "04.01 - Attic", "He woke.\n", {})!,
			sceneRecord("d/04.02 - Bar.md", "04.02 - Bar", "They ate.\n\n%% filed → [[Port]] %%\n%% filed → [[Port]] %%\n", {})!,
		];
		const port = canonNote("w/Port.md", "Port", "- Rope is rare. ([[04.01 - Attic]])\n- Salt is dear. ([[04.01 - Attic]])\n", {});
		const r = buildRelations(buildBook(split), [port], new Map());
		expect(r.filings.map((f) => [f.scene.basename, f.name, f.count, names(f.elsewhere)])).toEqual([["04.02 - Bar", "Port", 2, ["04.01"]]]);
		expect(r.reveals.map((x) => x.scene.basename)).toEqual(["04.01 - Attic", "04.01 - Attic"]);
	});

	it("counts a name two notes claim for neither", () => {
		const twins = [canonNote("a.md", "Reed", "", { aliases: ["Reed"] }), canonNote("b.md", "Reed beds", "", { aliases: ["reed"] })];
		const one = sceneRecord("d/01.01.md", "01.01", "Reed walked through the reed.\n", {})!;
		const r = buildRelations(buildBook([one]), twins, new Map([[one.path, proseOf("Reed walked through the reed.\n")]]));
		expect(r.touches.size).toBe(0);
		expect(r.ambiguous.map((a) => a.notes.map((n) => n.basename))).toEqual([["Reed", "Reed beds"]]);
		// Unless only one of them is a character.
		const person = [canonNote("a.md", "Reed", "", { type: "character" }), twins[1]!];
		expect(buildRelations(buildBook([one]), person, new Map([[one.path, "Reed walked"]])).touches.get(one.path)!.map((t) => t.note.basename)).toEqual(["Reed"]);
	});
});

describe("cast", () => {
	const row = (name: string) => relations.cast.find((r) => r.name === name)!;

	it("has a row for everyone listed, planned or with a character note", () => {
		expect(relations.cast.map((r) => r.name)).toEqual(["Mara", "Oskar", "Pell"]);
		expect(row("Mara").note?.title).toBe("Mara");
		expect(row("Pell").note).toBeNull();
	});

	it("separates present from mentioned, and finds first and last", () => {
		expect(names(row("Mara").present)).toEqual(["01.01", "02.01", "02.02"]);
		expect(names(row("Mara").mentioned)).toEqual(["01.02"]);
		expect([row("Oskar").first?.basename.slice(0, 5), row("Oskar").last?.basename.slice(0, 5)]).toEqual(["01.01", "01.02"]);
	});

	it("lists where the plan, the properties and the prose disagree", () => {
		const issues = (name: string) => row(name).issues.map((i) => `${i.kind} ${i.scene.basename.slice(0, 5)}`);
		// In the beat's who: but in none of its scenes; listed in the scene but not in the beat; listed but never named.
		expect(issues("Oskar")).toEqual(["beat-only 02.01"]);
		expect(issues("Pell")).toEqual(["scene-only 02.01", "unnamed 02.01"]);
		// A scene with nothing written yet can't fail to name anyone.
		expect(issues("Mara")).toEqual([]);
	});

	it("holds only a named person to being named, and reads a typed name loosely", () => {
		const outline = sceneRecord("d/03.00.md", "03.00", "## Cellar\n%%Beat.\nwho: Linh, Unnamed partner\n%%\n[[03.01]]\n", {})!;
		const s = sceneRecord("d/03.01.md", "03.01", "x", { characters: ["Linh", "The Inspector", "Two guards", "Unnamed partner", "Lantern Man"] })!;
		const inspector = canonNote("p/The Inspector.md", "The Inspector", "", { type: "character" });
		const r = buildRelations(buildBook([outline, s]), [inspector], new Map([[s.path, "Linh watched the inspector. The Lantern man grinned."]]));
		const issues = Object.fromEntries(r.cast.map((c) => [c.name, c.issues.map((i) => i.kind)]));
		expect(issues).toEqual({ Linh: [], "The Inspector": ["scene-only"], "Two guards": [], "Unnamed partner": [], "Lantern Man": ["scene-only"] });
	});

	it("takes a description in the prose for someone who also has a name", () => {
		const warden = canonNote("p/The Warden.md", "The Warden", "", { type: "character", aliases: ["Brann"] });
		const scenes = [
			sceneRecord("d/01.01.md", "01.01", "x", { characters: ["The Warden"] })!,
			sceneRecord("d/01.02.md", "01.02", "x", { characters: ["Brann"] })!,
			sceneRecord("d/01.03.md", "01.03", "x", {})!,
		];
		const prose = new Map([
			[scenes[0]!.path, "The gate opened and the warden waved them through."],
			[scenes[1]!.path, "He said nothing at all."],
			[scenes[2]!.path, "Somewhere a warden was shouting."],
		]);
		const r = buildRelations(buildBook(scenes), [warden], prose);
		expect(r.cast).toHaveLength(1);
		expect(r.cast[0]!.name).toBe("Brann");
		expect(r.cast[0]!.issues.map((i) => `${i.kind} ${i.scene.basename}`)).toEqual(["unnamed 01.02"]);
		// The loose reading is for that one check: a scene he is not in still needs his name as written.
		expect(r.cast[0]!.mentioned).toEqual([]);
	});

	it("groups aliases through the World note's names", () => {
		const s = sceneRecord("d/01.01.md", "01.01", "x", { characters: ["Effie", "Eufemie"] })!;
		const r = buildRelations(buildBook([s]), [], new Map(), (n) => (n === "Effie" ? "Eufemie" : n));
		expect(r.cast.map((c) => [c.name, c.present.length])).toEqual([["Eufemie", 1]]);
	});
});
