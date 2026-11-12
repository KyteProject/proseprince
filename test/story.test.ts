import { describe, expect, it } from "vitest";
import {
	annotationsIn,
	asNames,
	buildBook,
	cardLines,
	chapterOutline,
	countAnnotations,
	fillSceneTemplate,
	nextSceneNumber,
	parseSceneName,
	readThrough,
	sceneFileName,
	scenePromises,
	sceneCard,
	sceneRecord,
	SCENE_TEMPLATE,
	toClear,
} from "../src/analysis/story";

describe("scene names", () => {
	it("reads chapter and scene from the file name", () => {
		expect(parseSceneName("04.02 - Breakfast Bar")).toEqual({ chapter: 4, scene: 2, title: "Breakfast Bar" });
		expect(parseSceneName("01.02 The processing")).toEqual({ chapter: 1, scene: 2, title: "The processing" });
		expect(parseSceneName("04.00 - The Job")).toEqual({ chapter: 4, scene: 0, title: "The Job" });
		expect(parseSceneName("12.03")).toEqual({ chapter: 12, scene: 3, title: "" });
		expect(parseSceneName("Leviathan Wakes Chapter 2")).toBeNull();
		expect(parseSceneName("Chapter 4.1")).toBeNull();
	});

	it("names the next scene file", () => {
		const names = ["04.00 - The Job", "04.01 - Loft", "04.03 - Office", "05.01 - Later"].map((n) => parseSceneName(n)!);
		expect(nextSceneNumber(names, 4)).toBe(4);
		expect(nextSceneNumber(names, 6)).toBe(1);
		expect(sceneFileName(4, 4, "Tien's Office: [draft]?")).toBe("04.04 - Tien's Office draft");
		expect(sceneFileName(4, 4, "")).toBe("04.04");
	});
});

describe("annotations", () => {
	const doc = [
		"---",
		"promises:",
		"  - [ ]",
		"---",
		"# Title",
		"%%Beat.",
		"outline:",
		"- [ ] not a fix: inside a comment",
		"%%",
		"> [!note]- Tien's office is on the docks.",
		"> a second line of the same note",
		"",
		"> [!question]- #openloop is a cockbeast a bird?",
		"> [!todo]- check: is precursor flammable",
		"> [!TODO] move this up",
		"> [!info] not ours",
		"",
		"She ==stumbled over== the line @@ here.",
		"And she @@wrapped this@@ too.",
		"%% filed → [[10.17 The port and the Lurch]] %%",
		"- [ ] fix the tag",
		"The port on [world name #openloop] was quiet. [FIX: who speaks] See [[20.2 Ruoi]] and [a link](http://x.test).[^1]",
		"What does she want here #openloop",
		"%% checked -> [[40.72 Night shift sleep]] %%",
		"```",
		"> [!note] in code",
		"- [ ] in code",
		"```",
	].join("\n");
	const found = annotationsIn(doc);

	it("finds each kind once, where it sits", () => {
		expect(countAnnotations(found)).toEqual({ note: 1, question: 2, todo: 1, check: 1, fix: 1, stumble: 3, placeholder: 2, filed: 1, checked: 1 });
		expect(toClear(countAnnotations(found))).toBe(11);
		expect(found.map((a) => a.from)).toEqual([...found.map((a) => a.from)].sort((a, b) => a - b));
		for (const a of found) expect(a.from).toBeLessThan(doc.length);
	});

	it("keeps a short label for each", () => {
		const text = (kind: string) => found.filter((a) => a.kind === kind).map((a) => a.text);
		expect(text("note")).toEqual(["Tien's office is on the docks."]);
		expect(text("check")).toEqual(["check: is precursor flammable"]);
		expect(text("question")).toEqual(["is a cockbeast a bird?", "What does she want here"]);
		expect(text("stumble")).toEqual(["stumbled over", "here.", "wrapped this"]);
		expect(text("placeholder")).toEqual(["world name #openloop", "FIX: who speaks"]);
		expect(text("filed")).toEqual(["10.17 The port and the Lurch"]);
		expect(doc.slice(found.find((a) => a.kind === "placeholder")!.from).startsWith("[world name")).toBe(true);
	});
});

