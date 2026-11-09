import { maskInline, type Range } from "../analysis/mask";
import { countLine } from "../analysis/outline";
import type { Highlight, ParagraphResult } from "../analysis/types";
import type { Exercise, Rule } from "./definitions";

/**
 * Checking an exercise note against its rules: pure, from the cached analysis of each paragraph.
 * Every rule gives a pass, a fail or "not started", a short detail, and the places that break it.
 */

export interface ExerciseParagraph {
	/** Document offset of the paragraph. */
	from: number;
	/** Raw text, with headings and callouts already blanked (same length). */
	text: string;
	result: ParagraphResult | null;
}

export interface Breach {
	from: number;
	to: number;
	note: string;
}

export interface RuleResult {
	label: string;
	/** Null: nothing written yet, or (for the subject rule) nothing to check against. */
	ok: boolean | null;
	detail: string;
	breaches: Breach[];
}

export interface PartResult {
	heading: string;
	/** The part's heading exists in the note. */
	found: boolean;
	words: number;
	rules: RuleResult[];
}

export interface ExerciseReport {
	exercise: Exercise;
	parts: PartResult[];
	lookBack: { done: number; total: number };
	/** When to reread aloud: a day after `written:`. */
	reread: { from: string; ready: boolean } | null;
	/** For imitation: the model's sentence lengths and yours, in order. */
	shape?: { model: number[]; yours: number[] };
}

export interface ExerciseInput {
	exercise: Exercise;
	/** The whole note. */
	doc: string;
	paragraphs: ExerciseParagraph[];
	/** The model passage's paragraphs (imitation). */
	model: ExerciseParagraph[];
	subject?: string;
	written?: string;
	today: string;
}

interface Section {
	from: number;
	to: number;
}

/**
 * An exercise note's writing and its model passage as paragraphs, everything else blanked so offsets
 * stay true: frontmatter and code (`excluded`), headings, the brief and other callouts.
 */
