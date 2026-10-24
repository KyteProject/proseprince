import type { EditorView } from "@codemirror/view";
import { adjectivesFor, definitionOf, meansLike, moreSpecificThan, nearRhymesOf, nounsFor, rhymesOf, synonymsOf } from "./datamuse";
import { canInflect, detectForm, matchCase, replacementFor } from "./inflect";
import { POS_NAMES, rankSuggestions, sensesFor, type Suggestion, uposToWordPos } from "./rank";
import { LookupError, type LookupService } from "./service";
import { plainWords } from "./suggest";
import type { Candidate, DatamuseParams, WordInfo, WordPos } from "./types";

export interface LookupTarget {
	from: number;
	to: number;
	/** The tagged word, or null for a phrase (or when tagging failed). */
	info: WordInfo | null;
	/** The original text in the editor. */
	text: string;
}

export interface PopoverOptions {
	service: LookupService;
	hideRare: boolean;
	/** Called once per popover, for the lookup history. */
	onLookup?(word: string): void;
	/** Called when the writer replaces the word, for the lookup history. */
	onPick?(from: string, to: string): void;
	/** Temporary diagnostics: each step of opening and closing the card. */
	trace?(step: string): void;
}

const CHIPS = 12;
const DEFS = 3;

/** Plain DOM (no Obsidian helpers), so the popover also works in the dev harness. */
function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
	const node = parent.appendChild(document.createElement(tag));
	if (cls) node.className = cls;
	if (text !== undefined) node.textContent = text;
	return node;
}

let current: (() => void) | null = null;

/**
 * The right-click lookup: definitions, synonyms and more specific words for one word (or phrase),
 * anchored under it. Clicking a word replaces the original in a single undoable edit, keeping its
 * tense, number and capitals.
 */
export function openLookupPopover(view: EditorView, target: LookupTarget, opts: PopoverOptions): () => void {
	current?.();
	const pos = target.info ? uposToWordPos(target.info.upos) : null;
	const isPhrase = !target.info || /\s/.test(target.text.trim());
	const headword = (target.info?.lemma ?? target.text).toLowerCase().trim();

	const dom = document.createElement("div");
	dom.className = "pp-lookup";
	dom.tabIndex = -1;
	dom.setAttribute("role", "dialog");
	dom.setAttribute("aria-label", `Look up "${target.text}"`);
	const header = el(dom, "div", "pp-lookup-header");
	el(header, "span", "pp-lookup-word", target.text);
	const meta = [pos ? POS_NAMES[pos] : "", target.info && headword !== target.text.toLowerCase() ? headword : ""].filter(Boolean).join(" · ");
	if (meta) el(header, "span", "pp-lookup-meta", meta);
	const body = el(dom, "div", "pp-lookup-body");
	const status = el(body, "div", "pp-lookup-status", "Looking up…");
	const footer = el(dom, "div", "pp-lookup-footer");
	const link = el(footer, "a", "pp-lookup-onelook", "Open in OneLook ↗");
	link.href = `https://www.onelook.com/thesaurus/?s=${encodeURIComponent(headword)}`;
	link.target = "_blank";
	link.rel = "noopener";
	el(footer, "span", "pp-lookup-source", "Datamuse · definitions from Wiktionary");
	document.body.appendChild(dom);
	place(view, dom, target.from);
	dom.focus({ preventScroll: true });

	const close = (why: string) => {
		opts.trace?.(`closed: ${why}`);
		if (current === closeAny) current = null;
		dom.remove();
		if (frame) cancelAnimationFrame(frame);
		document.removeEventListener("mousedown", outside, true);
		view.scrollDOM.removeEventListener("scroll", onScroll);
		window.removeEventListener("resize", onResize);
	};
	const closeAny = () => close("replaced by another card");
	// Obsidian scrolls the cursor into view as the right-click menu closes, so a scroll alone mustn't
	// close the card: it follows the word, and closes only once the word has scrolled out of sight.
	let frame = 0;
	const onScroll = () => {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			if (!dom.isConnected) return;
			if (visible(view, target.from)) place(view, dom, target.from);
			else close("word scrolled out of view");
		});
	};
	const onResize = () => close("window resized");
	const outside = (e: MouseEvent) => {
		if (!dom.contains(e.target as Node)) close("click outside");
	};
	document.addEventListener("mousedown", outside, true);
	view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", onResize);
	dom.addEventListener("keydown", (e) => keys(e, dom, () => {
		close("Escape");
		view.focus();
	}));
	current = closeAny;
	const rect = dom.getBoundingClientRect();
	opts.trace?.(`card open at ${Math.round(rect.left)},${Math.round(rect.top)} (${Math.round(rect.width)}×${Math.round(rect.height)}), window ${window.innerWidth}×${window.innerHeight}`);

	const shown = (s: Suggestion) => (target.info && !isPhrase ? replacementFor(target.info, pos, s.word) : matchCase(target.text, s.word));
	const pick = (s: Suggestion) => {
		if (view.state.sliceDoc(target.from, target.to) !== target.text) {
			status.textContent = "The text has changed since the lookup. Look it up again.";
			status.hidden = false;
			return;
		}
		const insert = shown(s);
		view.dispatch({
			changes: { from: target.from, to: target.to, insert },
			selection: { anchor: target.from + insert.length },
			userEvent: "input.replace",
		});
		opts.onPick?.(target.text, insert);
		close("picked a word");
		view.focus();
	};

	opts.onLookup?.(headword);
	void load(opts.service, headword, pos, isPhrase).then(({ defs, synonyms, specific, pairs, error }) => {
		if (!dom.isConnected) return;
		status.hidden = true;
		if (defs.length) definitions(body, defs, pos);
		const exclude = [headword, target.text.toLowerCase()];
		const form = target.info && !isPhrase ? detectForm(target.info, pos) : "base";
		const rank = (list: Candidate[], without: string[]) =>
			rankSuggestions(list, { pos, exclude: without, hideRare: opts.hideRare, limit: CHIPS * 2 }).filter((s) => canInflect(s.word, form)).slice(0, CHIPS);
		const syn = rank(synonyms, exclude);
		chips(body, isPhrase ? "Other ways to say it" : "Synonyms", syn, shown, pick);
		chips(body, "More specific", rank(specific, [...exclude, ...syn.map((s) => s.word)]), shown, pick);
		const usual = plainWords(pairs, 15);
		if (usual.length) words(body, pos === "n" ? "Usually described as" : "Usually describes", usual);
		if (!isPhrase) sound(body, opts.service, headword);
		if (!body.querySelector(".pp-lookup-section:not(.pp-lookup-sound)")) {
			status.hidden = false;
			status.textContent = error ?? `Nothing found for "${headword}"${pos ? ` as a ${POS_NAMES[pos]}` : ""}.`;
		}
		place(view, dom, target.from);
		(dom.querySelector(".pp-chip") as HTMLElement | null)?.focus({ preventScroll: true });
	});
	return closeAny;
}