describe("frontmatter", () => {
	it("cleans lists", () => {
		expect(asNames([null, " ruoi-hops ", "", "[[20.2 Ruoi|Ruoi]]", "[[Linh]]"])).toEqual(["ruoi-hops", "Ruoi", "Linh"]);
		expect(asNames("Linh, Ruoi")).toEqual(["Linh", "Ruoi"]);
		expect(asNames(undefined)).toEqual([]);
	});

	it("reads a scene's fields", () => {
		const text = "---\nx: y\n---\n# The Job\n%%Card.\nwants: comfort\n%%\nShe ran to the door.\n> [!note]- a fact\n";
		const r = sceneRecord("60_draft/04.02 - Bar.md", "04.02 - Bar", text, { pov: "Linh", characters: ["Linh", null], target: "3,000", promises: [null], pays: ["ruoi-hops"], dev: "2026-10-20", continuity: null, day: 3 })!;
		expect(r).toMatchObject({ kind: "scene", words: 5, target: 3000, pov: "Linh", characters: ["Linh"], promises: [], pays: ["ruoi-hops"], day: "3", flags: { dev: "2026-10-20", line: undefined, continuity: undefined } });
		expect(r.annotations.note).toBe(1);
		expect(sceneRecord("x/Notes.md", "Notes", text, {})).toBeNull();
	});
});

describe("cards", () => {
	it("reads a card's label and lines as written", () => {
		expect(cardLines("Beat.\ntarget: 450\nwho: Linh, Ruoi\nchange: \noutline:\n\t1. wakes\n\t2. shower\n")).toEqual({ label: "Beat", lines: [["target", "450"], ["who", "Linh, Ruoi"]] });
		expect(cardLines("Card.\n**Chapter shape**: Lie first, then stack.\n**yes-but or no-and**: no and\n")).toEqual({ label: "Card", lines: [["Chapter shape", "Lie first, then stack."], ["yes-but or no-and", "no and"]] });
		expect(cardLines(" speaker: Linh ")).toEqual({ label: null, lines: [["speaker", "Linh"]] });
	});

	const chapter = [
		"---", "type: chapter", "---",
		"# The Job",
		"%%Card.", "**Chapter shape**: Lie first, then stack.", "%%",
		"## Linh's Loft",
		"%%Beat.", "target: 550", "who: Linh, Ruoi", "change: he holds the wall", "%%",
		"%% speaker: Linh %%",
		"[[04.01 - Linh's Loft]]",
		"## Breakfast Bar",
		"%%", "target: 400", "who: [[Linh]], Chef", "%%",
		"[[60_draft/04.02 - Breakfast Bar.md|the bar]] and [[04.03 - Second helping#top]]",
		"## The Lurch",
	].join("\n");

	it("reads a chapter note's plan", () => {
		const o = chapterOutline(chapter);
		expect(o.title).toBe("The Job");
		expect(o.card).toEqual([["Chapter shape", "Lie first, then stack."]]);
		expect(o.beats.map((b) => [b.text, b.target, b.links])).toEqual([
			["Linh's Loft", 550, ["04.01 - Linh's Loft"]],
			["Breakfast Bar", 400, ["04.02 - Breakfast Bar", "04.03 - Second helping"]],
			["The Lurch", undefined, []],
		]);
		expect(o.beats[0]!.card).toEqual([["target", "550"], ["who", "Linh, Ruoi"], ["change", "he holds the wall"]]);
		expect(o.beats[1]!.who).toEqual(["Linh", "Chef"]);
		expect(o.beats[2]!.card).toEqual([]);
	});

	it("builds the book: beats, attached scenes, unplanned scenes", () => {
		const scene = (name: string, words: number, fm: Record<string, unknown> = {}) => sceneRecord(`60_draft/${name}.md`, name, `${"word ".repeat(words)}\n`, fm)!;
		const book = buildBook([
			scene("04.04 - The Lurch", 300),
			scene("04.02 - Breakfast Bar", 400),
			scene("04.01 - Linh's Loft", 500),
			scene("04.03 - Second helping", 100),
			scene("04.05 - Found while drafting", 50),
			sceneRecord("60_draft/04.00 - The Job.md", "04.00 - The Job", chapter, { target: 3000 })!,
			scene("01.01 - The Inspection", 200),
		]);
		expect(book.chapters.map((c) => [c.number, c.title, c.words, c.target])).toEqual([[1, "", 200, undefined], [4, "The Job", 1350, 3000]]);
		const four = book.chapters[1]!;
		expect(four.beats.map((b) => [b.text, b.words, b.scenes.map((s) => s.name.scene)])).toEqual([["Linh's Loft", 500, [1]], ["Breakfast Bar", 500, [2, 3]], ["The Lurch", 300, [4]]]);
		expect(four.unplanned.map((s) => s.name.title)).toEqual(["Found while drafting"]);
		expect(four.outOfOrder).toBe(false);
		expect(book.chapters[0]!.unplanned).toHaveLength(1);
		expect(book.scenes.map((s) => s.name.scene)).toEqual([1, 1, 2, 3, 4, 5]);
		expect(book.words).toBe(1550);
		expect(book.places.get("60_draft/04.03 - Second helping.md")?.beat?.text).toBe("Breakfast Bar");
		expect(book.places.get("60_draft/04.05 - Found while drafting.md")?.beat).toBeNull();
		expect(book.places.has("60_draft/04.00 - The Job.md")).toBe(false);
	});

	it("attaches an embedded scene the same as a linked one", () => {
		const embedded = chapter.replace("[[04.01 - Linh's Loft]]", "![[04.01 - Linh's Loft]]");
		expect(chapterOutline(embedded).beats[0]!.links).toEqual(["04.01 - Linh's Loft"]);
	});

	it("says when the outline and the numbers disagree", () => {
		const swapped = chapter.replace("[[04.01 - Linh's Loft]]", "[[04.04 - The Lurch]]");
		const scene = (name: string) => sceneRecord(`d/${name}.md`, name, "text\n", {})!;
		const book = buildBook([sceneRecord("d/04.00 - The Job.md", "04.00 - The Job", swapped, {})!, scene("04.02 - Breakfast Bar"), scene("04.04 - The Lurch")]);
		expect(book.chapters[0]!.outOfOrder).toBe(true);
	});
});

