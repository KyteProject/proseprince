import { StateEffect, StateField, type Extension, type Range as DecorationRange, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, hoverTooltip, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { filterHighlights } from "../analysis/filter";
import { excludedBlocks, type Range } from "../analysis/mask";
import { namesIn, namesInText } from "../analysis/names";
import { combine, report, type ReadabilityReport } from "../analysis/readability";
import { rhythmTier } from "../analysis/rhythm";
import { GUIDES, type GuideKey } from "../analysis/guides";
import { kindSlug, type Highlight, type ParagraphResult } from "../analysis/types";
import { CHECK_INFO, type Effective, effective, POS_LABELS } from "../settingsModel";
import type { ProsePrinceSettings } from "../settingsModel";
import type { AnalysisClient } from "../worker/client";
import { ResultCache } from "./cache";
import { applyExclusions, type Paragraph, paragraphsAround } from "./paragraphs";

export interface ReadabilityState {
	paragraph: ReadabilityReport | null;
	note: ReadabilityReport | null;
}

export interface HighlighterHost {
	settings: ProsePrinceSettings;
	client: AnalysisClient;
	cache: ResultCache;
	reportError(error: Error): void;
	reportReadability(view: EditorView, state: ReadabilityState): void;
	/** Proper nouns from the writer's cast: character notes plus the World note's names and places. */
	castNames(): ReadonlySet<string>;
	/** The World note's invented vocabulary, lowercased: never an echo or a metaphor partner. */
	worldTerms(): ReadonlySet<string>;
	/** Whether this editor's note is one ProsePrince should run on (folder scope, frontmatter flag). */
	isActive(view: EditorView): boolean;
}

/** A paragraph plus the known names that occur in it. */
interface Prepared extends Paragraph {
	names: string[];
}

interface Finding {
	from: number;
	to: number;
	highlight: Highlight;
	/** Document offset of the end of the finding's paragraph, where suppression comments go. */
	paragraphEnd: number;
}

const setHighlights = StateEffect.define<DecorationSet>();

const highlightField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, tr) {
		for (const effect of tr.effects) if (effect.is(setHighlights)) return effect.value;
		return tr.docChanged ? value.map(tr.changes) : value;
	},
	provide: (field) => EditorView.decorations.from(field),
});

const WORD_CHAR = /[\p{L}\p{N}'’-]/u;
/** After typing inside a word, wait this long before highlighting that word. */
const CURSOR_WORD_DELAY = 700;
/** Idle time before the whole-note readability pass. */
const NOTE_PASS_DELAY = 1500;
const NOTE_PASS_BATCH = 200;
const SUPPRESS = /%%\s*not\s+([a-z-]+)\s*%%/gi;

/** Set `localStorage["proseprince-debug"] = "1"` in the developer console to log why highlighting re-runs. */
function debug(...args: unknown[]): void {
	try {
		if (window.localStorage.getItem("proseprince-debug")) console.debug("[ProsePrince]", ...args);
	} catch {
		// storage unavailable: no logging
	}
}

/** Edits the writer made; anything else (Sync pulling a newer version, a plugin rewriting the note) re-highlights at once. */
const isTyping = (u: ViewUpdate) => u.transactions.some((tr) => tr.isUserEvent("input") || tr.isUserEvent("delete") || tr.isUserEvent("undo") || tr.isUserEvent("redo") || tr.isUserEvent("move"));

const marks = new Map<string, Decoration>();
function mark(className: string): Decoration {
	let m = marks.get(className);
	if (!m) marks.set(className, (m = Decoration.mark({ class: className })));
	return m;
}

const classFor = (h: Highlight) => ("pos" in h.kind ? `pp-pos pp-pos-${h.kind.pos.toLowerCase()}` : `pp-check pp-check-${kindSlug(h.kind.check)}`);

function anythingEnabled(e: Effective, s: ProsePrinceSettings): boolean {
	return Object.values(e.pos).some(Boolean) || Object.values(e.checks).some(Boolean) || e.rhythm || s.readabilityStatus;
}

function typedInsideWord(update: ViewUpdate): boolean {
	let inWord = false;
	update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
		const text = inserted.toString();
		inWord = text.length > 0 && WORD_CHAR.test(text[text.length - 1]!);
	});
	return inWord;
}