interface Loaded {
	defs: Candidate["defs"];
	synonyms: Candidate[];
	specific: Candidate[];
	/** Adjectives usual with a noun, or nouns usual with an adjective. */
	pairs: Candidate[];
	error: string | null;
}

/** Three requests at most (one more when synonyms are thin), each served from the cache when possible. */
async function load(service: LookupService, headword: string, pos: WordPos | null, isPhrase: boolean): Promise<Loaded> {
	let error: string | null = null;
	const get = async (params: DatamuseParams): Promise<Candidate[]> => {
		try {
			return await service.get(params);
		} catch (e) {
			error ??= e instanceof LookupError ? e.message : "Lookup failed";
			return [];
		}
	};
	if (isPhrase) return { defs: [], synonyms: await get(meansLike(headword)), specific: [], pairs: [], error };
	const pairQuery = pos === "n" ? adjectivesFor(headword) : pos === "adj" ? nounsFor(headword) : null;
	const [define, synonyms, specific, pairs] = await Promise.all([
		get(definitionOf(headword)),
		get(synonymsOf(headword)),
		get(moreSpecificThan(headword)),
		pairQuery ? get(pairQuery) : Promise.resolve([]),
	]);
	const entry = define.find((c) => c.word.toLowerCase() === headword);
	let syn = synonyms;
	// rel_syn is sparse for some words; "means like" fills the gap.
	if (rankSuggestions(syn, { pos, exclude: [headword], hideRare: false, limit: 3 }).length < 3) syn = [...syn, ...(await get(meansLike(headword)))];
	return { defs: entry?.defs ?? [], synonyms: syn, specific, pairs, error };
}

/** A labelled line of plain words: context, not replacements. */
function words(body: HTMLElement, label: string, list: string[]): HTMLElement {
	const section = el(body, "div", "pp-lookup-section");
	el(section, "div", "pp-lookup-label", label);
	const row = el(section, "div", "pp-pairings");
	for (const w of list) el(row, "span", "pp-pairing", w);
	return section;
}

