import { describe, expect, it } from "vitest";
import { analyzeParagraph } from "../src/analysis/analyze";
import { attribute, colourSlots, pinIn, resetsTurns, speakersIn, untaggedRuns } from "../src/analysis/dialogue/attribute";
import { cssColour, nameGroupsIn, speakerIndex } from "../src/analysis/dialogue/cast";
import { longestStretches, voices } from "../src/analysis/dialogue/voices";

/** The dialogue of a one-line paragraph. */
const info = (text: string, names: string[] = []) => analyzeParagraph(text, 25, names).dialogue[0]!;
const tagOf = (text: string, names: string[] = []) => analyzeParagraph(text, 25, names).dialogue.flatMap((l) => l.spans)[0]?.tag ?? null;
/** Each line of each paragraph as a unit, as the editor feeds them to `attribute`. */
const units = (paragraphs: string[], names: string[] = []) =>
	paragraphs.flatMap((text) => analyzeParagraph(text, 25, names.filter((n) => text.includes(n))).dialogue.map((line) => ({ text: text.slice(line.from, line.to), info: line })));

/** Attribute a scene; returns "speaker/how" per line, "?" when unknown, "~" when a guess. */
function scene(paragraphs: string[], names: string[] = []): string[] {
	const result = attribute(units(paragraphs, names));
	return result.flatMap((spans) => spans.map((a) => (a.thought ? "thought" : `${a.speaker ?? "?"}${a.how ? `/${a.how}` : ""}${a.speaker && !a.certain ? "~" : ""}`)));
}

describe("speech and tags", () => {
	it("reads a tag after the line, in either order", () => {
		expect(tagOf(`"Go," Linh said.`, ["Linh"])).toMatchObject({ speaker: "Linh", kind: "name", verb: "said", inverted: false });
		expect(tagOf(`"Go," said Linh.`, ["Linh"])).toMatchObject({ speaker: "Linh", inverted: true });
		expect(tagOf(`"Er... no, mam." replied his father.`)).toMatchObject({ speaker: "his father", kind: "described", inverted: true });
		expect(tagOf(`"Follow," the inspector said.`)).toMatchObject({ speaker: "the inspector", kind: "described" });
		expect(tagOf(`"Yes," he whispered softly.`)).toMatchObject({ speaker: "he", kind: "pronoun", verb: "whispered" });
	});

	it("reads a tag before the line, across a line break", () => {
		expect(tagOf(`Leaning in, Tien said:\n"Linh, is it?"`, ["Tien", "Linh"])).toMatchObject({ speaker: "Tien", kind: "name" });
	});

	it("treats a quoted word mid-sentence as not speech", () => {
		expect(info(`He called the shed "home" for years.`).spans).toEqual([]);
	});

	it("finds thought: a thought verb, or a whole italic sentence", () => {
		expect(info(`"Strange," Linh thought.`, ["Linh"]).spans[0]?.thought).toBe(true);
		expect(info(`*What was going to happen now?* He looked away.`).spans[0]?.thought).toBe(true);
		expect(info(`It was *very* odd.`).spans).toEqual([]);
	});

	it("counts only people doing something as beats", () => {
		expect(info(`Linh set down his cup. "Fine."`, ["Linh"]).beats).toEqual([{ speaker: "Linh", kind: "name" }]);
		expect(info(`She looked at Linh. "Fine."`, ["Linh"]).beats).toEqual([]);
		expect(info(`Grin returning, she shrugged. "Fine."`).beats).toEqual([]);
	});
});