/** True when a highlighted span is, or contains, one of the world's invented terms. */
function mentionsTerm(span: string, terms: ReadonlySet<string>): boolean {
	const words = span.toLowerCase().split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);
	return words.some((w) => terms.has(w) || terms.has(w.replace(/(['’]s|s|es)$/, ""))) || terms.has(span.toLowerCase().trim());
}

/** Kinds the writer has switched off in this paragraph with `%% not cliche %%`. */
function suppressedIn(text: string): Set<string> {
	const out = new Set<string>();
	for (const m of text.matchAll(SUPPRESS)) out.add(m[1]!.toLowerCase());
	return out;
}

const excludedCache = new WeakMap<Text, Range[]>();
function excludedFor(doc: Text): Range[] {
	let r = excludedCache.get(doc);
	if (!r) excludedCache.set(doc, (r = excludedBlocks(doc.toString())));
	return r;
}

function allParagraphs(doc: Text): Paragraph[] {
	return applyExclusions(paragraphsAround(doc, [{ from: 0, to: doc.length }]), excludedFor(doc));
}

/** Names evidenced in the note itself (capitalised mid-sentence), per document version. */
const docNamesCache = new WeakMap<Text, Set<string>>();
function docNames(doc: Text): Set<string> {
	let n = docNamesCache.get(doc);
	if (!n) docNamesCache.set(doc, (n = namesInText(doc.toString())));
	return n;
}

export class HighlightRunner {
	private timer: number | null = null;
	private wordTimer: number | null = null;
	private noteTimer: number | null = null;
	private requestId = 0;
	private destroyed = false;
	private suppressCursorWord = false;
	private findings: Finding[] = [];
	private noteReport: ReadabilityReport | null = null;
	private noteReportDoc: Text | null = null;
	/** What is currently drawn, so an identical result is not dispatched again. */
	private drawn = "";

	constructor(
		private readonly view: EditorView,
		private readonly host: HighlighterHost,
	) {
		this.schedule(0);
	}

	update(update: ViewUpdate): void {
		if (update.docChanged) {
			// Highlights were mapped through the edit, so what's on screen no longer matches `drawn`.
			this.drawn = "\u0000stale";
			const typing = isTyping(update);
			this.suppressCursorWord = typing && typedInsideWord(update);
			debug(typing ? "typing" : "document replaced without typing (e.g. Sync)", "→ re-highlight");
			this.schedule(typing ? this.host.settings.debounceMs : 0);
			if (this.suppressCursorWord) this.scheduleCursorWord();
		} else if (update.viewportChanged) {
			this.schedule(50);
		} else if (update.selectionSet || update.focusChanged) {
			// Rhythm follows the cursor's paragraph, and so does the paragraph readability.
			this.schedule(0);
		}
	}

	/**
	 * Re-apply after a settings or scope change; cached analysis makes this instant. It keeps the
	 * word-being-typed suppression and the note readability, so a refresh mid-typing changes nothing visible.
	 */
	refresh(): void {
		debug("refresh requested");
		this.schedule(0);
	}

	/** Craft-check highlights covering a document position, for the hover card. */
	findingsAt(pos: number): Finding[] {
		return this.findings.filter((f) => f.from <= pos && f.to >= pos && "check" in f.highlight.kind);
	}

	destroy(): void {
		this.destroyed = true;
		for (const t of [this.timer, this.wordTimer, this.noteTimer]) if (t !== null) window.clearTimeout(t);
		this.view.dom.classList.remove("pp-ooze");
	}

	private schedule(delay: number): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => void this.run(), delay);
	}

	private scheduleCursorWord(): void {
		if (this.wordTimer !== null) window.clearTimeout(this.wordTimer);
		this.wordTimer = window.setTimeout(() => {
			this.suppressCursorWord = false;
			void this.run();
		}, CURSOR_WORD_DELAY);
	}

	private keyOf(p: Prepared): string {
		return ResultCache.key(p.text, this.host.settings.echoWindow, p.names);
	}

	/** Attach the known names (note evidence + cast) that occur in each paragraph. */
	private prepare(doc: Text, paragraphs: Paragraph[]): Prepared[] {
		const known = new Set([...docNames(doc), ...this.host.castNames()]);
		return paragraphs.map((p) => ({ ...p, names: namesIn(p.text, known) }));
	}

	/** Analyse whatever is missing from the cache. Returns false if the run went stale. */
	private async ensure(paragraphs: Prepared[], requestId: number): Promise<boolean> {
		const missing = paragraphs.filter((p) => !this.host.cache.has(this.keyOf(p)));
		for (let i = 0; i < missing.length; i += NOTE_PASS_BATCH) {
			const batch = missing.slice(i, i + NOTE_PASS_BATCH);
			const results = await this.host.client.analyze(batch.map((p) => ({ text: p.text, names: p.names })), this.host.settings.echoWindow);
			results.forEach((result, k) => this.host.cache.set(this.keyOf(batch[k]!), result));
			if (this.destroyed || requestId !== this.requestId) return false;
		}
		return true;
	}

	private async run(): Promise<void> {
		if (this.destroyed) return;
		const { view, host } = this;
		const settings = host.settings;
		const active = effective(settings);
		const requestId = ++this.requestId;
		view.dom.classList.toggle("pp-ooze", settings.enabled && active.oozeMode);
		if (!settings.enabled || !anythingEnabled(active, settings) || !host.isActive(view)) {
			view.dom.classList.remove("pp-ooze");
			this.findings = [];
			this.apply(Decoration.none, "");
			host.reportReadability(view, { paragraph: null, note: null });
			return;
		}

		const doc = view.state.doc;
		const paragraphs = this.prepare(doc, applyExclusions(paragraphsAround(doc, view.visibleRanges), excludedFor(doc)));
		try {
			if (!(await this.ensure(paragraphs, requestId))) return;
		} catch (error) {
			host.reportError(error instanceof Error ? error : new Error(String(error)));
			return;
		}
		if (view.state.doc !== doc) {
			this.schedule(0);
			return;
		}

		const head = view.state.selection.main.head;
		const cursorParagraph = paragraphs.find((p) => head >= p.from && head <= p.from + p.text.length) ?? null;
		let wordFrom = -1;
		let wordTo = -1;
		if (this.suppressCursorWord) {
			const line = doc.lineAt(head);
			const before = /[\p{L}\p{N}'’-]*$/u.exec(line.text.slice(0, head - line.from))?.[0] ?? "";
			const after = /^[\p{L}\p{N}'’-]*/u.exec(line.text.slice(head - line.from))?.[0] ?? "";
			wordFrom = head - before.length;
			wordTo = head + after.length;
		}

		const options = { pos: active.pos, checks: active.checks, echoWindow: settings.echoWindow };
		const ranges: DecorationRange<Decoration>[] = [];
		const signature: string[] = [];
		const findings: Finding[] = [];
		for (const p of paragraphs) {
			const result = host.cache.get(this.keyOf(p));
			if (!result) continue;
			const end = p.from + p.text.length;
			if (active.rhythm && (settings.rhythm.scope === "visible" || p === cursorParagraph)) {
				for (const s of result.sentences) {
					const cls = `pp-rhythm pp-rhythm-${rhythmTier(s.effectiveLength, settings.rhythm.tiers)}`;
					ranges.push(mark(cls).range(p.from + s.from, p.from + s.to));
					signature.push(`${p.from + s.from}:${p.from + s.to}:${cls}`);
				}
			}
			const suppressed = suppressedIn(p.text);
			const terms = host.worldTerms();
			for (const h of filterHighlights(result.highlights, options)) {
				if ("check" in h.kind && suppressed.has(kindSlug(h.kind.check))) continue;
				if (terms.size && "check" in h.kind && (h.kind.check === "echo" || h.kind.check === "metaphor") && mentionsTerm(p.text.slice(h.from, h.to), terms)) continue;
				const from = p.from + h.from;
				const to = p.from + h.to;
				if (from < wordTo && to > wordFrom) continue;
				ranges.push(mark(classFor(h)).range(from, to));
				signature.push(`${from}:${to}:${classFor(h)}`);
				findings.push({ from, to, highlight: h, paragraphEnd: end });
			}
		}
		this.findings = findings;
		this.apply(Decoration.set(ranges, true), signature.sort().join("|"));

		if (settings.readabilityStatus) {
			const paragraphResult = cursorParagraph ? host.cache.get(this.keyOf(cursorParagraph)) : undefined;
			host.reportReadability(view, {
				paragraph: paragraphResult ? report(paragraphResult.stats) : null,
				note: this.noteReportDoc === doc ? this.noteReport : null,
			});
			if (this.noteReportDoc !== doc) this.scheduleNotePass();
		} else {
			host.reportReadability(view, { paragraph: null, note: null });
		}
	}

	/** Whole-note readability: analyse every paragraph once (cached), then sum. */
	private scheduleNotePass(): void {
		if (this.noteTimer !== null) window.clearTimeout(this.noteTimer);
		this.noteTimer = window.setTimeout(async () => {
			if (this.destroyed) return;
			const doc = this.view.state.doc;
			const requestId = this.requestId;
			const paragraphs = this.prepare(doc, allParagraphs(doc));
			try {
				if (!(await this.ensure(paragraphs, requestId))) return;
			} catch (error) {
				this.host.reportError(error instanceof Error ? error : new Error(String(error)));
				return;
			}
			if (this.view.state.doc !== doc) return;
			const results = paragraphs.map((p) => this.host.cache.get(this.keyOf(p))).filter((r): r is ParagraphResult => r !== undefined);
			this.noteReport = report(combine(results.map((r) => r.stats)));
			this.noteReportDoc = doc;
			this.schedule(0);
		}, NOTE_PASS_DELAY);
	}

	/** Draw, unless the result is identical to what is already on screen. */
	private apply(decorations: DecorationSet, signature: string): void {
		if (this.destroyed || signature === this.drawn) return;
		this.drawn = signature;
		debug("drawing", signature ? signature.split("|").length : 0, "highlights");
		this.view.dispatch({ effects: setHighlights.of(decorations) });
	}
}

/** Plain DOM (no Obsidian helpers), so the hover card also works in the dev harness. */
function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
	const node = parent.appendChild(document.createElement(tag));
	if (cls) node.className = cls;
	if (text !== undefined) node.textContent = text;
	return node;
}

/** The collapsed "How to approach this" drawer: static, hand-written guidance (see guides.ts). */
function guideDrawer(h: Highlight): HTMLElement | null {
	if (!("check" in h.kind)) return null;
	const guide = GUIDES[(h.guide ?? h.kind.check) as GuideKey] ?? GUIDES[h.kind.check];
	if (!guide) return null;
	const details = document.createElement("details");
	details.className = "pp-guide";
	el(details, "summary", undefined, "How to approach this");
	el(details, "p", "pp-guide-principle", guide.principle);
	const list = el(details, "ul", "pp-guide-examples");
	for (const [before, after] of guide.examples) {
		const li = el(list, "li");
		el(li, "span", "pp-guide-before", before);
		li.append(" → ");
		el(li, "span", "pp-guide-after", after);
	}
	el(details, "p", "pp-guide-keep", `Keep it: ${guide.keep}`);
	return details;
}

function tooltipFor(view: EditorView, findings: Finding[], showGuides: boolean): HTMLElement {
	const dom = document.createElement("div");
	dom.className = "pp-tooltip";
	for (const f of findings) {
		const item = dom.appendChild(document.createElement("div"));
		item.className = "pp-tooltip-item";
		const h = f.highlight;
		const title = item.appendChild(document.createElement("div"));
		title.className = "pp-tooltip-title";
		title.textContent = "pos" in h.kind ? POS_LABELS[h.kind.pos] : CHECK_INFO[h.kind.check].name;
		if (h.note) {
			const note = item.appendChild(document.createElement("div"));
			note.className = "pp-tooltip-note";
			note.textContent = h.note;
		}
		if (showGuides) {
			const drawer = guideDrawer(h);
			if (drawer) item.appendChild(drawer);
		}
		if ("check" in h.kind) {
			const kind = h.kind.check;
			const button = item.appendChild(document.createElement("button"));
			button.className = "pp-tooltip-action";
			button.textContent = `Not ${CHECK_INFO[kind].short} here`;
			button.title = `Adds a hidden %% not ${kindSlug(kind)} %% comment to this paragraph`;
			button.onclick = (e) => {
				e.preventDefault();
				view.dispatch({ changes: { from: f.paragraphEnd, insert: ` %% not ${kindSlug(kind)} %%` } });
				view.focus();
			};
		}
	}
	return dom;
}

export function createHighlighter(host: HighlighterHost): { extension: Extension; plugin: ViewPlugin<HighlightRunner> } {
	const plugin = ViewPlugin.define((view) => new HighlightRunner(view, host));
	const tooltip = hoverTooltip((view, pos) => {
		const findings = view.plugin(plugin)?.findingsAt(pos) ?? [];
		if (findings.length === 0) return null;
		return {
			pos: Math.min(...findings.map((f) => f.from)),
			end: Math.max(...findings.map((f) => f.to)),
			above: true,
			create: () => ({ dom: tooltipFor(view, findings, host.settings.guidance !== "hidden") }),
		};
	});
	return { extension: [highlightField, plugin, tooltip], plugin };
}
