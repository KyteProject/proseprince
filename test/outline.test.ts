import { describe, expect, it } from "vitest";
import { beatAt, beatsOf, countLine, headingsIn, repeatedWords } from "../src/analysis/outline";

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
});
