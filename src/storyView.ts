import { ItemView, Keymap, type WorkspaceLeaf } from "obsidian";
import { type CanonNote, type CastIssueKind, type CastRow, type Filing, type Relations, type Reveal, revealsUpTo, sceneOrder, type Touch } from "./analysis/relations";
import { ANNOTATION_KINDS, type AnnotationKind, type Book, type BookBeat, type BookChapter, type PromiseRef, type PromiseRow, type PromiseStatus, sceneLabel, scenePromises, type SceneRecord, toClear } from "./analysis/story";

export const STORY_VIEW = "proseprince-story";

export interface StoryContext {
	book: Book;
	relations: Relations;
	/** The note being edited, so its row can be marked. */
	current: string | null;
	/** Open a note, at a line (from 0) when one is given. */
	onOpen(path: string, newTab: boolean, line?: number): void;
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

const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

/** How a scene and a note are connected, in a few words: "pov · 2 facts · named". */
export function touchLabel(t: Touch): string {
	const declared = t.declared.map((d) => (d === "beat" ? "in the beat" : d === "character" ? "in the scene" : d));
	return [...declared, t.facts ? plural(t.facts, "fact") : "", !t.facts && t.filed ? `${num(t.filed)} filed` : "", t.mentions.length ? "named" : ""].filter(Boolean).join(" · ");
}

/** The same, spelt out for a tooltip. */
export function touchDetail(t: Touch): string {
	const how: Record<Touch["declared"][number], string> = { pov: "the scene's pov", character: "the scene's characters", setting: "the scene's setting", beat: "the beat's who: in the chapter outline" };
	return [
		t.declared.length ? `Declared: ${t.declared.map((d) => how[d]).join(", ")}` : "",
		t.facts ? `Recorded: ${plural(t.facts, "fact")} in the note ${t.facts === 1 ? "cites" : "cite"} this scene` : "",
		t.filed ? `Filed: ${plural(t.filed, "filed comment")} in the scene ${t.filed === 1 ? "names" : "name"} the note` : "",
		t.mentions.length ? `Named in the prose: ${t.mentions.join(", ")}` : "",
		t.note.status ? `The note is ${t.note.status}` : "",
	].filter(Boolean).join("\n");
}

const CAST_ISSUES: Record<CastIssueKind, (scene: string) => string> = {
	unnamed: (scene) => `Listed in ${scene}, but its prose never names them`,
	"beat-only": (scene) => `In the beat's who: for ${scene}, but not in the scene's characters`,
	"scene-only": (scene) => `In the characters of ${scene}, but not in its beat's who:`,
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
	private revealOrder: "scene" | "note" | "day" = "scene";
	/** The scene the Reveals section is rewound to, or null for the whole book. */
	private asOf: string | null = null;

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
		const relations = this.ctx?.relations;
		if (relations) {
			this.revealSection(root, book, relations);
			this.castSection(root, relations);
		}
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
	private linkTo(el: HTMLElement, path: string, line?: number): void {
		el.addClass("is-link");
		el.onclick = (evt) => {
			evt.stopPropagation();
			// In a section's heading, a click on the link is not a click on the fold.
			evt.preventDefault();
			this.ctx?.onOpen(path, Keymap.isModEvent(evt) !== false, line);
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
		// Named in the prose alone is too loose to list here: the outline has the full picture.
		const touched = (this.ctx?.relations.touches.get(s.path) ?? []).filter((t) => t.declared.length || t.facts || t.filed);
		row.setAttribute("aria-label", [
			s.summary,
			[s.pov ? `POV ${s.pov}` : "", s.characters.length ? `with ${s.characters.join(", ")}` : "", s.setting ?? "", s.day ? `day ${s.day}` : ""].filter(Boolean).join(" · "),
			`Passes: ${pass("dev", s.flags.dev)} · ${pass("line", s.flags.line)} · ${pass("continuity", s.flags.continuity)}`,
			notes.length ? `In the scene: ${notes.join(", ")}` : "",
			touched.length ? `Touches: ${touched.map((t) => t.note.title).join(", ")}` : "",
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

	// ── Reveals ──────────────────────────────────────────────────────────────────

	private revealSection(root: HTMLElement, book: Book, relations: Relations): void {
		const filed = relations.reveals.filter((r) => r.note).length;
		const unfiled = relations.reveals.length - filed;
		const { body } = this.section(root, "reveals", relations.reveals.length ? `Reveals (${num(filed)} shown${unfiled ? `, ${num(unfiled)} unfiled` : ""})` : "Reveals");
		if (!relations.reveals.length) {
			body.createDiv({ cls: "pp-outline-note", text: "None yet. A reveal is a line in a note about the story that ends with the scene it came from, like \"The ferry runs only at slack water. ([[02.01 - Ferry]])\". A > [!note] still in a scene counts as unfiled." });
			return;
		}
		if (this.revealOrder === "day" && !relations.hasDays) this.revealOrder = "scene";
		const order = sceneOrder(book, this.revealOrder === "day" ? "day" : "reading");
		if (this.asOf && !order.some((s) => s.path === this.asOf)) this.asOf = null;

		const controls = body.createDiv({ cls: "pp-story-controls" });
		const by = controls.createEl("select", { cls: "dropdown" });
		by.setAttribute("aria-label", "How to group what the reader has been shown");
		for (const [value, label] of [["scene", "By scene"], ["note", "By note"], ...(relations.hasDays ? [["day", "By day"]] : [])] as [typeof this.revealOrder, string][]) by.createEl("option", { value, text: label });
		by.value = this.revealOrder;
		by.onchange = () => {
			this.revealOrder = by.value as typeof this.revealOrder;
			this.render();
		};
		const upTo = controls.createEl("select", { cls: "dropdown" });
		upTo.setAttribute("aria-label", "Rewind: show only what the reader has been shown up to this scene");
		upTo.createEl("option", { value: "", text: "The whole book" });
		for (const s of order) upTo.createEl("option", { value: s.path, text: `As of ${sceneLabel(s)}` });
		upTo.value = this.asOf ?? "";
		upTo.onchange = () => {
			this.asOf = upTo.value || null;
			this.render();
		};

		const shown = revealsUpTo(relations, order, this.asOf);
		if (this.asOf) body.createDiv({ cls: "pp-outline-note", text: `${plural(shown.length, "fact")} by the end of this scene${this.revealOrder === "day" ? ", in the story's own time" : ""}; ${num(relations.reveals.length - shown.length)} still to come.` });
		const limit = this.asOf ? order.findIndex((s) => s.path === this.asOf) : order.length - 1;
		if (this.revealOrder === "note") this.revealsByNote(body, relations, shown);
		else this.revealsByScene(body, relations, shown, order.slice(0, limit + 1));
		body.createDiv({ cls: "pp-outline-note", text: "Each fact is a line in a note that ends with the scene it came from. Hover one for who was in that scene: they were there, which is not the same as noticing. Click to open the note at that line." });
	}

	private revealsByScene(body: HTMLElement, relations: Relations, shown: readonly Reveal[], scenes: readonly SceneRecord[]): void {
		for (const scene of scenes) {
			const mine = shown.filter((r) => r.scene.path === scene.path);
			const filings = relations.filings.filter((f) => f.scene.path === scene.path);
			if (!mine.length && !filings.length) continue;
			const { summary, body: inner } = this.section(body, `reveal:${scene.path}`, sceneLabel(scene), "pp-story-chapter pp-story-group");
			summary.createSpan({ cls: "pp-beat-words", text: [this.revealOrder === "day" && scene.day ? `day ${scene.day}` : "", num(mine.length)].filter(Boolean).join(" · ") });
			const open = summary.createSpan({ cls: "pp-story-ref pp-story-read", text: "open" });
			open.setAttribute("aria-label", "Open the scene");
			this.linkTo(open, scene.path);
			for (const r of mine) this.reveal(inner, r, r.note ? r.note.title : "unfiled");
			for (const f of filings) this.filing(inner, f);
		}
	}

	private revealsByNote(body: HTMLElement, relations: Relations, shown: readonly Reveal[]): void {
		for (const note of relations.notes) {
			const mine = shown.filter((r) => r.note === note);
			if (!mine.length) continue;
			const { summary, body: inner } = this.section(body, `reveal:${note.path}`, note.title, "pp-story-chapter pp-story-group");
			this.status(summary, note);
			summary.createSpan({ cls: "pp-beat-words", text: num(mine.length) });
			const open = summary.createSpan({ cls: "pp-story-ref pp-story-read", text: "open" });
			open.setAttribute("aria-label", "Open the note");
			this.linkTo(open, note.path);
			for (const r of mine) this.reveal(inner, r, sceneLabel(r.scene));
		}
		const unfiled = shown.filter((r) => !r.note);
		if (unfiled.length) {
			const { summary, body: inner } = this.section(body, "reveal:unfiled", "Not filed yet", "pp-story-chapter pp-story-group");
			summary.createSpan({ cls: "pp-beat-words", text: num(unfiled.length) });
			for (const r of unfiled) this.reveal(inner, r, sceneLabel(r.scene));
		}
		if (relations.quiet.length) {
			body.createDiv({ cls: "pp-outline-group", text: "Named in the prose, nothing recorded" });
			for (const q of relations.quiet) {
				const row = body.createDiv({ cls: "pp-story-row pp-story-warn" });
				const head = row.createDiv({ cls: "pp-beat-head" });
				head.createSpan({ cls: "pp-story-name", text: q.note.title });
				head.createSpan({ cls: "pp-beat-words", text: plural(q.scenes.length, "scene") });
				row.setAttribute("aria-label", `The prose names this in ${q.scenes.map(sceneLabel).join(", ")}, and no fact in the note cites a scene. Nothing may need recording; this is here so it's a choice.`);
				this.linkTo(row, q.note.path);
			}
		}
		for (const a of relations.ambiguous) body.createDiv({ cls: "pp-outline-note pp-story-warn", text: `"${a.name}" is a name of ${a.notes.map((n) => n.title).join(" and ")}, so it isn't counted for either.` });
	}

	private reveal(body: HTMLElement, r: Reveal, where: string): void {
		const row = body.createDiv({ cls: `pp-story-row pp-reveal${r.note ? "" : " is-unfiled"}` });
		row.createDiv({ cls: "pp-reveal-text", text: r.text });
		const foot = row.createDiv({ cls: "pp-reveal-foot" });
		foot.createSpan({ cls: "pp-story-ref", text: where });
		if (r.also.length) foot.createSpan({ cls: "pp-outline-key", text: ` and ${plural(r.also.length, "more scene")}` });
		row.setAttribute("aria-label", [
			r.text,
			r.knownTo.length ? `In the scene: ${r.knownTo.join(", ")}` : "The scene lists no characters, so nobody is known to have been there",
			r.also.length ? `Also cites ${r.also.map(sceneLabel).join(", ")}` : "",
			r.note ? `Filed in ${r.note.basename}${r.added ? `, added ${r.added}` : ""}` : "Still a [!note] in the scene: not filed yet",
		].filter(Boolean).join("\n"));
		if (r.note) this.linkTo(row, r.note.path, r.line);
		else this.linkTo(row, r.scene.path);
	}

	private filing(body: HTMLElement, f: Filing): void {
		const row = body.createDiv({ cls: "pp-outline-note pp-story-warn" });
		const filed = `${plural(f.count, "filed comment")} here ${f.count === 1 ? "names" : "name"} ${f.name}`;
		if (!f.note) row.setText(`${filed}, and no note has that name. It may have been renamed or archived.`);
		else if (f.elsewhere.length) row.setText(`${filed}, but that note cites ${f.elsewhere.map(sceneLabel).join(", ")} and never this scene. If this scene was split off, the citations still carry the old name.`);
		else row.setText(`${filed}, but no fact in that note cites this scene.`);
		if (f.note) this.linkTo(row, f.note.path);
	}

	private status(parent: HTMLElement, note: CanonNote): void {
		if (note.status) parent.createSpan({ cls: `pp-story-status is-${note.status.toLowerCase().replace(/[^a-z]/g, "")}`, text: note.status });
	}

	// ── Cast ─────────────────────────────────────────────────────────────────────

	private castSection(root: HTMLElement, relations: Relations): void {
		if (!relations.cast.length) return;
		const disagreements = relations.cast.reduce((n, r) => n + r.issues.length, 0);
		const { body } = this.section(root, "cast", `Cast (${num(relations.cast.length)}${disagreements ? `, ${plural(disagreements, "thing")} to check` : ""})`);
		for (const r of relations.cast) this.castRow(body, r);
		body.createDiv({ cls: "pp-outline-note", text: "In: named in a scene's pov or characters. Named: in its prose only. A row is here because a scene or a beat lists the name, or a character note carries it. Who speaks is checked note by note, in the outline under the Dialogue lens." });
	}

	private castRow(body: HTMLElement, r: CastRow): void {
		const row = body.createDiv({ cls: `pp-story-row pp-cast${r.present.length || r.mentioned.length ? "" : " is-absent"}` });
		const head = row.createDiv({ cls: "pp-beat-head" });
		head.createSpan({ cls: "pp-story-name", text: r.name });
		if (r.note) this.status(head, r.note);
		const counts = [r.present.length ? `in ${num(r.present.length)}` : "", r.mentioned.length ? `named in ${num(r.mentioned.length)}` : ""].filter(Boolean).join(" · ");
		head.createSpan({ cls: "pp-beat-words", text: counts || "not in a scene yet" });
		const number = (s: SceneRecord) => `${pad(s.name.chapter)}.${pad(s.name.scene)}`;
		row.setAttribute("aria-label", [
			r.note ? `Character note: ${r.note.basename}` : "No character note carries this name. If one should, add the name to its aliases.",
			r.first && r.last ? (r.first === r.last ? `Only in ${sceneLabel(r.first)}` : `First in ${sceneLabel(r.first)}, last in ${sceneLabel(r.last)}`) : "",
			r.present.length ? `In: ${r.present.map(number).join(", ")}` : "",
			r.mentioned.length ? `Named only: ${r.mentioned.map(number).join(", ")}` : "",
		].filter(Boolean).join("\n"));
		if (r.note) this.linkTo(row, r.note.path);
		else if (r.first) this.linkTo(row, r.first.path);
		for (const issue of r.issues) {
			const line = row.createDiv({ cls: "pp-cast-issue" });
			line.setText(CAST_ISSUES[issue.kind](sceneLabel(issue.scene)));
			this.linkTo(line, issue.scene.path);
		}
	}
}
