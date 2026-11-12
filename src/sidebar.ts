import { EditorView } from "@codemirror/view";
import { ItemView, Keymap, type WorkspaceLeaf } from "obsidian";
import { rhythmTier } from "./analysis/rhythm";
import { type CheckKind, kindSlug } from "./analysis/types";
import { READING_WPM } from "./analysis/outline";
import { type AnnotationKind, type PromiseStatus, TO_CLEAR } from "./analysis/story";
import { LONG_SENTENCE, type StyleFigures } from "./analysis/readability";
import type { OutlineReport } from "./editor/highlighter";
import type { ExerciseReport } from "./exercises/evaluate";
import { CHECK_GROUPS, CHECK_INFO } from "./settingsModel";
import { ANNOTATION_LABELS, PROMISE_LABELS } from "./storyView";

export const OUTLINE_VIEW = "proseprince-outline";

/** A scene (or unplanned stretch) listed under a chapter note's beat. */
export interface OutlineSceneLink {
	path: string;
	label: string;
	words: number;
}

/** A note a scene touches, or a scene that touches a note. */
export interface OutlineTouch {
	path: string;
	label: string;
	/** The note's `type`, for grouping. */
	group?: string;
	status?: string;
	/** How they're connected, in a few words. */
	how: string;
	detail: string;
	/** Named in the prose only: nothing declared, nothing recorded. */
	faint: boolean;
}

/** Something the reader was shown, and where. */
export interface OutlineFact {
	text: string;
	where: string;
	path: string;
	line?: number;
}

/**
 * Where the note sits in the book: for a scene, its beat in the chapter's outline; for a chapter note,
 * its scenes; for a note about the story, the scenes that touch it.
 */
export interface OutlineStory {
	kind: "chapter" | "scene" | "note";
	/** A scene's notes, or a note's scenes. */
	touches?: OutlineTouch[];
	/** What the reader knows at a scene. */
	knowledge?: { here: number; before: number; later: OutlineFact[]; pov?: string; ahead: OutlineFact[] };
	/** A scene's chapter note, when the chapter has one. */
	chapter?: { path: string; title: string };
	/** A scene's beat from the chapter note: null when the chapter has an outline and this scene isn't in it. */
	/** `twoCards`: the chapter note holds a card for this beat too, and this scene's is the one used. */
	beat?: { text: string; card: [string, string][]; target?: number; twoCards?: boolean } | null;
	promises: { role: "Makes" | "Progresses" | "Pays"; name: string; status: PromiseStatus }[];
	/** Reasons its last pass may no longer hold, each with what to open. */
	needs?: { text: string; path?: string; line?: number }[];
	/** Written, and no pass date yet. */
	noPass?: boolean;
	/** Who speaks in a scene, and anyone tagged as speaking whom its properties leave out. */
	speaks?: { text: string; lines: number; unlisted: string[] };
	/** A chapter note's beats, in outline order, with the scenes attached to each. */
	beats?: { text: string; target?: number; scenes: OutlineSceneLink[] }[];
	/** A chapter note's scenes that no beat claims. */
	unplanned?: OutlineSceneLink[];
}

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
	/** The note's place in the book, when it is a chapter note or a scene. */
	story: OutlineStory | null;
	/** Whether to offer the link to the story view. */
	storyLink: boolean;
	onOpenPath(path: string, newTab: boolean, line?: number): void;
	onOpenStory(): void;
	/** Read the note's chapter as one page. */
	onReadChapter(): void;
}

