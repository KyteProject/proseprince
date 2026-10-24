import { StateEffect, StateField, type Extension, type Range as DecorationRange, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, hoverTooltip, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { filterHighlights } from "../analysis/filter";
import { excludedBlocks, type Range } from "../analysis/mask";
import { namesIn, namesInText } from "../analysis/names";
import { combine, report, type ReadabilityReport } from "../analysis/readability";
import { attribute, type Attribution, colourSlots, type ParagraphDialogue, pinIn, resetsTurns, speakersIn, UNTAGGED_RUN, untaggedRuns } from "../analysis/dialogue/attribute";
import type { SpeakerKind } from "../analysis/dialogue/speech";
import { rhythmTier } from "../analysis/rhythm";
import { GUIDES, type GuideKey, SUGGESTION_ROWS } from "../analysis/guides";
import { kindSlug, type Highlight, type LookupHint, type Pairing, type ParagraphResult } from "../analysis/types";
import { displayFor, pickEdits, shiftHint } from "../lookup/edit";
import { chips } from "../lookup/popover";
import type { Suggestion } from "../lookup/rank";
import type { HintResult, PairingResult } from "../lookup/suggest";
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
	/** Online words to try for a hover card. Absent, or null, when lookups are off. */
	suggest?(hint: LookupHint): Promise<HintResult> | null;
	/** A word picked from a hover card, for the lookup history. */
	recordPick?(original: string, chosen: string, source: string): void;
	/** The speaker a name or alias belongs to ("Effie" → "Eufemie"), from the World note and character notes. */
	canonicalSpeaker?(name: string): string;
	/** A colour set by hand for a speaker (`colour:` on their character note), as CSS. */
	speakerColour?(name: string): string | undefined;
	/** Whether a modifier + noun pairing is a usual one, for a hover card. Absent, or null, when lookups are off. */
	pairings?(pairing: Pairing): Promise<PairingResult> | null;
}

/** Only look words up once a card has stayed open this long, so passing the mouse over costs nothing. */
const SUGGEST_DELAY = 400;

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

/** A line of speech or thought under the Dialogue lens, for the speaker card. */
interface SpeechFinding {
	from: number;
	to: number;
	attribution: Attribution;
	colour: string | null;
	/** Document offset and text of the line (the dialogue unit), for pins. */
	paragraphFrom: number;
	paragraphText: string;
}

/** Checks about dialogue itself stay visible inside speech when other highlights are hidden there. */
const DIALOGUE_CHECKS = new Set(["dialoguePunct", "tagAdverb", "nonSpeechTag", "showyTag", "invertedTag", "twoSpeakers", "untaggedRun", "quotedThought"]);

/** A line of a paragraph: the unit of dialogue, since writers often give each speaker a line of their own. */
interface Unit {
	paragraph: Prepared;
	/** Paragraph offset of the line. */
	from: number;
	text: string;
}

/** The whole note's dialogue, attributed: what the Dialogue lens and the untagged-run check share. */
interface NoteDialogue {
	units: Unit[];
	attributed: Attribution[][];
	/** Highlights that need the whole conversation (untagged runs), by paragraph start. */
	extra: Map<number, Highlight[]>;
}

