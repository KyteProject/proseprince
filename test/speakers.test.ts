import { describe, expect, it } from "vitest";
import { analyzeParagraph } from "../src/analysis/analyze";
import { sceneSpeech, type SceneSpeech, speechParagraphs } from "../src/analysis/dialogue/scene";
import { buildRelations, canonNote, speechLabel } from "../src/analysis/relations";
import { buildBook, proseOf, sceneRecord, type SceneRecord } from "../src/analysis/story";

/** Who speaks in a note, the way the plugin reads it: paragraphs out, each analysed, speech back in. */
function heardIn(text: string, cast: string[] = [], canonical?: (name: string) => string): SceneSpeech {
	const paragraphs = speechParagraphs(text, cast);
	return sceneSpeech(text, paragraphs, paragraphs.map((p) => analyzeParagraph(p.text, 25, p.names).dialogue), canonical);
}
const lines = (s: SceneSpeech) => s.speakers.map((k) => `${k.name} ${k.tagged}/${k.placed}/${k.guessed}`);

const HARBOUR = [
	"---",
	"pov: Mara",
	"characters:",
	"  - Mara",
	"---",
	"# Harbour",
	"",
	"%% Pell said nothing here: \"this is a comment,\" Pell said. %%",
	"",
	"\"Count them again,\" Mara said.",
	"",
	"\"Twelve,\" Oskar said. \"Same as before.\"",
	"",
	"\"And now?\"",
	"",
	"\"Still twelve.\"",
	"",
	"> [!note] \"A callout is not the story,\" Pell said.",
	"",
	"The clerk shut the ledger. \"Go home,\" the clerk said.",
	"",
].join("\n");

describe("a scene's paragraphs", () => {
	it("splits on blank lines and leaves out frontmatter and callouts", () => {
		const paragraphs = speechParagraphs(HARBOUR);
		// A one-line comment stays a paragraph here: it is blanked when the paragraph is analysed.
		expect(paragraphs.map((p) => p.text.trim())).toEqual(["# Harbour", "%% Pell said nothing here: \"this is a comment,\" Pell said. %%", "\"Count them again,\" Mara said.", "\"Twelve,\" Oskar said. \"Same as before.\"", "\"And now?\"", "\"Still twelve.\"", "The clerk shut the ledger. \"Go home,\" the clerk said."]);
		// Offsets are the note's own: what is left out is blanked, and nothing moves.
		expect(paragraphs[0]!.from).toBe(0);
		for (const p of paragraphs) [...p.text].forEach((ch, i) => expect(ch === " " || ch === HARBOUR[p.from + i]).toBe(true));
	});

	it("finds known names in each paragraph: from the note, the cast and a beat's who:", () => {
		const text = "## Quay\n%%Beat.\nwho: Brann, the Ferryman\n%%\n\nBrann waited.\n\nShe turned to Wren and shrugged.\n\nWren nodded at Mara.\n";
		const names = speechParagraphs(text, ["Mara"]).map((p) => p.names);
		expect(names).toEqual([[], ["Brann"], ["Wren"], ["Mara", "Wren"]]);
	});
});

describe("who speaks in a scene", () => {
	it("counts tagged lines and guesses apart, and hears nothing in a comment or a callout", () => {
		const s = heardIn(HARBOUR, ["Mara", "Oskar"]);
		expect(s.lines).toBe(6);
		expect(s.unknown).toBe(0);
		expect(lines(s)).toEqual(["Mara 1/0/1", "Oskar 2/0/1", "the clerk 1/0/0"]);
	});

	it("gives a line to whoever the narration beside it names", () => {
		expect(lines(heardIn("\"Twelve,\" Oskar said.\n\nMara set down her cup. \"Count again.\"\n", ["Mara", "Oskar"]))).toEqual(["Oskar 1/0/0", "Mara 0/1/0"]);
	});

	it("leaves a line with no tag, beat or exchange to nobody", () => {
		const s = heardIn("The hall was empty.\n\n*\"Unlock it.\"*\n\nNothing moved.\n");
		expect(s).toEqual({ speakers: [], lines: 1, unknown: 1 });
	});

	it("puts an alias under the name it belongs to, and takes a pinned speaker", () => {
		const canonical = (name: string) => (name.toLowerCase() === "ossie" ? "Oskar" : name);
		expect(lines(heardIn("\"Twelve,\" Ossie said.\n\n\"Twelve,\" Oskar said.\n\n\"Fine.\" %% speaker: Mara %%\n", ["Ossie", "Oskar"], canonical))).toEqual(["Oskar 2/0/0", "Mara 1/0/0"]);
	});

	it("says nothing of a note with no speech", () => {
		expect(heardIn("Mara counted the gulls.\n")).toEqual({ speakers: [], lines: 0, unknown: 0 });
	});
});