/** Frontmatter fields shown on the scene card, in this order. */
const SCENE_FIELDS: [string, string][] = [["status", "Status"], ["pov", "POV"], ["setting", "Setting"], ["day", "Day"], ["characters", "Characters"]];

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** One decimal for small shares: 1.2% of words being -ly adverbs differs from 0.4%. */
const pct1 = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
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

	/** The exercise's rules, part by part, ticked or failed as you write; click a failing rule to walk its breaches. */
	private exercise(root: HTMLElement, x: ExerciseReport): void {
		const body = this.section(root, "exercise", `Exercise: ${x.exercise.title}`);
		body.createDiv({ cls: "pp-outline-note pp-exercise-skill", text: x.exercise.skill });
		for (const part of x.parts) {
			if (x.parts.length > 1 || !part.found) body.createDiv({ cls: "pp-exercise-part", text: part.found ? part.heading : `${part.heading} (heading missing)` });
			for (const rule of part.rules) {
				const row = body.createDiv({ cls: `pp-outline-row pp-exercise-rule ${rule.ok === true ? "is-ok" : rule.ok === false ? "is-fail" : "is-pending"}` });
				row.createSpan({ cls: "pp-exercise-mark", text: rule.ok === true ? "✓" : rule.ok === false ? "✗" : "○" });
				row.createSpan({ cls: "pp-outline-row-name", text: rule.label });
				row.createSpan({ cls: "pp-outline-row-count", text: rule.detail });
				if (rule.breaches.length) {
					const positions = rule.breaches.map((b) => b.from);
					row.setAttribute("aria-label", "Click to go to the next one");
					row.onclick = () => this.jump(this.next(`exercise:${part.heading}:${rule.label}`, positions, this.ctx?.cursor ?? 0));
				} else row.addClass("is-static");
			}
		}
		if (x.shape) this.shapeCompare(body, x.shape);
		if (x.lookBack.total) body.createDiv({ cls: "pp-outline-note", text: `Look back: ${x.lookBack.done} of ${x.lookBack.total} ticked.` });
		if (x.reread) {
			const date = new Date(`${x.reread.from}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
			body.createDiv({ cls: "pp-outline-note", text: x.reread.ready ? "Ready to reread aloud, with fresh eyes, before ticking the boxes." : `Put it away for now: reread it aloud from ${date}.` });
		}
	}

	/** Imitation: the model's sentence lengths above yours, bar for bar. */
	private shapeCompare(body: HTMLElement, shape: { model: number[]; yours: number[] }): void {
		const max = Math.max(1, ...shape.model, ...shape.yours);
		const n = Math.max(shape.model.length, shape.yours.length);
		for (const [label, lengths] of [["Model", shape.model], ["Yours", shape.yours]] as const) {
			body.createDiv({ cls: "pp-outline-group", text: label });
			const strip = body.createDiv({ cls: "pp-rhythm-spark pp-shape-compare" });
			for (let i = 0; i < n; i++) {
				const bar = strip.createDiv({ cls: `pp-spark-bar ${label === "Model" ? "pp-spark-model" : "pp-spark-yours"}` });
				bar.style.height = `${lengths[i] === undefined ? 0 : Math.max(5, (lengths[i]! / max) * 100)}%`;
				bar.setAttribute("aria-label", lengths[i] === undefined ? "Not written yet" : `Sentence ${i + 1}: ${lengths[i]} words`);
			}
		}
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
		if (report.exercise) this.exercise(root, report.exercise);
		this.sceneCard(root, report, ctx);
		this.numbers(root, report, ctx);
		this.beats(root, report, ctx);
		// An exercise note's checkboxes are its own self-check, not fixes left in a draft.
		if (!report.exercise) this.annotations(root, report, ctx);
		if (ctx.story) this.touches(root, ctx.story, ctx);
		if (ctx.story?.knowledge) this.reader(root, ctx.story.knowledge, ctx);
		this.rhythm(root, report, ctx);
		// Exercise notes are strict: the exercise's rules replace the usual issues.
		if (!report.exercise) this.issues(root, report, ctx);
		this.dialogue(root, report, ctx);
		this.repeated(root, report, ctx);
		if (ctx.story && ctx.story.kind !== "note") {
			const read = root.createEl("button", { cls: "pp-outline-button pp-story-open", text: "Read this chapter…" });
			read.setAttribute("aria-label", "The chapter's written scenes, in order, as one page");
			read.onclick = () => ctx.onReadChapter();
		}
		if (ctx.storyLink) {
			const link = root.createEl("button", { cls: `pp-outline-button pp-story-open${ctx.story && ctx.story.kind !== "note" ? " is-second" : ""}`, text: "Story view: the whole book…" });
			link.onclick = () => ctx.onOpenStory();
		}
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

	private sceneCard(root: HTMLElement, r: OutlineReport, ctx: OutlineContext): void {
		const fm = ctx.frontmatter;
		const story = ctx.story;
		const shown = SCENE_FIELDS.filter(([key]) => present(fm[key]));
		const summary = present(fm.summary) ? String(fm.summary) : "";
		const placed = !!story && (story.beat !== undefined || story.promises.length > 0 || !!story.unplanned?.length || !!story.needs?.length || !!story.noPass || !!story.speaks);
		if (!shown.length && !summary && !placed) return;
		const body = this.section(root, "scene", story?.kind === "chapter" ? "Chapter" : "Scene");
		if (summary) body.createDiv({ cls: "pp-outline-summary", text: summary });
		if (shown.length) {
			const grid = body.createDiv({ cls: "pp-outline-grid" });
			for (const [key, label] of shown) {
				grid.createDiv({ cls: "pp-outline-key", text: label });
				const v = fm[key];
				grid.createDiv({ cls: "pp-outline-value", text: Array.isArray(v) ? v.map(String).join(", ").replace(/\[\[|\]\]/g, "") : String(v).replace(/\[\[|\]\]/g, "") });
			}
		}
		if (story) this.place(body, story, r, ctx);
	}

	/** The scene's beat from the chapter note, and the promises it makes, moves on or pays. */
	private place(body: HTMLElement, story: OutlineStory, r: OutlineReport, ctx: OutlineContext): void {
		const link = (el: HTMLElement, path: string) => {
			el.addClass("is-link");
			el.onclick = (evt) => ctx.onOpenPath(path, Keymap.isModEvent(evt) !== false);
		};
		if (story.beat) {
			const head = body.createDiv({ cls: "pp-outline-group pp-story-beat-head" });
			head.createSpan({ text: `Beat: ${story.beat.text}` });
			if (story.chapter) {
				const from = head.createSpan({ cls: "pp-story-ref", text: story.chapter.title ? `in ${story.chapter.title}` : "chapter outline" });
				from.setAttribute("aria-label", "Open the chapter's outline");
				link(from, story.chapter.path);
			}
			if (story.beat.card.length) {
				const grid = body.createDiv({ cls: "pp-outline-grid pp-story-card" });
				for (const [key, value] of story.beat.card) {
					grid.createDiv({ cls: "pp-outline-key", text: key });
					grid.createDiv({ cls: "pp-outline-value", text: value.replace(/\[\[|\]\]/g, "") });
				}
			}
			if (story.beat.twoCards && story.chapter) {
				const note = body.createDiv({ cls: "pp-outline-note" });
				note.createSpan({ text: "This note's card is used; " });
				link(note.createSpan({ cls: "pp-story-ref", text: story.chapter.title || "the chapter note" }), story.chapter.path);
				note.createSpan({ text: " has one for this beat too." });
			}
			const target = story.beat.target;
			if (target && !(Number(ctx.frontmatter.target) > 0)) {
				const bar = body.createDiv({ cls: "pp-outline-target" });
				bar.createDiv({ cls: "pp-outline-target-fill" }).style.width = `${Math.min(100, (r.words / target) * 100)}%`;
				body.createDiv({ cls: "pp-outline-note", text: `${num(r.words)} of the beat's ${num(target)} words (${pct(r.words / target)})` });
			}
		} else if (story.beat === null && story.chapter) {
			const note = body.createDiv({ cls: "pp-outline-note" });
			note.createSpan({ text: "Not in the chapter's outline yet: link this scene under a beat in " });
			link(note.createSpan({ cls: "pp-story-ref", text: story.chapter.title || "the chapter note" }), story.chapter.path);
			note.createSpan({ text: "." });
		}
		for (const role of ["Makes", "Progresses", "Pays"] as const) {
			const mine = story.promises.filter((p) => p.role === role);
			if (!mine.length) continue;
			const line = body.createDiv({ cls: "pp-promise-line" });
			line.createSpan({ cls: "pp-outline-key", text: role });
			for (const p of mine) {
				const chip = line.createSpan({ cls: `pp-promise-chip is-${p.status}`, text: p.name });
				chip.setAttribute("aria-label", `${p.name}: ${PROMISE_LABELS[p.status]}`);
			}
		}
		if (story.speaks) {
			const line = body.createDiv({ cls: "pp-promise-line pp-speaks" });
			line.createSpan({ cls: "pp-outline-key", text: "Speaks" });
			line.createSpan({ cls: "pp-speaks-who", text: story.speaks.text });
			line.setAttribute("aria-label", `${num(story.speaks.lines)} ${story.speaks.lines === 1 ? "line" : "lines"} of speech in this scene, as of its last save. A number is lines that are theirs by a tag, a pinned speaker, an action beat or a settled pronoun; guesses from turn-taking are counted apart. The Dialogue lens shows each line.`);
			if (story.speaks.unlisted.length) body.createDiv({ cls: "pp-outline-note", text: `Tagged as speaking here, and not in pov or characters: ${story.speaks.unlisted.join(", ")}.` });
		}
		if (story.needs?.length) {
			body.createDiv({ cls: "pp-outline-group", text: "Needs a look" });
			for (const need of story.needs) {
				const row = body.createDiv({ cls: "pp-need", text: need.text });
				const { path, line } = need;
				if (path) {
					row.addClass("is-link");
					row.onclick = (evt) => ctx.onOpenPath(path, Keymap.isModEvent(evt) !== false, line);
				}
			}
		} else if (story.noPass) body.createDiv({ cls: "pp-outline-note", text: "No pass yet: nothing is held against this scene until dev, line or continuity has a date." });
		if (story.unplanned?.length) {
			body.createDiv({ cls: "pp-outline-group", text: "Scenes not in the outline" });
			for (const s of story.unplanned) {
				const row = body.createDiv({ cls: "pp-outline-row" });
				row.createSpan({ cls: "pp-outline-row-name", text: s.label });
				row.createSpan({ cls: "pp-outline-row-count", text: num(s.words) });
				link(row, s.path);
			}
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
		if (r.style) this.style(body, r.style);
		const ease = r.readability?.readingEase;
		if (ease) {
			const parts = [`Reading ease ${Math.round(ease.score)} (${ease.band.label.toLowerCase()})`];
			if (r.readability?.grade !== null && r.readability?.grade !== undefined) parts.push(`grade ${Math.max(0, Math.round(r.readability.grade))}`);
			if (r.readability?.variety) parts.push(`rhythm ${r.readability.variety.band.label.toLowerCase()}`);
			const line = body.createDiv({ cls: "pp-outline-note", text: parts.join(" · ") });
			line.setAttribute("aria-label", [ease.band.hint, r.readability?.variety?.band.hint].filter(Boolean).join("\n"));
		}
	}

	/** Sentence length and word choice in narration: descriptive, for comparing your own beats and drafts. */
	private style(body: HTMLElement, s: StyleFigures): void {
		const grid = body.createDiv({ cls: "pp-outline-stats pp-outline-style" });
		const stat = (value: string, label: string, title: string) => {
			const cell = grid.createDiv({ cls: "pp-outline-stat" });
			cell.createDiv({ cls: "pp-outline-stat-value", text: value });
			cell.createDiv({ cls: "pp-outline-stat-label", text: label });
			cell.setAttribute("aria-label", title);
		};
		const share = (x: number | null) => (x === null ? "–" : pct1(x));
		if (s.wordsPerSentence !== null) {
			stat(
				s.wordsPerSentence.toFixed(1),
				"words / sentence",
				`Average sentence length. Median ${s.medianSentence ?? "–"}; ${share(s.longSentences)} of sentences run over ${LONG_SENTENCE} words. The rhythm bars show the spread.`,
			);
		}
		stat(share(s.adjectives), "adjectives", "Share of narration words that are adjectives. Compare beats and drafts; there's no right number.");
		stat(share(s.lyAdverbs), "-ly adverbs", "Share of narration words that are -ly adverbs (the ones King warns about).");
		stat(share(s.concreteNouns), "concrete nouns", "Share of narration nouns you could see or touch (rated 3.5+ of 5 for concreteness by Brysbaert et al.). Abstract nouns tell; concrete ones show.");
	}

	private beats(root: HTMLElement, r: OutlineReport, ctx: OutlineContext): void {
		this.beatRows = [];
		if (!r.beats.length) return;
		const body = this.section(root, "beats", `Beats (${r.beats.filter((b) => !b.opening).length})`);
		const minLevel = Math.min(...r.beats.map((b) => b.level));
		// A chapter note is a plan: each beat's words are the words of the scenes attached to it.
		const planned = ctx.story?.kind === "chapter" ? (ctx.story.beats ?? []) : null;
		let heading = 0;
		const plans = r.beats.map((b) => {
			if (!planned || b.opening) return null;
			const plan = planned[heading++];
			return plan && plan.text === b.text ? plan : null;
		});
		const wordsOf = (b: OutlineReport["beats"][number], i: number) => (plans[i] ? plans[i]!.scenes.reduce((n, s) => n + s.words, 0) : b.words);
		const most = Math.max(...r.beats.map(wordsOf), 1);
		for (const [i, raw] of r.beats.entries()) {
			const plan = plans[i];
			const b = plan ? { ...raw, words: wordsOf(raw, i), dialogue: 0 } : raw;
			const row = body.createDiv({ cls: "pp-beat" });
			row.style.paddingLeft = `${(b.level - minLevel) * 12}px`;
			const head = row.createDiv({ cls: "pp-beat-head" });
			head.createSpan({ cls: `pp-beat-name${b.opening ? " pp-beat-opening" : ""}`, text: b.opening ? "Before the first heading" : b.text });
			if (b.issues) head.createSpan({ cls: "pp-beat-issues", text: String(b.issues) }).setAttribute("aria-label", `${b.issues} issue${b.issues === 1 ? "" : "s"} in this beat`);
			if (b.who?.length || b.unlisted?.length) this.cast(row, b);
			const track = row.createDiv({ cls: "pp-beat-track" });
			const bar = track.createDiv({ cls: "pp-beat-bar" });
			if (b.target) {
				// Progress to the beat's own target: the track is the target, the bar the words so far.
				const progress = b.words / b.target;
				head.createSpan({ cls: "pp-beat-words", text: `${num(b.words)} / ${num(b.target)}` });
				track.addClass("has-target");
				bar.style.width = `${Math.min(100, progress * 100)}%`;
				if (progress > 1) bar.addClass("is-over");
			} else {
				// No target: length against the longest beat.
				head.createSpan({ cls: "pp-beat-words", text: num(b.words) });
				bar.style.width = `${Math.max(4, (b.words / most) * 100)}%`;
			}
			bar.createDiv({ cls: "pp-beat-speech" }).style.width = `${b.dialogue * 100}%`;
			const st = b.style;
			const tip = [
				b.target ? `${num(b.words)} of ${num(b.target)} words (${pct(b.words / b.target)})` : `${num(b.words)} words`,
				`${pct(b.dialogue)} dialogue`,
				...(st?.wordsPerSentence ? [`${st.wordsPerSentence.toFixed(1)} words a sentence`] : []),
				...(st?.adjectives !== null && st?.adjectives !== undefined ? [`adjectives ${pct1(st.adjectives)}`] : []),
				...(st?.lyAdverbs !== null && st?.lyAdverbs !== undefined ? [`-ly ${pct1(st.lyAdverbs)}`] : []),
				...(st?.concreteNouns !== null && st?.concreteNouns !== undefined ? [`concrete nouns ${pct(st.concreteNouns)}`] : []),
			].join(" · ");
			row.setAttribute("aria-label", b.change ? `${tip}\nChange: ${b.change}` : tip);
			row.onclick = () => this.jump(Math.max(0, b.from));
			if (plan) {
				const list = row.createDiv({ cls: "pp-beat-scenes" });
				if (!plan.scenes.length) list.createSpan({ cls: "pp-beat-undrafted", text: "not drafted" });
				for (const s of plan.scenes) {
					const link = list.createSpan({ cls: "pp-story-ref is-link", text: `${s.label} · ${num(s.words)}` });
					link.setAttribute("aria-label", "Open this scene");
					link.onclick = (evt) => {
						evt.stopPropagation();
						ctx.onOpenPath(s.path, Keymap.isModEvent(evt) !== false);
					};
				}
			}
			this.beatRows.push(row);
		}
		if (planned) {
			body.createDiv({ cls: "pp-outline-note", text: "A chapter outline: each beat counts the words of the scenes linked under it. With the cursor in a beat, run \"Create scene from beat\" to start its scene." });
			return;
		}
		body.createDiv({
			cls: "pp-outline-note",
			text: r.beats.some((b) => b.target)
				? "Bar: progress to the beat's target (a target: line in a %% comment under its heading), or length against the longest beat when it has none. The darker part is dialogue."
				: "Bar: length against the longest beat; the darker part is dialogue. Add a target: 450 line in a %% comment under a heading to track it.",
		});
	}

	/** The beat's `who:` as a prompt, each person marked against the prose, plus anyone speaking unlisted. */
	private cast(row: HTMLElement, b: OutlineReport["beats"][number]): void {
		const line = row.createDiv({ cls: "pp-beat-who" });
		const tips: Record<string, string> = {
			speaks: "speaks in this beat",
			present: "named in this beat, no lines (fine: who: is who's present)",
			missing: "listed in who: but not named in this beat yet",
			described: "described, so not checked",
		};
		for (const w of b.who ?? []) {
			const span = line.createSpan({ cls: `pp-who pp-who-${w.status}`, text: w.name });
			span.setAttribute("aria-label", `${w.name}: ${tips[w.status]}`);
		}
		for (const name of b.unlisted ?? []) {
			const span = line.createSpan({ cls: "pp-who pp-who-unlisted", text: `+${name}` });
			span.setAttribute("aria-label", `${name} speaks here but isn't in the beat's who: line`);
		}
	}

	/** The writer's own marks in the note, by kind: what is left to clear, and what the pipeline has handled. */
	private annotations(root: HTMLElement, r: OutlineReport, ctx: OutlineContext): void {
		if (!r.annotations.length) return;
		const of = (kind: AnnotationKind) => r.annotations.filter((a) => a.kind === kind);
		const left = r.annotations.filter((a) => TO_CLEAR.includes(a.kind)).length;
		const body = this.section(root, "annotations", `Annotations (${num(left)} to clear)`);
		const rows = (kinds: readonly AnnotationKind[], done: boolean) => {
			for (const kind of kinds) {
				const found = of(kind);
				if (!found.length) continue;
				const label = ANNOTATION_LABELS[kind][1];
				const row = body.createDiv({ cls: `pp-outline-row${done ? " pp-annotation-done" : ""}` });
				row.createSpan({ cls: `pp-annotation-dot is-${kind}` });
				row.createSpan({ cls: "pp-outline-row-name", text: label.charAt(0).toUpperCase() + label.slice(1) });
				row.createSpan({ cls: "pp-outline-row-count", text: num(found.length) });
				const sample = found.slice(0, 6).map((a) => `· ${a.text.length > 70 ? `${a.text.slice(0, 70)}…` : a.text || "(no text)"}`).join("\n");
				row.setAttribute("aria-label", `${sample}${found.length > 6 ? `\n· and ${found.length - 6} more` : ""}\nClick to go to the next one`);
				row.onclick = () => this.jump(this.next(`annotation:${kind}`, found.map((a) => a.from), ctx.cursor));
			}
		};
		rows(TO_CLEAR, false);
		const handled = (["filed", "checked"] as const).filter((k) => of(k).length);
		if (handled.length) {
			body.createDiv({ cls: "pp-outline-group", text: "Already handled" });
			rows(handled, true);
		}
	}

	/** A scene's notes, grouped by type, or a note's scenes: each with how the two are connected. */
	private touches(root: HTMLElement, story: OutlineStory, ctx: OutlineContext): void {
		const list = story.touches ?? [];
		if (!list.length) return;
		const body = this.section(root, "touches", story.kind === "note" ? `Scenes (${num(list.length)})` : `Touches (${num(list.length)})`);
		let group: string | undefined;
		list.forEach((t, i) => {
			if (story.kind !== "note" && (i === 0 || t.group !== group)) {
				group = t.group;
				body.createDiv({ cls: "pp-outline-group", text: group ? `${group.charAt(0).toUpperCase()}${group.slice(1)}` : "Other notes" });
			}
			const row = body.createDiv({ cls: `pp-outline-row pp-touch${t.faint ? " is-faint" : ""}` });
			row.createSpan({ cls: "pp-outline-row-name", text: t.label });
			if (t.status) row.createSpan({ cls: `pp-story-status is-${t.status.toLowerCase().replace(/[^a-z]/g, "")}`, text: t.status });
			row.createSpan({ cls: "pp-outline-row-count", text: t.how });
			row.setAttribute("aria-label", t.detail);
			row.onclick = (evt) => ctx.onOpenPath(t.path, Keymap.isModEvent(evt) !== false);
		});
		body.createDiv({
			cls: "pp-outline-note",
			text: story.kind === "note"
				? "Scenes that list this note's subject, have a fact recorded here, or name it in their prose."
				: "Notes this scene is connected to: listed in its properties or its beat, holding a fact from it, or named in its prose. A note is found in the prose by its aliases.",
		});
	}

	/** What the reader knows at this scene: how much, what is still to come, and what the point of view missed. */
	private reader(root: HTMLElement, k: NonNullable<OutlineStory["knowledge"]>, ctx: OutlineContext): void {
		if (!k.here && !k.before && !k.later.length) return;
		const body = this.section(root, "reader", "Reader");
		body.createDiv({ cls: "pp-outline-note", text: `Shown before this scene: ${num(k.before)}. Shown here: ${num(k.here)}.` });
		const list = (id: string, title: string, facts: OutlineFact[], hint: string) => {
			if (!facts.length) return;
			const details = body.createEl("details", { cls: "pp-story-chapter pp-story-group" });
			// These lists are for looking something up, so they start folded.
			details.open = this.closed.has(`reader-open:${id}`);
			details.createEl("summary", { text: title }).createSpan({ cls: "pp-beat-words", text: num(facts.length) });
			details.addEventListener("toggle", () => {
				if (details.open) this.closed.add(`reader-open:${id}`);
				else this.closed.delete(`reader-open:${id}`);
			});
			const inner = details.createDiv({ cls: "pp-outline-body" });
			for (const f of facts) {
				const row = inner.createDiv({ cls: "pp-story-row pp-reveal is-link" });
				row.createDiv({ cls: "pp-reveal-text", text: f.text });
				row.createDiv({ cls: "pp-reveal-foot" }).createSpan({ cls: "pp-story-ref", text: f.where });
				row.setAttribute("aria-label", `${f.text}\n${f.where}`);
				row.onclick = (evt) => ctx.onOpenPath(f.path, Keymap.isModEvent(evt) !== false, f.line);
			}
			inner.createDiv({ cls: "pp-outline-note", text: hint });
		};
		list("later", "From later scenes", k.later, "Recorded from scenes after this one. The reader doesn't have these yet, so this scene can't lean on them.");
		if (k.pov) list("ahead", `${k.pov} wasn't there`, k.ahead, `Shown to the reader in scenes that don't list ${k.pov}. Going by who was in the scene, the reader knows these and ${k.pov} may not.`);
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