describe("beat cards kept in scene files", () => {
	const card = ["%%Beat.", "target: 600", "who: Mara, Oskar", "change: she stops waiting", "outline:", "\t1. the quay", "%%"];

	it("reads the card under a scene's title", () => {
		const doc = ["---", "type: draft", "---", "# Harbour", ...card, "", "Mara watched the ferry.", ""].join("\n");
		expect(sceneCard(doc)).toEqual({ card: [["target", "600"], ["who", "Mara, Oskar"], ["change", "she stops waiting"]], target: 600, who: ["Mara", "Oskar"], change: "she stops waiting" });
		expect(sceneRecord("d/02.01 - Harbour.md", "02.01 - Harbour", doc, {})!.card?.target).toBe(600);
	});

	it("leaves out cards under the note's own beats, and comments that aren't cards", () => {
		const doc = ["# Harbour", "%% checked → [[Tides]] %%", "", "Prose.", "## On the quay", ...card, ""].join("\n");
		expect(sceneCard(doc)).toBeNull();
		expect(sceneCard(["Prose first.", ...card].join("\n"))?.target).toBe(600);
		expect(sceneRecord("d/02.00 - Crossing.md", "02.00 - Crossing", ["# Crossing", ...card].join("\n"), {})!.card).toBeUndefined();
	});

	const chapter = ["# The Crossing", "## Harbour", "[[02.01 - Harbour]]", "## Ledger", "%%Beat.", "target: 300", "who: Pell", "%%", "[[02.02 - Ledger]]", "## Far Shore", "%%Beat.", "target: 200", "%%"].join("\n");
	const scene = (name: string, body: string[]) => sceneRecord(`d/${name}.md`, name, [`# ${name.slice(5)}`, ...body, "", "word word word", ""].join("\n"), {})!;

	it("uses the scene's card for its beat, and the chapter note's where the scene has none", () => {
		const book = buildBook([
			sceneRecord("d/02.00 - The Crossing.md", "02.00 - The Crossing", chapter, {})!,
			scene("02.01 - Harbour", card),
			scene("02.02 - Ledger", []),
		]);
		const [harbour, ledger, far] = book.chapters[0]!.beats;
		expect([harbour!.target, harbour!.who, harbour!.change, harbour!.cardIn?.name.scene, harbour!.twoCards]).toEqual([600, ["Mara", "Oskar"], "she stops waiting", 1, undefined]);
		expect([ledger!.target, ledger!.who, ledger!.cardIn]).toEqual([300, ["Pell"], undefined]);
		expect([far!.target, far!.scenes.length]).toEqual([200, 0]);
		expect(book.places.get("d/02.01 - Harbour.md")?.beat?.card[0]).toEqual(["target", "600"]);
	});

	it("prefers the scene's card when both hold one, and says so", () => {
		const book = buildBook([sceneRecord("d/02.00 - The Crossing.md", "02.00 - The Crossing", chapter, {})!, scene("02.02 - Ledger", card)]);
		const ledger = book.chapters[0]!.beats[1]!;
		expect([ledger.target, ledger.who, ledger.twoCards]).toEqual([600, ["Mara", "Oskar"], true]);
	});
});