/** Rhymes and near rhymes, fetched only when opened: for hearing a sentence, or catching an accidental jingle. */
function sound(body: HTMLElement, service: LookupService, word: string): void {
	const details = el(body, "details", "pp-lookup-section pp-lookup-sound");
	el(details, "summary", "pp-lookup-label", "Sound");
	let loaded = false;
	details.addEventListener("toggle", () => {
		if (!details.open || loaded) return;
		loaded = true;
		const status = el(details, "div", "pp-lookup-status", "Looking up…");
		void Promise.all([service.get(rhymesOf(word)), service.get(nearRhymesOf(word))])
			.then(([rhymes, near]) => {
				status.remove();
				const r = plainWords(rhymes, 15);
				const n = plainWords(near, 15).filter((w) => !r.includes(w));
				if (r.length) words(details, "Rhymes", r);
				if (n.length) words(details, "Near rhymes", n);
				if (!r.length && !n.length) el(details, "div", "pp-lookup-status", "No rhymes found.");
			})
			.catch((e: unknown) => {
				status.textContent = e instanceof LookupError ? e.message : "Lookup failed";
			});
	});
}

function definitions(body: HTMLElement, defs: Candidate["defs"], pos: WordPos | null): void {
	const section = el(body, "div", "pp-lookup-section");
	el(section, "div", "pp-lookup-label", "Meaning");
	const list = el(section, "ol", "pp-lookup-defs");
	const ordered = sensesFor(defs, pos);
	ordered.forEach((d, i) => {
		const li = el(list, "li");
		if (d.pos) el(li, "span", "pp-lookup-defpos", `${POS_NAMES[d.pos]} `);
		li.append(d.text);
		if (i >= DEFS) li.hidden = true;
	});
	if (ordered.length > DEFS) {
		const more = el(section, "button", "pp-lookup-more", `${ordered.length - DEFS} more`);
		more.onclick = () => {
			list.querySelectorAll("li").forEach((li) => (li.hidden = false));
			more.remove();
		};
	}
}

/** A labelled row of word buttons; each shows the word as it will read in place and its definition on hover. */
export function chips(body: HTMLElement, label: string, list: Suggestion[], shown: (s: Suggestion) => string, pick: (s: Suggestion) => void): HTMLElement | null {
	if (!list.length) return null;
	const section = el(body, "div", "pp-lookup-section");
	el(section, "div", "pp-lookup-label", label);
	const row = el(section, "div", "pp-chips");
	for (const s of list) {
		const text = shown(s);
		const chip = el(row, "button", `pp-chip${s.rare ? " pp-chip-rare" : ""}`, text);
		// One tooltip: Obsidian draws aria-label as its own tooltip, so no `title` as well.
		const hint = [s.def, s.rare ? "Rare: few readers will know it." : ""].filter(Boolean).join("\n\n");
		chip.setAttribute("aria-label", hint || `Replace with ${text}`);
		// mousedown would move the editor's selection before the click lands.
		chip.onmousedown = (e) => e.preventDefault();
		chip.onclick = () => pick(s);
	}
	return section;
}

/** Arrow keys move between chips; Escape closes and returns to the editor. */
function keys(e: KeyboardEvent, dom: HTMLElement, close: () => void): void {
	if (e.key === "Escape") {
		e.preventDefault();
		close();
		return;
	}
	const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
	if (!step) return;
	const items = [...dom.querySelectorAll<HTMLElement>(".pp-chip")];
	if (!items.length) return;
	e.preventDefault();
	const i = items.indexOf(document.activeElement as HTMLElement);
	items[(i + step + items.length) % items.length]?.focus();
}

/** Whether the word at `at` is inside the editor's visible area. */
function visible(view: EditorView, at: number): boolean {
	const coords = view.coordsAtPos(at);
	if (!coords) return false;
	const box = view.scrollDOM.getBoundingClientRect();
	return coords.bottom > box.top && coords.top < box.bottom;
}

/** Under the word, or above it when there isn't room below; kept inside the window. */
function place(view: EditorView, dom: HTMLElement, at: number): void {
	const margin = 8;
	const coords = view.coordsAtPos(at) ?? view.scrollDOM.getBoundingClientRect();
	const { width, height } = dom.getBoundingClientRect();
	const left = Math.max(margin, Math.min(coords.left, window.innerWidth - width - margin));
	const below = coords.bottom + 4;
	const top = below + height > window.innerHeight - margin ? Math.max(margin, coords.top - height - 4) : below;
	dom.style.left = `${left}px`;
	dom.style.top = `${top}px`;
}
