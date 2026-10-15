import { describe, expect, it } from "vitest";
import { GUIDES } from "../src/analysis/guides";
import { CHECK_KINDS } from "../src/analysis/types";
import {
	DEFAULT_SETTINGS,
	effective,
	inScope,
	LENSES,
	lensesFor,
	lensLabel,
	lensSummary,
	migrateLegacy,
	overrideCount,
	type ProsePrinceSettings,
	setCheck,
	setPos,
} from "../src/settingsModel";

const fresh = (): ProsePrinceSettings => structuredClone(DEFAULT_SETTINGS);

describe("stacking lenses", () => {
	it("unions the active lenses", () => {
		const s = fresh();
		s.lenses = { style: true, king: true };
		const e = effective(s);
		expect(e.checks.cliche).toBe(true); // from Style
		expect(e.pos.ADV).toBe(true); // from King
		expect(e.oozeMode).toBe(true); // from King
		expect(e.checks.stackedModifier).toBe(false); // only in Le Guin
		expect(lensLabel(s)).toBe("Style checks + King lens");
	});

	it("reports which lenses switch an item on", () => {
		const s = fresh();
		s.lenses = { style: true, king: true, leguin: true };
		expect(lensesFor({ check: "qualifier" }, s).map((l) => l.id)).toEqual(["style", "king", "leguin"]);
		expect(lensesFor({ pos: "ADJ" }, s).map((l) => l.id)).toEqual(["leguin"]);
	});

	it("lists exactly what each lens turns on", () => {
		const king = LENSES.find((l) => l.id === "king")!;
		expect(lensSummary(king)).toBe("Adverbs (oozing red), Dialogue-tag adverbs, Passive voice, Qualifiers, Filler words");
	});
});

describe("overrides", () => {
	it("win over the lenses, in either direction", () => {
		const s = fresh(); // Style on
		setPos(s, "ADJ", true);
		setCheck(s, "cliche", false);
		const e = effective(s);
		expect(e.pos.ADJ).toBe(true);
		expect(e.checks.cliche).toBe(false);
		expect(overrideCount(s)).toBe(2);
		expect(lensLabel(s)).toBe("Style checks · 2 of your changes");
	});

	it("disappear when set back to what the lenses say", () => {
		const s = fresh();
		setCheck(s, "cliche", false);
		setCheck(s, "cliche", true);
		expect(overrideCount(s)).toBe(0);
	});
});

describe("migration from preset lenses (0.2–0.3)", () => {
	it("turns a named preset into that lens switched on", () => {
		const m = migrateLegacy({ lens: "king", pos: { ADV: true }, checks: { passive: true }, oozeMode: true, rhythm: { enabled: false, scope: "visible", tiers: 6 }, echoWindow: 30 });
		expect(m.lenses).toEqual({ king: true });
		expect(m.overrides).toEqual({ pos: {}, checks: {} });
		expect(m.rhythm).toEqual({ scope: "visible", tiers: 6 });
		expect(m.echoWindow).toBe(30);
	});

	it("keeps hand-set toggles as overrides", () => {
		const m = migrateLegacy({ lens: "custom", pos: { ADJ: true, NOUN: false }, checks: { cliche: true }, oozeMode: false, rhythm: { enabled: true } });
		expect(m.lenses).toEqual({});
		expect(m.overrides).toEqual({ pos: { ADJ: true }, checks: { cliche: true }, rhythm: true });
	});

	it("leaves new-style settings alone", () => {
		const current = { lenses: { leguin: true }, overrides: { pos: {}, checks: {} } };
		expect(migrateLegacy(current)).toBe(current);
	});
});

describe("guides", () => {
	it("cover every check, with examples and a reason to keep", () => {
		for (const kind of CHECK_KINDS) {
			const g = GUIDES[kind];
			expect(g, kind).toBeDefined();
			expect(g.examples.length, kind).toBeGreaterThan(0);
			expect(g.keep.length, kind).toBeGreaterThan(0);
		}
	});
});

describe("where ProsePrince runs", () => {
	it("runs everywhere when no folders are set", () => {
		expect(inScope("Notes/idea.md", [])).toBe(true);
	});
	it("runs only inside the listed folders and their subfolders", () => {
		const folders = ["60_draft", "/Manuscript/"];
		expect(inScope("60_draft/Chapter 1.md", folders)).toBe(true);
		expect(inScope("60_draft/act one/Scene 2.md", folders)).toBe(true);
		expect(inScope("Manuscript/Prologue.md", folders)).toBe(true);
		expect(inScope("30_question/Was Eufemie the first.md", folders)).toBe(false);
		expect(inScope("60_draft_old/x.md", folders)).toBe(false);
	});
	it("lets a note's frontmatter flag win", () => {
		expect(inScope("30_question/q.md", ["60_draft"], true)).toBe(true);
		expect(inScope("60_draft/c.md", ["60_draft"], false)).toBe(false);
	});
	it("moves the old World note path to _proseprince", () => {
		expect(migrateLegacy({ worldNote: "ProsePrince/World.md", lenses: {} }).worldNote).toBe("_proseprince/World.md");
		expect(migrateLegacy({ worldNote: "Story/World.md", lenses: {} }).worldNote).toBe("Story/World.md");
	});
});
