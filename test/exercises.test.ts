import { describe, expect, it } from "vitest";
import { analyzeParagraph } from "../src/analysis/analyze";
import { excludedBlocks } from "../src/analysis/mask";
import { EXERCISES, exerciseById, exerciseNote } from "../src/exercises/definitions";
import { evaluateExercise, exerciseBlocks, lookBackProgress, matchModel, partSections } from "../src/exercises/evaluate";

/** Fill an exercise note's parts with text, then evaluate it as the editor would. */
function run(id: string, parts: string[], options: { model?: string; subject?: string; written?: string; today?: string } = {}) {
	const exercise = exerciseById(id)!;
	let doc = exerciseNote(exercise, "2026-10-25", options.model);
	if (options.subject) doc = doc.replace("subject: ", `subject: ${options.subject}`);
	exercise.parts.forEach((p, i) => {
		doc = doc.replace(`## ${p.heading}\n\n`, `## ${p.heading}\n\n${parts[i] ?? ""}`);
	});
	const { prose, model } = exerciseBlocks(doc, excludedBlocks(doc));
	const analyse = (ps: { from: number; text: string }[]) => ps.map((p) => ({ ...p, result: analyzeParagraph(p.text, 25) }));
	return evaluateExercise({ exercise, doc, paragraphs: analyse(prose), model: analyse(model), subject: options.subject, written: options.written ?? "2026-10-25", today: options.today ?? "2026-10-25" });
}

const rule = (report: ReturnType<typeof run>, part: number, label: string) => report.parts[part]!.rules.find((r) => r.label.startsWith(label))!;

