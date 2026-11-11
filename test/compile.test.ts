import { describe, expect, it } from "vitest";
import { chapterHeading, cleanProse, compile, inTheWayLabel, inTheWayTotals } from "../src/analysis/compile";
import { buildBook, sceneRecord } from "../src/analysis/story";

const HARBOUR = [
	"---",
	"pov: Mara",
	"summary: Mara counts the gulls",
	"---",
	"# Harbour",
	"",
	"## At the quay",
	"%%Beat.",
	"target: 300",
	"who: Mara, Oskar",
	"%%",
	"",
	"Mara counted the ==grey== gulls.   Twelve. %% check the number %%",
	" *\"Count them again,\"* Oskar said. #openloop",
	"",
	"> [!note] The harbour bell is cracked.",
	"> It has been since the flood.",
	"",
	"- [ ] fix the pacing here",
	"- [x] done already",
	"",
	"She went to [[Tide tokens|the token stall]] and @@paid twice@@, in berth #4.",
	"",
	"![[map.png]]",
	"",
	"***",
	"",
	"The [harbourmaster name] waved from [[The Saltmarket]]. %% a comment",
	"that runs on %% Then he was gone.",
	"",
	"```",
	"not prose",
	"```",
].join("\r\n");

describe("a scene's clean prose", () => {
	it("keeps the story and nothing else", () => {
		expect(cleanProse(HARBOUR)).toBe([
			"Mara counted the grey gulls. Twelve.",
			"*\"Count them again,\"* Oskar said.",
			"",
			"She went to the token stall and paid twice, in berth #4.",
			"",
			"***",
			"",
			"The [harbourmaster name] waved from The Saltmarket. Then he was gone.",
		].join("\n"));
	});

	it("leaves emphasis, a list and a number sign alone", () => {
		expect(cleanProse("He was **not** *sure*.\n\n- one\n- two\n\nRoom #12 was shut.\n")).toBe("He was **not** *sure*.\n\n- one\n- two\n\nRoom #12 was shut.");
	});

	it("drops a break that has prose on only one side of it", () => {
		expect(cleanProse("---\npov: Mara\n---\n***\n\nOne.\n\n* * *\n\n%% cut %%\n\n---\n\nTwo.\n\n---\n\n> [!note] At the foot.\n")).toBe("One.\n\n* * *\n\nTwo.");
	});

	it("gives nothing for a note with no prose", () => {
		expect(cleanProse("---\npov: Mara\n---\n# Far Shore\n\n%% to write %%\n\n> [!todo] everything\n")).toBe("");
	});
});

describe("the manuscript", () => {
	const scene = (name: string, body: string, fm: Record<string, unknown> = {}) => ({ record: sceneRecord(`draft/${name}.md`, name, body, fm)!, body });
	const drafts = [
		scene("01.01 - Harbour", HARBOUR.replace(/\r\n/g, "\n")),
		scene("01.02 - Ledger", "# Ledger\n\nOskar opened the ledger.\n"),
		scene("01.03 - Far Shore", "# Far Shore\n\n%% to write %%\n"),
		scene("02.00 - The Crossing", "# The Crossing\n\n## Ferry\n[[02.01 - Ferry]]\n", { type: "chapter" }),
		scene("02.01 - Ferry", "The ferry was late.\n\n> [!question] Who paid?\n"),
		scene("03.01 - Inland", ""),
	];
	const book = buildBook(drafts.map((d) => d.record));
	const texts = new Map(drafts.map((d) => [d.record.path, d.body]));
	const written = "2030-01-10 09:05";

	it("sets written scenes in reading order under chapter headings, with a break between scenes", () => {
		const page = compile(book, texts, { written })!;
		expect(page.name).toBe("Manuscript");
		expect([page.chapters, page.scenes]).toEqual([2, 3]);
		const body = page.text.slice(page.text.indexOf("\n---\n") + 5);
		expect(body).toBe([
			"",
			"# Chapter 1",
			"",
			cleanProse(HARBOUR),
			"",
			"***",
			"",
			"Oskar opened the ledger.",
			"",
			"# Chapter 2: The Crossing",
			"",
			"The ferry was late.",
			"",
		].join("\n"));
		// Nothing of the plan, and no comment that an export would carry along.
		expect(page.text).not.toMatch(/%%|\[!|target:|## /);
	});

	it("stamps the note and keeps it out of the book", () => {
		const page = compile(book, texts, { written })!;
		expect(page.text.startsWith(`---\nproseprince: false\nwritten: 2030-01-10T09:05\nwords: ${page.words}\nnote: "`)).toBe(true);
		// 34 in the first scene (fix-later lines and the comment over two lines are not in it), 4 and 4 in the others.
		expect(page.words).toBe(42);
	});

	it("compiles one chapter, named for it", () => {
		const page = compile(book, texts, { chapter: 2, written })!;
		expect(page.name).toBe("Manuscript 02 The Crossing");
		expect([page.chapters, page.scenes]).toEqual([1, 1]);
		expect(page.text).toContain("# Chapter 2: The Crossing\n\nThe ferry was late.\n");
		expect(page.text).not.toContain("Chapter 1");
		expect(compile(book, texts, { chapter: 1, written })!.name).toBe("Manuscript 01");
	});

	it("says what the scenes still carry, scene by scene", () => {
		const page = compile(book, texts, { written })!;
		expect(page.inTheWay.map((r) => [r.scene.basename.slice(0, 5), inTheWayLabel(r.counts), r.total])).toEqual([
			["01.01", "1 note to file, 1 question, 1 fix-later box, 2 stumbles, 1 placeholder", 6],
			["02.01", "1 question", 1],
		]);
		expect(inTheWayLabel(inTheWayTotals(page.inTheWay))).toBe("1 note to file, 2 questions, 1 fix-later box, 2 stumbles, 1 placeholder");
	});

	it("is null when nothing is written, and leaves out a scene it has no text for", () => {
		expect(compile(book, texts, { chapter: 3, written })).toBeNull();
		expect(compile(book, new Map(), { written })).toBeNull();
		expect(compile(book, new Map([[drafts[1]!.record.path, drafts[1]!.body]]), { written })!.scenes).toBe(1);
	});

	it("heads a chapter by its number, and its title when it has one", () => {
		expect(chapterHeading({ number: 4, title: "The Job" })).toBe("Chapter 4: The Job");
		expect(chapterHeading({ number: 4, title: "" })).toBe("Chapter 4");
	});
});