describe("attribution", () => {
	it("alternates untagged lines in a two-person exchange, as guesses", () => {
		expect(scene([`"Ready?" Linh asked.`, `"No," said Tien.`, `"Why not?"`, `"Because."`], ["Linh", "Tien"])).toEqual([
			"Linh/tag", "Tien/tag", "Linh/turns~", "Tien/turns~",
		]);
	});

	it("takes a beat as certain", () => {
		expect(scene([`"Ready?" Linh asked.`, `Tien shook her head. "No."`], ["Linh", "Tien"])).toEqual(["Linh/tag", "Tien/beat"]);
	});

	it("resolves a pronoun tag by turn-taking", () => {
		expect(scene([`"Ready?" Linh asked.`, `"No," said Tien.`, `"Why not?" he asked.`], ["Linh", "Tien"])).toEqual([
			"Linh/tag", "Tien/tag", "Linh/pronoun",
		]);
	});

	it("forgets the exchange at a scene break or after a long gap", () => {
		expect(scene([`"Ready?" Linh asked.`, `"No," said Tien.`, `***`, `"Why not?"`], ["Linh", "Tien"])).toEqual(["Linh/tag", "Tien/tag", "?"]);
		expect(scene([`"Ready?" Linh asked.`, `"No," said Tien.`, `Rain.`, `More rain.`, `Still rain.`, `"Why not?"`], ["Linh", "Tien"])).toEqual([
			"Linh/tag", "Tien/tag", "?",
		]);
	});

	it("leaves untagged lines alone when one paragraph tags two people", () => {
		expect(scene([`"Hi," Linh said. "Hello," Tien said. "Well?"`], ["Linh", "Tien"])).toEqual(["Linh/tag", "Tien/tag", "?"]);
	});

	it("honours a pin and a not-speech comment", () => {
		expect(scene([`"Ready?" %% speaker: Tien %%`])).toEqual(["Tien/pin"]);
		expect(scene([`They called it "the pit" here. %% not speech %%`, `"Ready?"`])).toEqual(["?"]);
		expect(pinIn("text %% speaker: Eufemie %%")).toBe("Eufemie");
		expect(pinIn("text %% not echo %%")).toBeNull();
	});

	it("maps aliases to one speaker", () => {
		const index = speakerIndex(nameGroupsIn("## Names\n- Eufemie | Effie\n- Linh"));
		const result = attribute(units([`"Hi," Effie said.`, `"Hello," said Eufemie.`], ["Effie", "Eufemie"]), (n) => index.get(n.toLowerCase()) ?? n);
		expect(speakersIn(result)).toEqual(["Eufemie"]);
	});

	it("knows scene breaks and headings", () => {
		expect(resetsTurns("***")).toBe(true);
		expect(resetsTurns("## Chapter 2")).toBe(true);
		expect(resetsTurns("* * *")).toBe(true);
		expect(resetsTurns("She waited.")).toBe(false);
	});
});

describe("speaker colours", () => {
	it("keeps a name's colour when others join, and avoids clashes", () => {
		const two = colourSlots(["Linh", "Tien"]);
		const three = colourSlots(["Linh", "Tien", "Eufemie"]);
		expect(three.get("Linh")).toBe(two.get("Linh"));
		expect(three.get("Tien")).toBe(two.get("Tien"));
		expect(new Set(three.values()).size).toBe(3);
	});

	it("accepts only hex colours from notes", () => {
		expect(cssColour("#a1b2c3")).toBe("#a1b2c3");
		expect(cssColour("#abc")).toBe("#abc");
		expect(cssColour("red; background: url(x)")).toBeUndefined();
	});

	it("groups World note names with their aliases", () => {
		expect(nameGroupsIn("# World\n## Names\n- Eufemie | Effie: the mother\n- Linh\n## Places\n- Gian")).toEqual([["Eufemie", "Effie"], ["Linh"]]);
		const index = speakerIndex([["Eufemie Kanda", "Effie"]]);
		expect(index.get("eufemie")).toBe("Eufemie Kanda");
		expect(index.get("effie")).toBe("Eufemie Kanda");
	});
});

describe("dialogue conventions", () => {
	const found = (text: string, names: string[] = []) =>
		analyzeParagraph(text, 25, names).highlights
			.filter((h) => "check" in h.kind && ["dialoguePunct", "nonSpeechTag", "showyTag", "invertedTag", "twoSpeakers", "quotedThought"].includes(h.kind.check))
			.map((h) => `${(h.kind as { check: string }).check}:${text.slice(h.from, h.to)}`);

	it("puts commas and full stops inside the quotes", () => {
		expect(found(`"Liar", Linh mouthed.`, ["Linh"])).toEqual(["dialoguePunct:,"]);
		expect(found(`"It's late".`)).toEqual(["dialoguePunct:."]);
		expect(found(`"Liar," Linh mouthed.`, ["Linh"])).toEqual([]);
	});

	it("wants a comma, not a full stop, before a named or described tag", () => {
		expect(found(`"No, mam." replied his father.`)).toContain("dialoguePunct:.");
		expect(found(`"Go." Linh said.`, ["Linh"])).toEqual(["dialoguePunct:."]);
		expect(found(`"Fine." Linh smiled.`, ["Linh"])).toEqual([]);
	});

	it("flags mismatched quote marks", () => {
		expect(found(`'The fuck is that?", Linh thought.`, ["Linh"])).toContain("dialoguePunct:'");
		expect(found(`"It's fine," she said, "isn't it?"`)).toEqual([]);
	});

	it("knows tags that can't make words from beats", () => {
		expect(found(`"Fine," she smiled.`)).toEqual(["nonSpeechTag:smiled"]);
		expect(found(`"Fine." She smiled.`)).toEqual([]);
	});

	it("hints at showy tags", () => {
		expect(found(`"Get out," she hissed.`)).toEqual(["showyTag:hissed"]);
		expect(found(`"Get out," she said.`)).toEqual([]);
	});

	it("prefers the speaker first, unless the subject is long", () => {
		expect(found(`"Come in," said Linh.`, ["Linh"])).toEqual(["invertedTag:said Linh"]);
		expect(found(`"No," replied his father.`)).toEqual(["invertedTag:replied his father"]);
		expect(found(`"No," said he.`)).toEqual(["invertedTag:said he"]);
		expect(found(`"No," said the man by the door.`)).toEqual([]);
	});

	it("wants a new paragraph for a new speaker", () => {
		expect(found(`"Ready?" Linh asked. "No," Tien said.`, ["Linh", "Tien"])).toEqual(["twoSpeakers:Tien said"]);
		expect(found(`"Ready?" Linh asked. "Are you?" he added.`, ["Linh"])).toEqual([]);
	});

	it("keeps thought out of quotes, and to oneself implied", () => {
		expect(found(`"Strange," she thought.`)).toEqual(["quotedThought:\""]);
		expect(found(`Linh thought to himself that it was odd.`, ["Linh"])).toEqual(["quotedThought:to himself"]);
	});
});

