import { ItemView, Keymap, type WorkspaceLeaf } from "obsidian";
import { ANNOTATION_KINDS, type AnnotationKind, type Book, type BookBeat, type BookChapter, type PromiseRef, type PromiseRow, type PromiseStatus, scenePromises, type SceneRecord, toClear } from "./analysis/story";

export const STORY_VIEW = "proseprince-story";

export interface StoryContext {
	book: Book;
	/** The note being edited, so its row can be marked. */
	current: string | null;
	onOpen(path: string, newTab: boolean): void;
	/** Open a read-through: of one chapter, or of the whole book when no chapter is given. */
	onRead(chapter?: number): void;
}

const num = (x: number) => x.toLocaleString();
const pad = (n: number) => String(n).padStart(2, "0");

export const ANNOTATION_LABELS: Record<AnnotationKind, [one: string, many: string]> = {
	note: ["note to file", "notes to file"],
	question: ["question", "questions"],
	todo: ["todo", "todos"],
	check: ["claim to check", "claims to check"],
	fix: ["fix-later box", "fix-later boxes"],
	stumble: ["stumble", "stumbles"],
	placeholder: ["placeholder", "placeholders"],
	filed: ["filed", "filed"],
	checked: ["checked", "checked"],
};

export const PROMISE_LABELS: Record<PromiseStatus, string> = {
	open: "open",
	progressing: "progressing",
	paid: "paid",
	"paid-before-made": "paid before it was made",
	"never-made": "never made",
};

/**
 * The ProsePrince story view: the book in reading order (chapters, their beats, their scenes) and
 * every promise with where it was made, moved on and paid. Everything is derived from the notes.
 */
