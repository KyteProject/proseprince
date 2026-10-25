import { describe, expect, it } from "vitest";
import { analyzeParagraph } from "../src/analysis/analyze";
import { combine, styleOf } from "../src/analysis/readability";
import { beatAt, beatNotes, beatsOf, countLine, headingsIn, isNamedPerson, repeatedWords } from "../src/analysis/outline";

describe("outline", () => {
	const doc = "---\ntitle: x\n---\n# The Inspection\n\nIntro.\n\n## The girl's hole\nText.\n\n```\n# not a heading\n```\n## Station house\nMore.";

	it("finds headings outside frontmatter and code", () => {
		const excluded = [{ from: 0, to: 16 }, { from: doc.indexOf("```"), to: doc.lastIndexOf("```") + 3 }];
		expect(headingsIn(doc, excluded).map((h) => [h.level, h.text])).toEqual([[1, "The Inspection"], [2, "The girl's hole"], [2, "Station house"]]);
	});

	it("takes a single top heading as the title and the rest as beats", () => {
		const h = headingsIn(doc, []).filter((x) => x.text !== "not a heading");
		const { title, beats } = beatsOf(h);
		expect(title?.text).toBe("The Inspection");
		expect(beats.map((b) => b.text)).toEqual(["The girl's hole", "Station house"]);
		expect(beatsOf(h.slice(1)).title).toBeNull();
		expect(beatsOf(h.slice(0, 1))).toEqual({ title: h[0], beats: [] });
		expect(beatAt(beats, beats[1]!.from + 3)).toBe(1);
		expect(beatAt(beats, 0)).toBe(-1);
	});

	it("counts prose only", () => {
		expect(countLine("## A beat")).toEqual({ words: 0, characters: 0 });
		expect(countLine("> [!todo] fix this")).toEqual({ words: 0, characters: 0 });
		expect(countLine("She ran. %% speaker: Linh %%")).toEqual({ words: 2, characters: 8 });
		expect(countLine("It's *very* late, isn't it?")).toMatchObject({ words: 5 });
	});

	it("finds repeated content words, folding plurals and skipping names", () => {
		const words = ["door", "doors", "door", "Linh", "Linh", "Linh", "said", "said", "said", "cold", "cold"];
		expect(repeatedWords(words, new Set(["linh"]))).toEqual([{ word: "door", n: 3 }]);
	});

	it("reads each beat's target and change from its hidden comment", () => {
		const text = "# Title\n## Loft\n%%Beat.\ntarget: 350\nchange: \n%%\nText.\n## Bar\n%%Beat.\ntarget: 1,100\nchange: Linh lets her in\n%%\n## Open\nNo notes here.";
		const headings = headingsIn(text, []);
		expect(beatNotes(text, headings)).toEqual([{}, { target: 350 }, { target: 1100, change: "Linh lets her in" }, {}]);
	});

	it("reads who is in each beat, names and descriptions", () => {
		const text = "## Loft\n%%Beat.\nwho: Linh, Ruoi, Unnamed partner.\n%%\n## Bar\n%%\nwho: \n%%";
		expect(beatNotes(text, headingsIn(text, []))).toEqual([{ who: ["Linh", "Ruoi", "Unnamed partner"] }, {}]);
		expect(isNamedPerson("Ruoi")).toBe(true);
		expect(isNamedPerson("Eufemie Kanda")).toBe(true);
		expect(isNamedPerson("Unnamed partner")).toBe(false);
		expect(isNamedPerson("the inspector")).toBe(false);
	});
});

describe("style figures", () => {
	it("counts sentence length and narration word choice", () => {
		const { stats } = analyzeParagraph(`The old door creaked slowly. She walked quickly to the table and sat. "Really, truly lovely," she said.`, 25);
		const s = styleOf(stats);
		expect(s.wordsPerSentence).toBeCloseTo(stats.words / stats.sentences);
		expect(stats.lyAdverbs).toBe(2);
		expect(stats.adjectives).toBe(1);
		expect(stats.narrationWords).toBeLessThan(stats.words);
		expect(styleOf(combine([stats, stats])).adjectives).toBeCloseTo(s.adjectives!);
	});

	it("needs a few rated nouns before giving a concrete share", () => {
		expect(styleOf(analyzeParagraph("The door.", 25).stats).concreteNouns).toBeNull();
		const s = styleOf(analyzeParagraph("The door, the table, the knife, the cup and the stone sat beside her fear.", 25).stats);
		expect(s.concreteNouns).toBeGreaterThan(0.7);
	});
});