describe("untagged runs", () => {
	it("flags every fifth untagged line in a row", () => {
		const paragraphs = units([`"Ready?" Linh asked.`, `"No," said Tien.`, `"Why?"`, `"Because."`, `"Because what?"`, `"Just because."`, `"Fine."`, `"Good."`], ["Linh", "Tien"]);
		const runs = untaggedRuns(attribute(paragraphs), paragraphs).map(([i]) => i);
		expect(runs).toEqual([6]);
	});
});

describe("line by line, titles and pronouns", () => {
	it("treats each line as its own speaker turn", () => {
		// The unnamed second speaker keeps the turns alternating back to Linh.
		expect(scene([`"Morning," Linh said.\n"Hey, how did you sleep?" she asked.\n"Badly."`], ["Linh"])).toEqual(["Linh/tag", "?", "Linh/turns~"]);
	});

	it("drops a title before a name", () => {
		expect(tagOf(`"Sit," said Captain Shaddid.`, ["Shaddid"])).toMatchObject({ speaker: "Shaddid", kind: "name" });
	});

	it("learns who she is from the narration, and that he is the other one", () => {
		expect(scene([
			`"Ready?" Miller asked.`,
			`"Not yet," Shaddid said.`,
			`Shaddid leaned back. She looked tired.`,
			`"What have you found?" she asked.`,
			`"Nothing," he said.`,
		], ["Miller", "Shaddid"])).toEqual(["Miller/tag", "Shaddid/tag", "Shaddid/pronoun", "Miller/pronoun"]);
	});

	it("doesn't take a place or organisation for a person", () => {
		expect(scene([
			`"Ready?" Miller asked.`,
			`"Not yet," Shaddid said.`,
			`The Alliance was quiet. It waited.`,
			`"Why?" he asked.`,
		], ["Miller", "Shaddid", "Alliance"])).toEqual(["Miller/tag", "Shaddid/tag", "Miller/pronoun"]);
	});
});

describe("voices", () => {
	const line = (speaker: string, text: string, guessed = false) => ({ speaker, text, guessed });

	it("counts lines, words, questions and share", () => {
		const [linh, tien] = voices([line("Linh", `"Where are we going?"`), line("Linh", `"Now!"`, true), line("Tien", `"Home. We go home now."`)]).sort((a, b) => a.speaker.localeCompare(b.speaker));
		expect(linh).toMatchObject({ lines: 2, guessed: 1, words: 5, questions: 0.5, exclamations: 0.5 });
		expect(tien).toMatchObject({ lines: 1, words: 5, questions: 0 });
		expect(linh!.share).toBeCloseTo(0.5);
	});

	it("finds the words one speaker leans on, ignoring function words", () => {
		const lines = [
			...Array.from({ length: 6 }, () => line("Amos", `"Yeah, cap, that's a real bad idea, cap."`)),
			...Array.from({ length: 6 }, () => line("Naomi", `"It's a good plan and the ship can take it."`)),
		];
		const amos = voices(lines).find((v) => v.speaker === "Amos")!;
		expect(amos.distinctive).toContain("cap");
		expect(amos.distinctive).not.toContain("a");
	});

	it("finds long stretches of narration or dialogue", () => {
		const shape = [...Array(9).fill(false), true, null, ...Array(8).fill(true)];
		expect(longestStretches(shape).map((s) => [s.kind, s.length, s.first])).toEqual([["narration", 9, 0], ["dialogue", 8, 11]]);
		expect(longestStretches([false, true, false])).toEqual([]);
	});
});