describe("exercise notes", () => {
	it("start with frontmatter, a folded brief, a heading per part and look-back boxes", () => {
		const note = exerciseNote(exerciseById("short-and-long")!, "2026-10-25");
		expect(note).toMatch(/^---\nproseprince-exercise: short-and-long\nwritten: 2026-10-25\n---/);
		expect(note).toContain("> [!exercise]- Short and long");
		expect(note).toContain("## Part one: short");
		expect(note).toContain("## Part two: long");
		expect(note).toMatch(/## Look back\n\n- \[ \] /);
		expect(partSections(note, exerciseById("short-and-long")!).every(Boolean)).toBe(true);
	});

	it("leave the brief, headings and frontmatter out of the writing", () => {
		const note = exerciseNote(exerciseById("chastity")!, "2026-10-25").replace("## Your scene\n\n", "## Your scene\n\nThe cat sat.");
		const { prose } = exerciseBlocks(note, excludedBlocks(note));
		expect(prose.map((p) => p.text)).toEqual(["The cat sat."]);
		expect(note.slice(prose[0]!.from, prose[0]!.from + 12)).toBe("The cat sat.");
	});

	it("count ticked look-back boxes", () => {
		expect(lookBackProgress("## Look back\n\n- [x] one\n- [ ] two\n- [X] three\n")).toEqual({ done: 2, total: 3 });
	});

	it("have briefs for every exercise", () => {
		for (const e of EXERCISES) {
			expect(e.parts.length).toBeGreaterThan(0);
			expect(e.lookBack.length).toBeGreaterThan(0);
			expect(e.source.length).toBeGreaterThan(10);
		}
	});
});

describe("short and long", () => {
	const short = "She crept in. The floor creaked. He did not wake. She held her breath. The clock ticked on. She crossed the rug. Her hand found the drawer. It slid open without a sound. Inside lay the letters. She took them all. He turned over in his sleep. She froze by the bed. His breathing slowed again. She backed out. The door clicked shut behind her. Outside, the rain had stopped. She ran. Her feet hit the wet road. A dog barked once. Lights came on behind her. She did not look back. The lane bent left. A car passed. She hid in a doorway. Her heart slammed. The car went on. She counted to ten. Then she ran again.";

	it("passes short sentences and flags a long one", () => {
		const good = run("short-and-long", [short]);
		expect(rule(good, 0, "Every sentence").ok).toBe(true);
		expect(rule(good, 0, "Words").ok).toBe(true);
		const bad = run("short-and-long", [`${short} She ran down the lane past the church and the shuttered shop.`]);
		expect(rule(bad, 0, "Every sentence").ok).toBe(false);
		expect(rule(bad, 0, "Every sentence").breaches).toHaveLength(1);
	});

	it("wants part two as a single sentence", () => {
		const report = run("short-and-long", ["", "They all came to the table that night, the aunts and the cousins and the old man in his chair, and nobody said the thing they had come to say."]);
		expect(rule(report, 1, "One sentence").ok).toBe(true);
		expect(rule(report, 0, "Words").ok).toBeNull();
		const two = run("short-and-long", ["", "They all came. Nobody spoke."]);
		expect(rule(two, 1, "One sentence").ok).toBe(false);
	});
});

describe("clean sequence", () => {
	it("flags action clauses, -ly adverbs, extra thens and repeated openers", () => {
		const report = run("clean-sequence", ["Pulling off her gloves, she lit the stove. She quickly cracked the eggs. Then she turned the heat up. Then she burned her thumb."]);
		expect(rule(report, 0, "No -ing").ok).toBe(false);
		expect(rule(report, 0, "No -ly").breaches.map((b) => b.note)).toHaveLength(1);
		expect(rule(report, 0, '"then"').ok).toBe(false);
		expect(rule(report, 0, "No two sentences").ok).toBe(false);
	});
});

describe("chastity", () => {
	it("flags adjectives and adverbs, allows a few time words, and forbids dialogue", () => {
		const report = run("chastity", ['The old dog slept. Then the wind came. "Go," she said.']);
		const modifiers = rule(report, 0, "No adjectives");
		expect(modifiers.ok).toBe(false);
		expect(modifiers.breaches.some((b) => b.note.includes('"old"'))).toBe(true);
		expect(modifiers.breaches.some((b) => b.note.includes('"Then"'))).toBe(false);
		expect(rule(report, 0, "No dialogue").ok).toBe(false);
	});
});

describe("feel it without naming it", () => {
	it("flags named emotions and filter words", () => {
		const report = run("feel-without-naming", ["She was furious. She felt the door give. She threw the keys at the wall."]);
		expect(rule(report, 0, "No named emotions").breaches).toHaveLength(1);
		expect(rule(report, 0, "No filter words").ok).toBe(false);
	});

	it("keeps the event's name out of part two", () => {
		const text = "The kitchen floor still shone where they had mopped it. A chair lay on its side. Someone had pushed the funeral flowers into the bin.";
		expect(rule(run("feel-without-naming", ["", text], { subject: "funeral" }), 1, "The event").ok).toBe(false);
		expect(rule(run("feel-without-naming", ["", text]), 1, "The event").ok).toBeNull();
		expect(rule(run("feel-without-naming", ["", "I stood in the kitchen."]), 1, "No first-person").ok).toBe(false);
	});
});

describe("imitation", () => {
	it("compares sentence shapes with the model", () => {
		const model = "The ship was dark. Nobody moved on the bridge for a long, long time. Then the lights came up.";
		const close = run("imitation", ["The house was cold. Nobody spoke in the kitchen for a long, slow hour. Then the kettle boiled."], { model });
		expect(close.shape?.model).toHaveLength(3);
		expect(rule(close, 0, "Shape").ok).toBe(true);
		const far = run("imitation", ["Cold."], { model });
		expect(rule(far, 0, "Shape").ok).toBe(false);
		expect(matchModel([], [3]).ok).toBeNull();
	});
});

describe("rereading", () => {
	it("is ready a day after writing", () => {
		expect(run("chastity", [""], { written: "2026-10-25", today: "2026-10-25" }).reread).toEqual({ from: "2026-10-26", ready: false });
		expect(run("chastity", [""], { written: "2026-10-25", today: "2026-10-27" }).reread?.ready).toBe(true);
	});
});