const speechMarks = new Map<string, Decoration>();
function speechMark(className: string, colour: string | null): Decoration {
	const key = `${className}|${colour ?? ""}`;
	let m = speechMarks.get(key);
	if (!m) speechMarks.set(key, (m = Decoration.mark({ class: className, ...(colour ? { attributes: { style: `--pp-speaker: ${colour}` } } : {}) })));
	return m;
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
	return Object.values(e.pos).some(Boolean) || Object.values(e.checks).some(Boolean) || e.rhythm || e.dialogue || s.readabilityStatus;
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
	private speech: SpeechFinding[] = [];
	/** The note's speakers and their colours, in order of first appearance. */
	speakers: { name: string; colour: string }[] = [];
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

	/** Speech under the Dialogue lens covering a document position. */
	speechAt(pos: number): SpeechFinding[] {
		return this.speech.filter((s) => s.from <= pos && s.to >= pos);
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
		const noteDialogue = active.dialogue || active.checks.untaggedRun ? this.attributeNote(doc) : null;
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
			// Characters don't talk like Le Guin: unless asked, leave their lines alone.
			const quiet = settings.dialogue.highlightsInDialogue ? [] : (result.dialogue?.flatMap((l) => l.spans) ?? []);
			const own = noteDialogue?.extra.get(p.from);
			for (const h of filterHighlights(own ? [...result.highlights, ...own] : result.highlights, options)) {
				if ("check" in h.kind && suppressed.has(kindSlug(h.kind.check))) continue;
				if (quiet.length && !("check" in h.kind && DIALOGUE_CHECKS.has(h.kind.check)) && quiet.some((s) => h.from >= s.from && h.to <= s.to)) continue;
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
		this.speech = active.dialogue && noteDialogue ? this.drawDialogue(noteDialogue, paragraphs, ranges, signature) : [];
		if (!active.dialogue) this.speakers = [];
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
			// Turn-taking needs the paragraphs before the screen too.
			if (noteDialogue && this.noteReportDoc !== doc) this.scheduleNotePass();
		}
	}

	/**
	 * The Dialogue lens: attribute every line in the note (from cached paragraph results, so this is
	 * cheap), then underline the visible ones in their speakers' colours and fade the narration.
	 */
	private attributeNote(doc: Text): NoteDialogue {
		const { host } = this;
		const all = this.prepare(doc, allParagraphs(doc));
		// Names and described speakers both go through the cast: "- Shaddid | the captain" makes them one.
		const canonical = (name: string, kind: SpeakerKind) => (kind === "pronoun" ? name : (host.canonicalSpeaker?.(name) ?? name));
		const units: Unit[] = [];
		const items: ParagraphDialogue[] = [];
		for (const p of all) {
			const lines = host.cache.get(this.keyOf(p))?.dialogue;
			if (!lines) {
				units.push({ paragraph: p, from: 0, text: p.text });
				items.push({ text: p.text, info: null });
				continue;
			}
			for (const line of lines) {
				const text = p.text.slice(line.from, line.to);
				units.push({ paragraph: p, from: line.from, text });
				items.push({ text, info: line });
			}
		}
		const attributed = attribute(items, canonical);
		const extra = new Map<number, Highlight[]>();
		for (const [i, a] of untaggedRuns(attributed, items)) {
			const from = units[i]!.paragraph.from;
			const list = extra.get(from) ?? [];
			list.push({ from: a.from, to: a.to, kind: { check: "untaggedRun" }, note: `${UNTAGGED_RUN} lines in a row with no tag or beat: a reader may be counting back to see who's speaking. A tag or beat here would re-anchor them.` });
			extra.set(from, list);
		}
		return { units, attributed, extra };
	}

	private drawDialogue({ units, attributed }: NoteDialogue, visible: Prepared[], ranges: DecorationRange<Decoration>[], signature: string[]): SpeechFinding[] {
		const { host } = this;
		const slots = colourSlots(speakersIn(attributed));
		const colourOf = (name: string) => host.speakerColour?.(name) ?? `var(--pp-speaker-${slots.get(name) ?? 0})`;
		this.speakers = [...slots.keys()].map((name) => ({ name, colour: colourOf(name) }));
		const shown = new Set(visible.map((p) => p.from));
		const dim = host.settings.dialogue.dimNarration;
		const out: SpeechFinding[] = [];
		const push = (cls: string, colour: string | null, from: number, to: number) => {
			if (to <= from) return;
			ranges.push(speechMark(cls, colour).range(from, to));
			signature.push(`${from}:${to}:${cls}:${colour ?? ""}`);
		};
		units.forEach((u, i) => {
			const p = u.paragraph;
			if (!shown.has(p.from)) return;
			let at = u.from;
			for (const a of attributed[i] ?? []) {
				const certain = a.speaker !== null && a.certain && !a.thought;
				const colour = certain ? colourOf(a.speaker!) : null;
				const cls = a.thought ? "pp-thought" : certain ? "pp-speech" : "pp-speech pp-speech-guess";
				if (dim) this.dimText(p, at, a.from, push);
				push(cls, colour, p.from + a.from, p.from + a.to);
				out.push({ from: p.from + a.from, to: p.from + a.to, attribution: a, colour: a.speaker ? colourOf(a.speaker) : null, paragraphFrom: p.from + u.from, paragraphText: u.text });
				at = a.to;
			}
			if (dim && !resetsTurns(u.text)) this.dimText(p, at, u.from + u.text.length, push);
		});
		return out;
	}

	/** Fade a stretch of narration, skipping the spaces at its edges. */
	private dimText(p: Prepared, from: number, to: number, push: (cls: string, colour: string | null, from: number, to: number) => void): void {
		const slice = p.text.slice(from, to);
		const start = from + (slice.length - slice.trimStart().length);
		const end = to - (slice.length - slice.trimEnd().length);
		push("pp-narration", null, p.from + start, p.from + end);
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

/**
 * "One verb instead: strolled · sauntered", filled in after the card has stayed open a moment.
 * Picking a word replaces the finding (and its partner word) in one undoable edit.
 */
function suggestionRow(view: EditorView, host: HighlighterHost, f: Finding): HTMLElement | null {
	const h = f.highlight;
	const row = "check" in h.kind ? SUGGESTION_ROWS[h.kind.check] : undefined;
	if (!h.lookup || !row || !host.suggest) return null;
	const kind = (h.kind as { check: string }).check;
	const hint = shiftHint(h.lookup, f.from - h.from);
	const box = document.createElement("div");
	box.className = "pp-suggest";
	window.setTimeout(() => {
		if (!box.isConnected) return;
		const pending = host.suggest?.(h.lookup!);
		if (!pending) return box.remove();
		void pending.then(({ suggestions, kinds, error }) => {
			if (!box.isConnected) return;
			const slice = (a: number, b: number) => view.state.sliceDoc(a, b);
			const pick = (s: Suggestion) => {
				const edits = pickEdits(hint, s.word, slice);
				if (!edits) {
					status.textContent = "The text has changed. Hover again for fresh suggestions.";
					return;
				}
				const original = slice(Math.min(hint.replace.from, hint.remove?.from ?? Infinity), Math.max(hint.replace.to, hint.remove?.to ?? -Infinity));
				const replaced = edits.find((e) => e.from === hint.replace.from)?.insert ?? s.word;
				view.dispatch({ changes: edits, userEvent: "input.replace" });
				host.recordPick?.(original, replaced, kind);
				view.focus();
			};
			const shown = (s: Suggestion) => displayFor(hint, s.word, slice);
			const sections = [
				chips(box, row.label, suggestions, shown, pick),
				chips(box, `Other ways to ${hint.head.lemma.toLowerCase()}`, kinds, shown, pick),
			].filter((s): s is HTMLElement => s !== null);
			const status = el(box, "div", "pp-suggest-status", sections.length ? "" : error ?? "");
			if (!sections.length && !error) return box.remove();
			if (sections.length) el(sections[sections.length - 1]!, "div", "pp-suggest-reminder", row.reminder);
		});
	}, SUGGEST_DELAY);
	return box;
}

const PAIRINGS_SHOWN = 12;

/** "Usual words for 'silence': long, dead, complete…", with the writer's own marked, and what that means for the reader. */
function pairingRow(host: HighlighterHost, h: Highlight): HTMLElement | null {
	const pairing = h.pairing;
	if (!pairing || !host.pairings) return null;
	const box = document.createElement("div");
	box.className = "pp-suggest";
	window.setTimeout(() => {
		if (!box.isConnected) return;
		const pending = host.pairings?.(pairing);
		if (!pending) return box.remove();
		void pending.then(({ usual, yours, error }) => {
			if (!box.isConnected) return;
			if (!usual.length) {
				if (error) el(box, "div", "pp-suggest-status", error);
				else box.remove();
				return;
			}
			const section = el(box, "div", "pp-lookup-section");
			el(section, "div", "pp-lookup-label", `Usual words for "${pairing.noun}"`);
			const row = el(section, "div", "pp-pairings");
			const shown = [...usual.slice(0, PAIRINGS_SHOWN), ...yours.filter((y) => !usual.slice(0, PAIRINGS_SHOWN).includes(y))];
			for (const word of shown) el(row, "span", yours.includes(word) ? "pp-pairing pp-pairing-yours" : "pp-pairing", word);
			const quoted = (words: string[]) => words.map((w) => `"${w}"`).join(" and ");
			el(section, "div", "pp-suggest-reminder", yours.length
				? `${quoted(yours)} ${yours.length === 1 ? "is" : "are"} among the usual words for "${pairing.noun}", so readers will glide past ${yours.length === 1 ? "it" : "them"}. Fine for background; where the moment matters, look for the less expected word.`
				: `None of yours is among the usual words for "${pairing.noun}", so the pairing will be noticed. Make sure it earns that.`);
		});
	}, SUGGEST_DELAY);
	return box;
}

function tooltipFor(view: EditorView, findings: Finding[], showGuides: boolean, host: HighlighterHost): HTMLElement {
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
		const suggestions = suggestionRow(view, host, f) ?? pairingRow(host, h);
		if (suggestions) item.appendChild(suggestions);
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

const HOW_LABEL: Record<string, string> = {
	pin: "your pin",
	tag: "dialogue tag",
	beat: "action beat",
	turns: "turn-taking",
	pronoun: "pronoun tag and turn-taking",
};

const PIN_COMMENT = /\s?%%\s*speaker\s*:?\s*[^%\n]+?\s*%%/i;

/**
 * Who says this line, and why: "Linh · dialogue tag", or a guess with its reason. Chips pin a
 * speaker with a hidden `%% speaker: Name %%` comment; "Not speech" marks quotes that aren't dialogue.
 */
function speakerCard(view: EditorView, speakers: { name: string; colour: string }[], s: SpeechFinding): HTMLElement {
	const a = s.attribution;
	const item = document.createElement("div");
	item.className = "pp-tooltip-item";
	const head = el(item, "div", "pp-tooltip-title pp-speaker-head");
	const certain = a.speaker !== null && a.certain;
	const dot = el(head, "span", `pp-speaker-dot${certain ? "" : " pp-guess"}`);
	if (certain && s.colour) dot.style.setProperty("--pp-speaker", s.colour);
	if (a.thought) head.append("Thought");
	else if (certain) head.append(`${a.speaker} · ${HOW_LABEL[a.how ?? ""] ?? ""}`);
	else head.append(a.speaker ? `Speaker not certain · guess: ${a.speaker}` : "Speaker not found");
	if (a.thought) {
		el(item, "div", "pp-tooltip-note", "Direct thought: italics or a thought verb. Not part of the turn-taking.");
		return item;
	}
	if (!certain) {
		el(item, "div", "pp-tooltip-note", a.speaker
			? `From ${HOW_LABEL[a.how ?? ""] ?? "context"}. If a reader could hesitate here too, a tag or a beat would settle it.`
			: "No tag, beat or turn-taking points to anyone. A reader may be guessing too.");
	}

	const paragraphEnd = s.paragraphFrom + s.paragraphText.length;
	const pinned = pinIn(s.paragraphText);
	const setPin = (name: string | null) => {
		const existing = PIN_COMMENT.exec(s.paragraphText);
		const insert = name ? ` %% speaker: ${name} %%` : "";
		const changes = existing
			? { from: s.paragraphFrom + existing.index, to: s.paragraphFrom + existing.index + existing[0].length, insert }
			: { from: paragraphEnd, insert };
		view.dispatch({ changes });
		view.focus();
	};
	if (speakers.length) {
		el(item, "div", "pp-lookup-label", pinned ? "Pinned. Change it:" : "Who says it? Pin a speaker:");
		const row = el(item, "div", "pp-chips");
		for (const sp of speakers) {
			const chip = el(row, "button", "pp-chip pp-speaker-chip");
			const chipDot = el(chip, "span", "pp-speaker-dot");
			chipDot.style.setProperty("--pp-speaker", sp.colour);
			chip.append(sp.name);
			chip.onmousedown = (e) => e.preventDefault();
			chip.onclick = () => setPin(sp.name);
		}
	}
	const actions = el(item, "div", "pp-chips");
	if (pinned) {
		const unpin = el(actions, "button", "pp-tooltip-action", "Unpin");
		unpin.onclick = () => setPin(null);
	}
	const notSpeech = el(actions, "button", "pp-tooltip-action", "Not speech");
	notSpeech.title = "Adds a hidden %% not speech %% comment: the quotes in this paragraph aren't dialogue";
	notSpeech.onclick = () => {
		view.dispatch({ changes: { from: paragraphEnd, insert: " %% not speech %%" } });
		view.focus();
	};
	return item;
}

export function createHighlighter(host: HighlighterHost): { extension: Extension; plugin: ViewPlugin<HighlightRunner> } {
	const plugin = ViewPlugin.define((view) => new HighlightRunner(view, host));
	const tooltip = hoverTooltip((view, pos) => {
		const runner = view.plugin(plugin);
		const findings = runner?.findingsAt(pos) ?? [];
		const speech = runner?.speechAt(pos) ?? [];
		if (findings.length === 0 && speech.length === 0) return null;
		const spans = [...findings, ...speech];
		return {
			pos: Math.min(...spans.map((f) => f.from)),
			end: Math.max(...spans.map((f) => f.to)),
			above: true,
			create: () => {
				const dom = tooltipFor(view, findings, host.settings.guidance !== "hidden", host);
				if (speech[0]) dom.prepend(speakerCard(view, runner?.speakers ?? [], speech[0]));
				return { dom };
			},
		};
	}, { hideOnChange: true });
	return { extension: [highlightField, plugin, tooltip], plugin };
}
