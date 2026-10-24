import { EditorView } from "@codemirror/view";
import { ItemView, type WorkspaceLeaf } from "obsidian";
import { rhythmTier } from "./analysis/rhythm";
import { type CheckKind, kindSlug } from "./analysis/types";
import { READING_WPM } from "./analysis/outline";
import type { OutlineReport } from "./editor/highlighter";
import { CHECK_GROUPS, CHECK_INFO } from "./settingsModel";

export const OUTLINE_VIEW = "proseprince-outline";

/** What the sidebar needs besides the report: the note, its frontmatter, and where to jump. */
export interface OutlineContext {
	title: string;
	frontmatter: Record<string, unknown>;
	view: EditorView;
	cursor: number;
	/** Words when the note was first seen this session. */
	sessionStart: number;
	rhythmTiers: number;
	/** ProsePrince runs on this note (folder scope and frontmatter); issues are only counted if so. */
	highlighting: boolean;
	onToggleAllChecks(): void;
	onVoices(): void;
	onFocusEditor(): void;
}

/** Frontmatter fields shown on the scene card, in this order. */
const SCENE_FIELDS: [string, string][] = [["status", "Status"], ["pov", "POV"], ["setting", "Setting"], ["day", "Day"], ["characters", "Characters"]];

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** At most this many bars in the rhythm sparkline. */
const SPARK_BARS = 90;
const num = (x: number) => x.toLocaleString();

/**
 * The ProsePrince sidebar: an outline for fiction. The scene card, the note's numbers, beats as
 * jump links with their own counts, sentence rhythm, issues, dialogue and repeated words.
 */