describe("who speaks, in the cast", () => {
	const scene = (name: string, fm: Record<string, unknown>, body: string) => ({ record: sceneRecord(`draft/${name}.md`, name, body, fm)!, body });
	const drafts = [
		scene("01.01 - Harbour", { pov: "Mara", characters: ["Mara", "Oskar"] }, "\"Count them again,\" Mara said.\n\n\"Twelve,\" the clerk said.\n\n\"And now?\"\n\n\"Mind the tide,\" Pell said.\n\n\"Aye,\" the ferryman said.\n"),
		scene("01.02 - Ledger", { pov: "Oskar", characters: ["Oskar", "Mara"] }, "Oskar opened the ledger and thought of Mara.\n\n\"Twelve,\" he said aloud, to nobody.\n"),
		scene("01.03 - Quay", {}, "\"Mind the tide,\" Pell said.\n"),
		scene("01.04 - Far Shore", { pov: "Mara", characters: ["Mara"] }, ""),
	];
	const notes = [
		canonNote("people/Mara.md", "Mara", "", { type: "character" }),
		canonNote("people/10.2 Oskar (The Clerk).md", "10.2 Oskar (The Clerk)", "", { type: "character" }),
	];
	const book = buildBook(drafts.map((d) => d.record));
	const prose = new Map(drafts.map((d) => [d.record.path, proseOf(d.body)]));
	const heard = new Map(drafts.filter((d) => d.record.words).map((d) => [d.record.path, heardIn(d.body, ["Mara", "Oskar", "Pell"])]));
	const relations = buildRelations(book, notes, prose, (n) => n, heard);
	const row = (name: string) => relations.cast.find((r) => r.name === name);
	const names = (scenes: readonly SceneRecord[]) => scenes.map((s) => s.basename.slice(0, 5));

	it("lists the scenes each speaks in, taking a description for the note it belongs to", () => {
		expect(names(row("Mara")!.spoke)).toEqual(["01.01"]);
		// "the clerk said" is Oskar's line: his note answers to The Clerk.
		expect(names(row("Oskar")!.spoke)).toEqual(["01.01"]);
		expect(relations.speech.get("draft/01.01 - Harbour.md")!.speakers.map((s) => [s.name, s.lines, s.guessed])).toEqual([["Mara", 1, 1], ["Oskar", 1, 0], ["Pell", 1, 0], ["the ferryman", 1, 0]]);
	});

	it("does not call someone unnamed in a scene they speak in under a description", () => {
		expect(row("Oskar")!.issues.filter((i) => i.kind === "unnamed")).toEqual([]);
	});

	it("gives a tagged name nobody lists a row, and holds it against a scene that lists others", () => {
		const pell = row("Pell")!;
		expect(pell.note).toBeNull();
		expect(names(pell.spoke)).toEqual(["01.01", "01.03"]);
		// 01.03 lists nobody, which is a gap and no disagreement.
		expect(pell.issues.map((i) => [i.kind, i.scene.basename.slice(0, 5)])).toEqual([["speaks-unlisted", "01.01"]]);
		expect(pell.first?.basename.slice(0, 5)).toBe("01.01");
		expect(pell.last?.basename.slice(0, 5)).toBe("01.03");
	});

	it("takes part of a name, or somebody's mother, for someone the scene lists", () => {
		const d = [
			scene("01.01 - Harbour", { pov: "Mara", characters: ["Mara", "Madame Voss", "The Mother"] }, "\"Sit,\" Madame said.\n\n\"She will not,\" her mother said.\n\n\"Sit,\" Voss said.\n"),
			scene("01.02 - Ledger", { pov: "Mara", characters: ["Mara"] }, "\"Sit,\" Madame said.\n\n\"She will not,\" her mother said.\n"),
		];
		const b = buildBook(d.map((x) => x.record));
		const r = buildRelations(b, [], new Map(d.map((x) => [x.record.path, proseOf(x.body)])), (n) => n, new Map(d.map((x) => [x.record.path, heardIn(x.body, ["Mara", "Madame", "Voss"])])));
		expect(r.speech.get("draft/01.01 - Harbour.md")!.speakers.map((s) => [s.name, s.lines])).toEqual([["Madame Voss", 2], ["The Mother", 1]]);
		// Where the scene doesn't list them, a part of a name is somebody else until the writer says otherwise.
		expect(r.speech.get("draft/01.02 - Ledger.md")!.speakers.map((s) => [s.name, s.lines])).toEqual([["Madame", 1], ["her mother", 1]]);
		expect(r.cast.find((c) => c.name === "Madame")!.issues.map((i) => i.kind)).toEqual(["speaks-unlisted"]);
	});

	it("keeps a description no note answers to out of the cast", () => {
		expect(row("the ferryman")).toBeUndefined();
	});

	it("leaves a scene with no speech read out of it", () => {
		expect(relations.speech.has("draft/01.04 - Far Shore.md")).toBe(false);
		expect(buildRelations(book, notes, prose).cast.every((r) => r.spoke.length === 0)).toBe(true);
	});

	it("says who speaks in a line", () => {
		expect(speechLabel(relations.speech.get("draft/01.01 - Harbour.md")!)).toBe("Mara 1 (+1 guessed) · Oskar 1 · Pell 1 · the ferryman 1");
		expect(speechLabel({ speakers: [{ name: "Mara", note: null, lines: 0, guessed: 2 }], lines: 5, unknown: 3 })).toBe("Mara (2 guessed) · 3 lines not placed");
	});
});