export function exerciseBlocks(doc: string, excluded: readonly Range[]): { prose: { from: number; text: string }[]; model: { from: number; text: string }[] } {
	const prose: string[] = [];
	const model: string[] = [];
	let at = 0;
	let callout: "model" | "other" | null = null;
	let lookBack = false;
	for (const line of doc.split("\n")) {
		// "Look back" holds the writer's checkboxes, not writing.
		if (/^#{1,6}\s/.test(line)) lookBack = /^#{1,6}\s+look back\s*$/i.test(line);
		const blank = line.replace(/[^\n]/g, " ");
		const quoted = /^\s*>/.test(line);
		if (!quoted) callout = null;
		else if (callout === null) callout = /^\s*>\s*\[!model\]/i.test(line) ? "model" : "other";
		const calloutTitle = quoted && /^\s*>\s*\[!/.test(line);
		// Quotes are in `excluded` too, so quoted lines are settled first: the model callout is one.
		if (lookBack || /^#{1,6}\s/.test(line)) {
			prose.push(blank);
			model.push(blank);
		} else if (quoted) {
			prose.push(blank);
			model.push(callout === "model" && !calloutTitle ? line : blank);
		} else if (excluded.some((r) => at >= r.from && at < r.to)) {
			prose.push(blank);
			model.push(blank);
		} else {
			prose.push(line);
			model.push(blank);
		}
		at += line.length + 1;
	}
	return { prose: paragraphsOf(prose.join("\n")), model: paragraphsOf(model.join("\n")) };
}

/** Runs of non-blank lines, with their offsets. */
function paragraphsOf(full: string): { from: number; text: string }[] {
	const out: { from: number; text: string }[] = [];
	let from = 0;
	for (const chunk of full.split(/(\n[ \t]*\n)/)) {
		if (!/^\n[ \t]*\n$/.test(chunk) && chunk.trim()) {
			const lead = chunk.length - chunk.trimStart().length;
			out.push({ from: from + lead, text: chunk.trimEnd().slice(lead) });
		}
		from += chunk.length;
	}
	return out;
}

/** Part sections: the `##` headings in order, "Look back" excluded; each runs to the next heading. */
export function partSections(doc: string, exercise: Exercise): (Section | null)[] {
	const headings: { text: string; from: number; to: number }[] = [];
	let at = 0;
	for (const line of doc.split("\n")) {
		const m = /^#{1,6}\s+(.+?)\s*$/.exec(line);
		if (m) headings.push({ text: m[1]!, from: at, to: at + line.length });
		at += line.length + 1;
	}
	const parts = headings.filter((h) => !/^look back$/i.test(h.text.trim()));
	return exercise.parts.map((p, i) => {
		// The part's own heading if it's still there, else the i-th heading.
		const h = parts.find((x) => x.text.trim().toLowerCase() === p.heading.toLowerCase()) ?? parts[i];
		if (!h) return null;
		const next = headings.find((x) => x.from > h.from);
		return { from: h.to, to: next ? next.from : doc.length };
	});
}

/** The "Look back" checkboxes ticked. */
export function lookBackProgress(doc: string): { done: number; total: number } {
	const m = /^#{1,6}\s+look back\s*$/im.exec(doc);
	if (!m) return { done: 0, total: 0 };
	const rest = doc.slice(m.index + m[0].length).split(/^#{1,6}\s/m)[0]!;
	const boxes = rest.match(/^\s*[-*]\s+\[(.)\]/gm) ?? [];
	return { done: boxes.filter((b) => !/\[ \]/.test(b)).length, total: boxes.length };
}

const pluralise = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Sentence {
	from: number;
	to: number;
	words: number;
	text: string;
	result: ParagraphResult;
	paragraphFrom: number;
}

export function evaluateExercise(input: ExerciseInput): ExerciseReport {
	const { exercise, doc } = input;
	const sections = partSections(doc, exercise);
	const parts = exercise.parts.map((part, i): PartResult => {
		const section = sections[i];
		if (!section) return { heading: part.heading, found: false, words: 0, rules: [] };
		const paragraphs = input.paragraphs.filter((p) => p.from >= section.from && p.from < section.to);
		const words = paragraphs.reduce((n, p) => n + p.text.split("\n").reduce((m, l) => m + countLine(l).words, 0), 0);
		const sentences: Sentence[] = paragraphs.flatMap((p) =>
			(p.result?.sentences ?? []).map((s) => ({ from: p.from + s.from, to: p.from + s.to, words: s.words, text: p.text.slice(s.from, s.to), result: p.result!, paragraphFrom: p.from })),
		);
		const highlights = (check: string) =>
			paragraphs.flatMap((p) => (p.result?.highlights ?? []).filter((h) => "check" in h.kind && h.kind.check === check).map((h) => ({ ...h, from: p.from + h.from, to: p.from + h.to })));
		const pos = (cat: string) =>
			paragraphs.flatMap((p) => (p.result?.highlights ?? []).filter((h) => "pos" in h.kind && h.kind.pos === cat).map((h) => ({ from: p.from + h.from, to: p.from + h.to, text: p.text.slice(h.from, h.to) })));
		const rules = part.rules.map((rule) => (words === 0 && rule.kind !== "words" && rule.kind !== "matchModel" ? notStarted(rule) : check(rule, { words, paragraphs, sentences, highlights, pos, input })));
		return { heading: part.heading, found: true, words, rules: words === 0 ? rules.map((r) => ({ ...r, ok: null })) : rules };
	});

	const report: ExerciseReport = { exercise, parts, lookBack: lookBackProgress(doc), reread: reread(input.written, input.today) };
	if (exercise.needsModel) {
		const mine = parts[0]?.found ? input.paragraphs.filter((p) => sections[0] && p.from >= sections[0].from && p.from < sections[0].to) : [];
		report.shape = { model: input.model.flatMap((p) => (p.result?.sentences ?? []).map((s) => s.words)), yours: mine.flatMap((p) => (p.result?.sentences ?? []).map((s) => s.words)) };
		// The imitation rule needs the model, which isn't in its own part.
		const rule = parts[0]?.rules.find((r) => r.label.startsWith("Shape"));
		if (rule) Object.assign(rule, matchModel(report.shape.model, report.shape.yours));
	}
	return report;
}

function notStarted(rule: Rule): RuleResult {
	return { label: labelOf(rule), ok: null, detail: "not started", breaches: [] };
}

function labelOf(rule: Rule): string {
	switch (rule.kind) {
		case "words": return rule.min !== undefined && rule.max !== undefined ? `Words: ${rule.min}–${rule.max}` : rule.max !== undefined ? `Words: up to ${rule.max}` : `Words: at least ${rule.min}`;
		case "paragraphs": return rule.max === 1 ? "One paragraph" : `At most ${rule.max} paragraphs`;
		case "sentences": return rule.exactly === 1 ? "One sentence" : `${rule.exactly} sentences`;
		case "maxSentenceWords": return `Every sentence ${rule.max} words or fewer`;
		case "noFragments": return "No fragments: every sentence has a verb";
		case "noModifiers": return "No adjectives or adverbs";
		case "noDialogue": return "No dialogue";
		case "noLyAdverbs": return "No -ly adverbs";
		case "noActionClauses": return "No -ing or \"as\" action clauses";
		case "maxWord": return `"${rule.word}" at most ${rule.max === 1 ? "once" : `${rule.max} times`}`;
		case "noSameOpeners": return "No two sentences in a row start the same way";
		case "noNamedEmotions": return "No named emotions in the narration";
		case "noFilterWords": return "No filter words";
		case "noFirstPerson": return "No first-person narrator";
		case "subjectUnnamed": return "The event is never named";
		case "matchModel": return "Shape matches the model";
	}
}

interface Context {
	words: number;
	paragraphs: ExerciseParagraph[];
	sentences: Sentence[];
	highlights: (check: string) => Highlight[];
	pos: (cat: string) => { from: number; to: number; text: string }[];
	input: ExerciseInput;
}

/** Breaches inside dialogue don't count for rules about narration. */
const inSpeech = (p: ExerciseParagraph, from: number) => (p.result?.dialogue ?? []).some((l) => l.spans.some((s) => !s.thought && from - p.from >= s.from && from - p.from < s.to));

function check(rule: Rule, c: Context): RuleResult {
	const label = labelOf(rule);
	const result = (breaches: Breach[], detailOk: string, detailFail = `${breaches.length} to fix`): RuleResult => ({ label, ok: breaches.length === 0, detail: breaches.length ? detailFail : detailOk, breaches });
	switch (rule.kind) {
		case "words": {
			const ok = (rule.min === undefined || c.words >= rule.min) && (rule.max === undefined || c.words <= rule.max);
			const detail = c.words === 0 ? "not started" : `${c.words}${!ok && rule.max !== undefined && c.words > rule.max ? `: ${c.words - rule.max} over` : !ok && rule.min !== undefined ? `: ${rule.min - c.words} to go` : ""}`;
			return { label, ok: c.words === 0 ? null : ok, detail, breaches: [] };
		}
		case "paragraphs": {
			const written = c.paragraphs.filter((p) => p.text.split("\n").some((l) => countLine(l).words > 0));
			const extra = written.slice(rule.max).map((p) => ({ from: p.from, to: p.from + Math.min(p.text.length, 40), note: `${label}: this starts paragraph ${written.indexOf(p) + 1}.` }));
			return result(extra, pluralise(written.length, "paragraph"), pluralise(written.length, "paragraph"));
		}
		case "sentences": {
			const extra = c.sentences.slice(rule.exactly).map((s) => ({ from: s.from, to: Math.min(s.to, s.from + 30), note: `${label}: a new sentence starts here. Join it to the one before.` }));
			return result(extra, pluralise(c.sentences.length, "sentence"), pluralise(c.sentences.length, "sentence"));
		}
		case "maxSentenceWords": {
			const long = c.sentences.filter((s) => s.words > rule.max).map((s) => ({ from: s.from, to: s.to, note: `${s.words} words: at most ${rule.max}. Split it, or cut what isn't needed.` }));
			return result(long, `longest ${Math.max(0, ...c.sentences.map((s) => s.words))}`, `${long.length} too long`);
		}
		case "noFragments": {
			const verbs = c.pos("VERB").concat(c.pos("AUX"));
			const fragments = c.sentences.filter((s) => !verbs.some((v) => v.from >= s.from && v.to <= s.to)).map((s) => ({ from: s.from, to: s.to, note: "No verb found: a fragment. Give it a subject and a verb (the tagger can miss one; ignore it if it's a real sentence)." }));
			return result(fragments, "none");
		}
		case "noModifiers": {
			const all = c.pos("ADJ").concat(c.pos("ADV")).sort((a, b) => a.from - b.from);
			const allowed = all.filter((m) => rule.allow.includes(m.text.toLowerCase()));
			const breaches = all
				.filter((m) => !rule.allow.includes(m.text.toLowerCase()))
				.map((m) => ({ from: m.from, to: m.to, note: `"${m.text}" is tagged as a modifier. Can a noun or verb carry it? (If it's really a verb form or a noun here, ignore it.)` }));
			const extraTime = allowed.slice(rule.allowMax).map((m) => ({ from: m.from, to: m.to, note: `Time words are allowed sparingly: this is number ${allowed.indexOf(m) + 1}.` }));
			return result([...breaches, ...extraTime], allowed.length ? `none (${pluralise(allowed.length, "time word")})` : "none", `${breaches.length + extraTime.length} to cut`);
		}
		case "noDialogue": {
			const spans = c.paragraphs.flatMap((p) => (p.result?.dialogue ?? []).flatMap((l) => l.spans.filter((s) => !s.thought).map((s) => ({ from: p.from + s.from, to: p.from + s.to, note: "No dialogue in this one: let the narration carry it." }))));
			return result(spans, "none");
		}
		case "noLyAdverbs": {
			const ly = c.pos("ADV").filter((a) => /^\p{L}{3,}ly$/u.test(a.text)).map((a) => ({ from: a.from, to: a.to, note: `"${a.text}": find the verb that already moves this way.` }));
			return result(ly, "none");
		}
		case "noActionClauses":
			return result(c.highlights("actionClause").map((h) => ({ from: h.from, to: h.to, note: h.note ?? label })), "none");
		case "maxWord": {
			const found: Breach[] = [];
			for (const p of c.paragraphs) {
				const masked = maskInline(p.text);
				for (const m of masked.matchAll(new RegExp(`(?<![\\p{L}])${escape(rule.word)}(?![\\p{L}])`, "giu"))) found.push({ from: p.from + m.index, to: p.from + m.index + m[0].length, note: `"${rule.word}" is doing the linking. Can cause and effect, or a plain "and", do it instead?` });
			}
			return { label, ok: found.length <= rule.max, detail: `${found.length} used`, breaches: found.slice(rule.max) };
		}
		case "noSameOpeners": {
			const first = (s: Sentence) => /[\p{L}'’]+/u.exec(maskInline(s.text))?.[0]?.toLowerCase() ?? "";
			const breaches: Breach[] = [];
			c.sentences.forEach((s, i) => {
				const prev = c.sentences[i - 1];
				const word = first(s);
				if (prev && word && word === first(prev)) {
					const at = s.from + maskInline(s.text).search(/[\p{L}'’]/u);
					breaches.push({ from: at, to: at + word.length, note: `Two sentences in a row start with "${word}". Start this one from the thing that changed.` });
				}
			});
			return result(breaches, "varied");
		}
		case "noNamedEmotions":
			return result(c.highlights("namedEmotion").map((h) => ({ from: h.from, to: h.to, note: h.note ?? label })), "none");
		case "noFilterWords":
			return result(c.highlights("filterWord").map((h) => ({ from: h.from, to: h.to, note: h.note ?? label })), "none");
		case "noFirstPerson": {
			const found: Breach[] = [];
			for (const p of c.paragraphs) {
				const masked = maskInline(p.text);
				for (const m of masked.matchAll(/(?<![\p{L}'’])(I|[Mm]e|[Mm]y|[Mm]ine|[Mm]yself|[Ww]e|[Uu]s|[Oo]urs?)(?![\p{L}'’])/gu)) {
					if (!inSpeech(p, p.from + m.index)) found.push({ from: p.from + m.index, to: p.from + m.index + m[0].length, note: "No narrator saying \"I\" here: the place speaks for itself." });
				}
			}
			return result(found, "none");
		}
		case "subjectUnnamed": {
			const subject = c.input.subject?.trim();
			if (!subject) return { label, ok: null, detail: "add subject: to the frontmatter", breaches: [] };
			const found: Breach[] = [];
			const words = subject.split(/\s+/).filter((w) => w.length > 2).map(escape);
			for (const p of c.paragraphs) {
				const masked = maskInline(p.text);
				for (const m of masked.matchAll(new RegExp(`(?<![\\p{L}])(${words.join("|")})\\p{L}*`, "giu"))) found.push({ from: p.from + m.index, to: p.from + m.index + m[0].length, note: `This names the event ("${subject}"). Let the place imply it instead.` });
			}
			return result(found, "never named", `named ${pluralise(found.length, "time")}`);
		}
		case "matchModel":
			return { label, ok: null, detail: "", breaches: [] };
	}
}

/** Sentence by sentence against the model: same count, each within a couple of words (or a quarter of its length). */
export function matchModel(model: number[], yours: number[]): Pick<RuleResult, "ok" | "detail"> {
	if (!model.length) return { ok: null, detail: "no model passage found" };
	if (!yours.length) return { ok: null, detail: `model has ${pluralise(model.length, "sentence")}` };
	const close = model.filter((m, i) => yours[i] !== undefined && Math.abs(yours[i]! - m) <= Math.max(2, Math.round(m / 4))).length;
	const ok = yours.length === model.length && close >= Math.ceil(model.length * 0.8);
	return { ok, detail: `${close} of ${model.length} sentences close${yours.length !== model.length ? `; ${yours.length} written` : ""}` };
}

function reread(written: string | undefined, today: string): ExerciseReport["reread"] {
	if (!written || !/^\d{4}-\d{2}-\d{2}/.test(written)) return null;
	const d = new Date(`${written.slice(0, 10)}T00:00:00`);
	if (Number.isNaN(d.getTime())) return null;
	d.setDate(d.getDate() + 1);
	const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	return { from, ready: today >= from };
}
