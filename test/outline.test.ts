import { describe, expect, it } from "vitest";
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