describe("promises", () => {
	const scene = (name: string, fm: Record<string, unknown>) => sceneRecord(`d/${name}.md`, name, "text\n", fm)!;
	const book = buildBook([
		scene("01.01 - A", { promises: ["the-pig", "Mother"] }),
		scene("01.02 - B", { progresses: ["the-pig"], pays: ["ghost"] }),
		scene("02.01 - C", { pays: ["the-pig", "early"], promises: ["wall"], progresses: ["wall"] }),
		scene("03.01 - D", { promises: ["early"] }),
		// One chapter, split into scenes that each carry the chapter's promises.
		scene("04.01 - E", { promises: ["ruoi-hops", "no-drama"] }),
		scene("04.02 - F", { promises: ["ruoi-hops", "no-drama"] }),
		scene("04.03 - G", { promises: ["Ruoi-Hops"] }),
	]);
	const row = (name: string) => book.promises.find((p) => p.name.toLowerCase() === name)!;

	it("derives each promise's status from reading order", () => {
		expect(Object.fromEntries(book.promises.map((p) => [p.name, p.status]))).toEqual({
			ghost: "never-made", early: "paid-before-made", Mother: "open", "ruoi-hops": "open", "no-drama": "open", wall: "progressing", "the-pig": "paid",
		});
		expect(book.promises.map((p) => p.status).slice(0, 2)).toEqual(["never-made", "paid-before-made"]);
		expect(row("the-pig")).toMatchObject({ made: [{ label: "01.01 A" }], progressed: [{ label: "01.02 B" }], paid: [{ label: "02.01 C" }] });
	});

	it("shows a promise repeated through a chapter once", () => {
		expect(row("ruoi-hops").made).toEqual([{ path: "d/04.01 - E.md", label: "Chapter 4", chapter: 4, scene: 1, repeats: 3 }]);
		expect(row("no-drama").made[0]).toMatchObject({ repeats: 2 });
		expect(row("mother").made[0]!.repeats).toBeUndefined();
	});

	it("gives a scene its own promise lines", () => {
		expect(scenePromises(book, book.scenes[2]!)).toEqual([
			{ role: "Makes", name: "wall", status: "progressing" },
			{ role: "Progresses", name: "wall", status: "progressing" },
			{ role: "Pays", name: "the-pig", status: "paid" },
			{ role: "Pays", name: "early", status: "paid-before-made" },
		]);
	});
});

describe("new scenes", () => {
	const fill = { title: "Tien's Office", date: "2026-11-10", pov: "Linh", characters: ["Linh", "Ruoi", "Tien: the inspector"] };

	it("fills the built-in template", () => {
		const text = fillSceneTemplate(SCENE_TEMPLATE, fill);
		expect(text).toContain("pov: Linh\ncharacters:\n  - Linh\n  - Ruoi\n  - \"Tien: the inspector\"\nsetting:");
		expect(text).toContain("promises:\n  - \nprogresses:");
		expect(text.endsWith("# Tien's Office\n\n")).toBe(true);
	});

	it("leaves what a template already says", () => {
		const own = "---\ntype: draft\npov: Ruoi\ncharacters: [Ruoi]\ntarget:\n---\n# {{title}}\n%% Card. {{date}}\nWho is in the room:\n%%\n";
		expect(fillSceneTemplate(own, fill)).toBe("---\ntype: draft\npov: Ruoi\ncharacters: [Ruoi]\ntarget:\n---\n# Tien's Office\n%% Card. 2026-11-10\nWho is in the room:\n%%\n");
		expect(fillSceneTemplate("# {{title}}\n", fill)).toBe("# Tien's Office\n");
		expect(fillSceneTemplate("---\ncharacters: []\npov:\n---\n", { ...fill, pov: undefined })).toBe("---\ncharacters:\n  - Linh\n  - Ruoi\n  - \"Tien: the inspector\"\npov:\n---\n");
	});
});

describe("read-through", () => {
	const scene = (name: string, words: number) => sceneRecord(`60_draft/${name}.md`, name, `${"word ".repeat(words)}\n`, {})!;
	const book = buildBook([
		scene("01.01 - The Inspection", 200),
		sceneRecord("60_draft/04.00 - The Job.md", "04.00 - The Job", "## Loft\n", {})!,
		scene("04.02 - Breakfast Bar", 400),
		scene("04.01 - Linh's Loft", 500),
		scene("04.07 - Nightmare Room", 0),
		scene("05.01 - Not written", 0),
	]);

	it("embeds a chapter's written scenes in reading order", () => {
		const r = readThrough(book, 4)!;
		expect(r.name).toBe("Read 04 The Job");
		expect(r.text.startsWith("---\ncssclasses:\n  - pp-readthrough\nproseprince: false\n---\n%% Made by ProsePrince")).toBe(true);
		expect(r.text.endsWith("# 04 The Job\n\n![[60_draft/04.01 - Linh's Loft]]\n\n***\n\n![[60_draft/04.02 - Breakfast Bar]]\n")).toBe(true);
		expect(r.text).not.toContain("Nightmare Room");
		expect(r.text).not.toContain("04.00");
	});

	it("reads the whole book, chapter by chapter, leaving out chapters with nothing written", () => {
		const r = readThrough(book)!;
		expect(r.name).toBe("Read the book");
		expect(r.text.match(/^# .*$/gm)).toEqual(["# 01", "# 04 The Job"]);
		expect(r.text.match(/!\[\[/g)).toHaveLength(3);
		expect(readThrough(book, 5)).toBeNull();
		expect(readThrough(book, 9)).toBeNull();
	});
});