export class OutlineView extends ItemView {
	private report: OutlineReport | null = null;
	private ctx: OutlineContext | null = null;
	/** Sections the writer has closed, kept while the view is open. */
	private closed = new Set<string>();
	/** Where each issue kind or repeated word last jumped to, for cycling through them. */
	private cycle = new Map<string, number>();
	private beatRows: HTMLElement[] = [];
	private message = "Open a note to see its outline.";

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return OUTLINE_VIEW;
	}

	getDisplayText(): string {
		return "ProsePrince outline";
	}

	getIcon(): string {
		return "scroll-text";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	/** Nothing to show (no Markdown note, or ProsePrince is off). */
	clear(message: string): void {
		this.report = null;
		this.ctx = null;
		this.message = message;
		this.render();
	}

	show(report: OutlineReport, ctx: OutlineContext): void {
		this.report = report;
		this.ctx = ctx;
		this.render();
	}

	/** Mark the beat the cursor is in, without redrawing everything. */
	setCursor(pos: number): void {
		if (!this.ctx || !this.report) return;
		this.ctx.cursor = pos;
		let current = -1;
		this.report.beats.forEach((b, i) => {
			if (b.from <= pos) current = i;
		});
		this.beatRows.forEach((row, i) => row.toggleClass("is-current", i === current));
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("pp-outline");
		const { report, ctx } = this;
		if (!report || !ctx) {
			root.createDiv({ cls: "pp-outline-empty", text: this.message });
			return;
		}
		root.createDiv({ cls: "pp-outline-title", text: report.title ?? ctx.title });
		if (report.pending) root.createDiv({ cls: "pp-outline-note", text: `Analysing ${report.pending} more paragraph${report.pending === 1 ? "" : "s"}…` });
		this.sceneCard(root, ctx);
		this.numbers(root, report, ctx);
		this.beats(root, report, ctx);
		this.rhythm(root, report, ctx);
		this.issues(root, report, ctx);
		this.dialogue(root, report, ctx);
		this.repeated(root, report, ctx);
		this.setCursor(ctx.cursor);
	}

	/** A collapsible section that remembers being closed. */
	private section(root: HTMLElement, id: string, title: string, extra?: (summary: HTMLElement) => void): HTMLElement {
		const details = root.createEl("details", { cls: "pp-outline-section" });
		details.open = !this.closed.has(id);
		const summary = details.createEl("summary", { text: title });
		extra?.(summary);
		details.addEventListener("toggle", () => {
			if (details.open) this.closed.delete(id);
			else this.closed.add(id);
		});
		return details.createDiv({ cls: "pp-outline-body" });
	}

	private jump(pos: number): void {
		const view = this.ctx?.view;
		if (!view) return;
		const at = Math.min(pos, view.state.doc.length);
		view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: "center" }) });
		this.ctx?.onFocusEditor();
	}

	private sceneCard(root: HTMLElement, ctx: OutlineContext): void {
		const fm = ctx.frontmatter;
		const shown = SCENE_FIELDS.filter(([key]) => present(fm[key]));
		const summary = present(fm.summary) ? String(fm.summary) : "";
		if (!shown.length && !summary) return;
		const body = this.section(root, "scene", "Scene");
		if (summary) body.createDiv({ cls: "pp-outline-summary", text: summary });
		const grid = body.createDiv({ cls: "pp-outline-grid" });
		for (const [key, label] of shown) {
			grid.createDiv({ cls: "pp-outline-key", text: label });
			const v = fm[key];
			grid.createDiv({ cls: "pp-outline-value", text: Array.isArray(v) ? v.map(String).join(", ").replace(/\[\[|\]\]/g, "") : String(v).replace(/\[\[|\]\]/g, "") });
		}
	}

	private numbers(root: HTMLElement, r: OutlineReport, ctx: OutlineContext): void {
		const body = this.section(root, "numbers", "This note");
		const grid = body.createDiv({ cls: "pp-outline-stats" });
		const stat = (value: string, label: string, title?: string) => {
			const cell = grid.createDiv({ cls: "pp-outline-stat" });
			cell.createDiv({ cls: "pp-outline-stat-value", text: value });
			cell.createDiv({ cls: "pp-outline-stat-label", text: label });
			if (title) cell.setAttribute("aria-label", title);
		};
		stat(num(r.words), "words", "Prose only: no frontmatter, %% comments, headings or callouts");
		stat(num(r.characters), "characters", "Including spaces, prose only");
		stat(num(r.paragraphs), "paragraphs");
		stat(num(r.sentences.length), "sentences");
		stat(`${Math.max(1, Math.round(r.words / READING_WPM))} min`, "to read", `At ${READING_WPM} words a minute`);
		stat(pct(r.dialogueShare), "dialogue", "Share of the words that are speech");

		const target = Number(ctx.frontmatter.target);
		const session = r.words - ctx.sessionStart;
		if (target > 0) {
			const bar = body.createDiv({ cls: "pp-outline-target" });
			bar.createDiv({ cls: "pp-outline-target-fill" }).style.width = `${Math.min(100, (r.words / target) * 100)}%`;
			body.createDiv({ cls: "pp-outline-note", text: `${num(r.words)} of ${num(target)} words (${pct(r.words / target)})${session ? ` · ${session > 0 ? "+" : "−"}${num(Math.abs(session))} this session` : ""}` });
		} else if (session) {
			body.createDiv({ cls: "pp-outline-note", text: `${session > 0 ? "+" : "−"}${num(Math.abs(session))} words this session. Add target: to the frontmatter for a progress bar.` });
		}
		const ease = r.readability?.readingEase;
		if (ease) {
			const parts = [`Reading ease ${Math.round(ease.score)} (${ease.band.label.toLowerCase()})`];
			if (r.readability?.grade !== null && r.readability?.grade !== undefined) parts.push(`grade ${Math.max(0, Math.round(r.readability.grade))}`);
			if (r.readability?.variety) parts.push(`rhythm ${r.readability.variety.band.label.toLowerCase()}`);
			const line = body.createDiv({ cls: "pp-outline-note", text: parts.join(" · ") });
			line.setAttribute("aria-label", [ease.band.hint, r.readability?.variety?.band.hint].filter(Boolean).join("\n"));
		}
	}

	private beats(root: HTMLElement, r: OutlineReport, ctx: OutlineContext): void {
		this.beatRows = [];
		if (!r.beats.length) return;
		const body = this.section(root, "beats", `Beats (${r.beats.filter((b) => !b.opening).length})`);
		const minLevel = Math.min(...r.beats.map((b) => b.level));
		const most = Math.max(...r.beats.map((b) => b.words), 1);
		for (const b of r.beats) {
			const row = body.createDiv({ cls: "pp-beat" });
			row.style.paddingLeft = `${(b.level - minLevel) * 12}px`;
			const head = row.createDiv({ cls: "pp-beat-head" });
			head.createSpan({ cls: `pp-beat-name${b.opening ? " pp-beat-opening" : ""}`, text: b.opening ? "Before the first heading" : b.text });
			if (b.issues) head.createSpan({ cls: "pp-beat-issues", text: String(b.issues) }).setAttribute("aria-label", `${b.issues} issue${b.issues === 1 ? "" : "s"} in this beat`);
			head.createSpan({ cls: "pp-beat-words", text: num(b.words) });
			// Length against the longest beat, with the speech share inside it.
			const bar = row.createDiv({ cls: "pp-beat-bar" });
			bar.style.width = `${Math.max(4, (b.words / most) * 100)}%`;
			bar.createDiv({ cls: "pp-beat-speech" }).style.width = `${b.dialogue * 100}%`;
			row.setAttribute("aria-label", `${num(b.words)} words · ${pct(b.dialogue)} dialogue`);
			row.onclick = () => this.jump(Math.max(0, b.from));
			this.beatRows.push(row);
		}
		body.createDiv({ cls: "pp-outline-note", text: "Bar: length against the longest beat; the darker part is dialogue." });
	}

	private rhythm(root: HTMLElement, r: OutlineReport, ctx: OutlineContext): void {
		if (r.sentences.length < 3) return;
		const body = this.section(root, "rhythm", "Sentence rhythm");
		// A long chapter has hundreds of sentences: average them in small groups so every bar stays visible.
		const per = Math.ceil(r.sentences.length / SPARK_BARS);
		const bars: { from: number; length: number }[] = [];
		for (let i = 0; i < r.sentences.length; i += per) {
			const group = r.sentences.slice(i, i + per);
			bars.push({ from: group[0]!.from, length: group.reduce((n, s) => n + s.length, 0) / group.length });
		}
		const max = Math.max(...bars.map((s) => s.length), 1);
		const spark = body.createDiv({ cls: "pp-rhythm-spark" });
		if (per > 1) spark.addClass("is-grouped");
		for (const s of bars) {
			const bar = spark.createDiv({ cls: `pp-spark-bar pp-spark-${rhythmTier(s.length, ctx.rhythmTiers)}` });
			bar.style.height = `${Math.max(5, (s.length / max) * 100)}%`;
			bar.onclick = () => this.jump(s.from);
		}
		body.createDiv({ cls: "pp-outline-note", text: `${per > 1 ? `One bar per ${per} sentences (their average)` : "One bar per sentence"}, by felt length, cool to warm. Long flat runs read monotone; all-short reads staccato. Click a bar to go there.` });
	}

	private issues(root: HTMLElement, r: OutlineReport, ctx: OutlineContext): void {
		if (!ctx.highlighting) {
			this.section(root, "issues", "Issues").createDiv({ cls: "pp-outline-note", text: "ProsePrince is off for this note (outside your prose folders, or proseprince: false)." });
			return;
		}
		const total = [...r.issues.values()].reduce((n, l) => n + l.length, 0);
		const body = this.section(root, "issues", `Issues (${num(total)})`, (summary) => {
			const toggle = summary.createEl("button", { cls: "pp-outline-toggle", text: r.allChecks ? "All checks" : "Lenses" });
			toggle.setAttribute("aria-label", r.allChecks ? "Counting every check. Click to count only what your lenses show." : "Counting what your lenses show. Click to count every check.");
			toggle.onclick = (e) => {
				e.preventDefault();
				ctx.onToggleAllChecks();
			};
		});
		if (!total) {
			body.createDiv({ cls: "pp-outline-note", text: r.allChecks ? "Nothing found by any check." : "Nothing found by the lenses you have on." });
			return;
		}
		for (const group of CHECK_GROUPS) {
			const kinds = (Object.keys(CHECK_INFO) as CheckKind[]).filter((k) => CHECK_INFO[k].group === group && r.issues.get(k)?.length);
			if (!kinds.length) continue;
			body.createDiv({ cls: "pp-outline-group", text: group });
			for (const kind of kinds) {
				const positions = r.issues.get(kind)!;
				const row = body.createDiv({ cls: "pp-outline-row" });
				row.createSpan({ cls: "pp-outline-swatch" }).style.background = `var(--pp-${kindSlug(kind)})`;
				row.createSpan({ cls: "pp-outline-row-name", text: CHECK_INFO[kind].name });
				row.createSpan({ cls: "pp-outline-row-count", text: num(positions.length) });
				row.setAttribute("aria-label", "Click to go to the next one");
				row.onclick = () => this.jump(this.next(`issue:${kind}`, positions, ctx.cursor));
			}
		}
	}

	private dialogue(root: HTMLElement, r: OutlineReport, ctx: OutlineContext): void {
		const d = r.dialogue;
		const lines = d.certain + d.guessed + d.unknown;
		if (!lines) return;
		const body = this.section(root, "dialogue", `Dialogue (${num(lines)} lines)`);
		for (const v of d.voices) {
			const row = body.createDiv({ cls: "pp-outline-row" });
			row.createSpan({ cls: "pp-speaker-dot" }).style.setProperty("--pp-speaker", v.colour);
			row.createSpan({ cls: "pp-outline-row-name", text: v.speaker });
			row.createSpan({ cls: "pp-outline-row-count", text: `${v.lines} · ${pct(v.share)}` });
			row.setAttribute("aria-label", `${v.lines} lines${v.guessed ? ` (${v.guessed} guessed)` : ""} · ${v.wordsPerLine.toFixed(1)} words a line · ${pct(v.questions)} questions · ${pct(v.share)} of the dialogue${v.distinctive.length ? `\nTheir words: ${v.distinctive.join(", ")}` : ""}\nClick to go to their next line`);
			const positions = d.positions.get(v.speaker) ?? [];
			if (positions.length) row.onclick = () => this.jump(this.next(`speaker:${v.speaker}`, positions, ctx.cursor));
		}
		const grade = body.createDiv({ cls: "pp-outline-note" });
		grade.setText(`Who's speaking: ${num(d.certain)} certain · ${num(d.guessed)} guessed · ${num(d.unknown)} unclear${d.untaggedRuns ? ` · ${d.untaggedRuns} long untagged run${d.untaggedRuns === 1 ? "" : "s"}` : ""}`);
		grade.setAttribute("aria-label", "Certain: a tag, beat, pin or resolved pronoun. Guessed: turn-taking. Unclear: nothing points to anyone, so a reader may be guessing too.");
		const button = body.createEl("button", { cls: "pp-outline-button", text: "Voices in this note…" });
		button.onclick = () => ctx.onVoices();
	}

	private repeated(root: HTMLElement, r: OutlineReport, ctx: OutlineContext): void {
		if (!r.repeated.length) return;
		const body = this.section(root, "repeated", "Repeated words");
		const row = body.createDiv({ cls: "pp-chips" });
		for (const w of r.repeated) {
			const chip = row.createEl("button", { cls: "pp-chip", text: `${w.word} ×${w.n}` });
			chip.setAttribute("aria-label", "Click to go to the next use");
			chip.onclick = () => this.jump(this.next(`word:${w.word}`, w.positions, ctx.cursor));
		}
		body.createDiv({ cls: "pp-outline-note", text: "Most used nouns, verbs, adjectives and adverbs, names and world terms left out. Repetition isn't wrong; it's worth seeing." });
	}

	/** The next position after the cursor (wrapping), so repeated clicks walk through every one. */
	private next(key: string, positions: number[], cursor: number): number {
		const last = this.cycle.get(key);
		const from = last !== undefined && Math.abs(last - cursor) < 2 ? last : cursor - 1;
		const at = positions.find((p) => p > from) ?? positions[0]!;
		this.cycle.set(key, at);
		return at;
	}
}

const present = (v: unknown) => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "") && !(Array.isArray(v) && v.length === 0);