export class StoryView extends ItemView {
	private ctx: StoryContext | null = null;
	private closed = new Set<string>();
	private rows = new Map<string, HTMLElement>();

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return STORY_VIEW;
	}

	getDisplayText(): string {
		return "ProsePrince story";
	}

	getIcon(): string {
		return "library";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	show(ctx: StoryContext): void {
		this.ctx = ctx;
		this.render();
	}

	/** Mark the note being edited, without redrawing. */
	setCurrent(path: string | null): void {
		if (this.ctx) this.ctx.current = path;
		for (const [p, row] of this.rows) row.toggleClass("is-current", p === path);
	}

	private render(): void {
		const root = this.contentEl;
		const scroll = root.scrollTop;
		root.empty();
		root.addClass("pp-outline", "pp-story");
		this.rows.clear();
		const book = this.ctx?.book;
		if (!book || !book.chapters.length) {
			root.createDiv({ cls: "pp-outline-empty", text: "No scenes found yet. A scene is a note in your prose folders named chapter.scene, for example \"04.02 - Breakfast Bar\". A note named \"04.00 - …\" is that chapter's outline." });
			return;
		}
		root.createDiv({ cls: "pp-outline-title", text: "Story" });
		root.createDiv({ cls: "pp-outline-note", text: `${num(book.words)} words · ${book.chapters.length} chapter${book.chapters.length === 1 ? "" : "s"} · ${book.scenes.length} scene${book.scenes.length === 1 ? "" : "s"}` });
		const read = root.createEl("button", { cls: "pp-outline-button pp-story-read-book", text: "Read the book…" });
		read.setAttribute("aria-label", "Every written scene, in order, as one page. Nothing is copied: the page embeds the scenes.");
		read.onclick = () => this.ctx?.onRead();
		this.bookSection(root, book);
		this.promiseSection(root, book);
		this.setCurrent(this.ctx?.current ?? null);
		root.scrollTop = scroll;
	}

	private section(root: HTMLElement, id: string, title: string, cls = "pp-outline-section"): { details: HTMLDetailsElement; summary: HTMLElement; body: HTMLElement } {
		const details = root.createEl("details", { cls });
		details.open = !this.closed.has(id);
		const summary = details.createEl("summary", { text: title });
		details.addEventListener("toggle", () => {
			if (details.open) this.closed.delete(id);
			else this.closed.add(id);
		});
		return { details, summary, body: details.createDiv({ cls: "pp-outline-body" }) };
	}

	/**
	 * Make an element open a note. Not called `open`: Obsidian calls `view.open()` itself to attach a view,
	 * and that method isn't in the public typings, so a method of that name here replaces it unnoticed.
	 */
	private linkTo(el: HTMLElement, path: string): void {
		el.addClass("is-link");
		el.onclick = (evt) => {
			evt.stopPropagation();
			this.ctx?.onOpen(path, Keymap.isModEvent(evt) !== false);
		};
	}

	// ── Book ─────────────────────────────────────────────────────────────────────

	private bookSection(root: HTMLElement, book: Book): void {
		const { body } = this.section(root, "book", "Book");
		for (const chapter of book.chapters) this.chapter(body, book, chapter);
		body.createDiv({ cls: "pp-outline-note", text: "D, L and C are the dev, line and continuity passes. The number in the pill is what's left to clear in the scene. Hover a row for more; click to open it." });
	}

	private chapter(body: HTMLElement, book: Book, c: BookChapter): void {
		const { summary, body: inner } = this.section(body, `chapter:${c.number}`, `${pad(c.number)}${c.title ? ` ${c.title}` : ""}`, "pp-story-chapter");
		summary.createSpan({ cls: "pp-beat-words", text: c.target ? `${num(c.words)} / ${num(c.target)}` : num(c.words) });
		if (c.words) {
			const read = summary.createSpan({ cls: "pp-story-ref pp-story-read is-link", text: "read" });
			read.setAttribute("aria-label", "Read this chapter as one page");
			read.onclick = (evt) => {
				// Not a toggle of the chapter's fold.
				evt.preventDefault();
				evt.stopPropagation();
				this.ctx?.onRead(c.number);
			};
		}
		if (c.target) this.bar(inner, c.words, c.target);
		if (c.note) {
			const card = c.note.outline?.card ?? [];
			const row = inner.createDiv({ cls: "pp-story-row pp-story-note" });
			row.createSpan({ cls: "pp-story-name", text: "Chapter outline" });
			const left = toClear(c.note.annotations);
			if (left) row.createSpan({ cls: "pp-beat-issues", text: String(left) });
			row.setAttribute("aria-label", [c.note.summary, ...card.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join("\n") || "The chapter's card and beats");
			this.linkTo(row, c.note.path);
			this.rows.set(c.note.path, row);
		}
		if (c.outOfOrder) inner.createDiv({ cls: "pp-outline-note pp-story-warn", text: "The outline lists these scenes in a different order from their numbers. The numbers are the reading order." });
		for (const beat of c.beats) this.beat(inner, book, c, beat);
		if (c.beats.length && c.unplanned.length) inner.createDiv({ cls: "pp-outline-group", text: "Not in the outline" });
		for (const s of c.unplanned) this.scene(inner, book, s, undefined, !!c.beats.length);
	}

	private beat(body: HTMLElement, book: Book, c: BookChapter, b: BookBeat): void {
		const head = body.createDiv({ cls: "pp-story-beat" });
		head.createSpan({ cls: "pp-story-name", text: b.text });
		head.createSpan({ cls: "pp-beat-words", text: !b.scenes.length ? (b.target ? `not drafted · ${num(b.target)}` : "not drafted") : b.target ? `${num(b.words)} / ${num(b.target)}` : num(b.words) });
		if (!b.scenes.length) head.addClass("is-empty");
		head.setAttribute("aria-label", b.card.map(([k, v]) => `${k}: ${v}`).join("\n") || "No card for this beat yet");
		if (c.note) this.linkTo(head, c.note.path);
		// One scene carries the whole beat, so the beat's target is the scene's; with several, each keeps its own.
		for (const s of b.scenes) this.scene(body, book, s, b.scenes.length === 1 ? b.target : undefined, true);
	}

	private scene(body: HTMLElement, book: Book, s: SceneRecord, beatTarget: number | undefined, indent: boolean): void {
		const row = body.createDiv({ cls: `pp-story-row pp-story-scene${indent ? " is-indented" : ""}` });
		const head = row.createDiv({ cls: "pp-beat-head" });
		head.createSpan({ cls: "pp-story-name", text: `${pad(s.name.chapter)}.${pad(s.name.scene)} ${s.name.title}` });
		const marks = head.createSpan({ cls: "pp-story-flags" });
		for (const [letter, key] of [["D", "dev"], ["L", "line"], ["C", "continuity"]] as const) marks.createSpan({ cls: `pp-story-flag${s.flags[key] ? " is-done" : ""}`, text: letter });
		const left = toClear(s.annotations);
		if (left) head.createSpan({ cls: "pp-beat-issues", text: String(left) });
		const target = s.target ?? beatTarget;
		head.createSpan({ cls: "pp-beat-words", text: target ? `${num(s.words)} / ${num(target)}` : num(s.words) });
		if (target) this.bar(row, s.words, target);

		const notes = ANNOTATION_KINDS.filter((k) => s.annotations[k]).map((k) => `${s.annotations[k]} ${ANNOTATION_LABELS[k][s.annotations[k] === 1 ? 0 : 1]}`);
		const promises = scenePromises(book, s);
		const pass = (label: string, date?: string) => `${label} ${date ?? "not yet"}`;
		row.setAttribute("aria-label", [
			s.summary,
			[s.pov ? `POV ${s.pov}` : "", s.characters.length ? `with ${s.characters.join(", ")}` : "", s.setting ?? "", s.day ? `day ${s.day}` : ""].filter(Boolean).join(" · "),
			`Passes: ${pass("dev", s.flags.dev)} · ${pass("line", s.flags.line)} · ${pass("continuity", s.flags.continuity)}`,
			notes.length ? `In the scene: ${notes.join(", ")}` : "",
			...(["Makes", "Progresses", "Pays"] as const).map((role) => {
				const names = promises.filter((p) => p.role === role).map((p) => `${p.name} (${PROMISE_LABELS[p.status]})`);
				return names.length ? `${role}: ${names.join(", ")}` : "";
			}),
		].filter(Boolean).join("\n"));
		this.linkTo(row, s.path);
		this.rows.set(s.path, row);
	}

	private bar(parent: HTMLElement, words: number, target: number): void {
		const track = parent.createDiv({ cls: "pp-beat-track has-target" });
		const bar = track.createDiv({ cls: "pp-beat-bar" });
		bar.style.width = `${Math.min(100, (words / target) * 100)}%`;
		if (words > target) bar.addClass("is-over");
	}

	// ── Promises ─────────────────────────────────────────────────────────────────

	private promiseSection(root: HTMLElement, book: Book): void {
		const waiting = book.promises.filter((p) => p.status === "open" || p.status === "progressing").length;
		const { body } = this.section(root, "promises", book.promises.length ? `Promises (${waiting} open)` : "Promises");
		if (!book.promises.length) {
			body.createDiv({ cls: "pp-outline-note", text: "None yet. Name a promise under promises: in a scene's properties, and name it again under pays: in the scene that pays it off. progresses: is for a scene that moves it on." });
			return;
		}
		for (const p of book.promises) this.promise(body, p);
		body.createDiv({ cls: "pp-outline-note", text: "From promises:, progresses: and pays: in each scene's properties, in reading order. Open: made and not yet paid. A warning usually means the name is spelt two ways." });
	}

	private promise(body: HTMLElement, p: PromiseRow): void {
		const row = body.createDiv({ cls: `pp-story-row pp-promise is-${p.status}` });
		const head = row.createDiv({ cls: "pp-beat-head" });
		head.createSpan({ cls: "pp-promise-dot" });
		head.createSpan({ cls: "pp-story-name", text: p.name });
		head.createSpan({ cls: "pp-beat-words", text: PROMISE_LABELS[p.status] });
		const trail = row.createDiv({ cls: "pp-promise-trail" });
		const part = (label: string, refs: PromiseRef[]) => {
			if (!refs.length) return;
			const group = trail.createSpan({ cls: "pp-promise-part" });
			group.createSpan({ cls: "pp-outline-key", text: `${label} ` });
			refs.forEach((ref, i) => {
				if (i) group.appendText(", ");
				const link = group.createSpan({ cls: "pp-story-ref", text: ref.repeats ? `${ref.label} (in ${ref.repeats} scenes)` : ref.label });
				this.linkTo(link, ref.path);
			});
		};
		part("made", p.made);
		part("progressed", p.progressed);
		part("paid", p.paid);
		const first = p.made[0] ?? p.progressed[0] ?? p.paid[0];
		if (first) this.linkTo(row, first.path);
		row.setAttribute("aria-label", {
			open: "Made and not paid yet.",
			progressing: "Made and moved on, not paid yet.",
			paid: "Made and paid.",
			"paid-before-made": "A scene pays this before the scene that makes it. Check the order, or the name.",
			"never-made": "A scene pays or progresses this, but no scene makes it. Check the name's spelling.",
		}[p.status]);
	}
}
