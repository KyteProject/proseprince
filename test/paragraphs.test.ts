import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { excludedBlocks } from "../src/analysis/mask";
import { applyExclusions, paragraphsAround } from "../src/editor/paragraphs";

const doc = Text.of(["First para line one", "line two.", "", "Second para.", "", "```", "code", "", "more", "```", "Third."]);

describe("paragraphsAround", () => {
	it("expands a range inside a paragraph to the whole paragraph", () => {
		const inside = doc.line(2).from + 2;
		expect(paragraphsAround(doc, [{ from: inside, to: inside }])).toEqual([{ from: 0, text: "First para line one\nline two." }]);
	});

	it("returns each paragraph once across overlapping ranges", () => {
		const all = paragraphsAround(doc, [{ from: 0, to: doc.length }, { from: 0, to: 5 }]);
		expect(all.map((p) => p.text)).toEqual(["First para line one\nline two.", "Second para.", "```\ncode", "more\n```\nThird."]);
	});
});

describe("applyExclusions", () => {
	it("blanks fenced code even when the fence spans blank lines", () => {
		const paragraphs = applyExclusions(paragraphsAround(doc, [{ from: 0, to: doc.length }]), excludedBlocks(doc.toString()));
		expect(paragraphs.map((p) => p.text.trim())).toEqual(["First para line one\nline two.", "Second para.", "Third."]);
		const third = paragraphs[2]!;
		expect(doc.sliceString(third.from, third.from + third.text.length).endsWith("Third.")).toBe(true);
	});

	it("blanks callouts and quotes, even one joined to the prose above", () => {
		const note = Text.of(["She ran.", "> [!todo] Cut this", "> She very slowly walked.", "", "> [!note]", "> Notes.", "", "> A quoted letter.", "", "Then she stopped."]);
		const paragraphs = applyExclusions(paragraphsAround(note, [{ from: 0, to: note.length }]), excludedBlocks(note.toString()));
		expect(paragraphs.map((p) => p.text.trim())).toEqual(["She ran.", "Then she stopped."]);
	});
});
