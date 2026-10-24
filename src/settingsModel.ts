import { CHECK_KINDS, type CheckKind, POS_CATEGORIES, type PosCategory } from "./analysis/types";

export type LensId = "style" | "king" | "leguin" | "pos" | "rhythm" | "dialogue";

/** Where the World note lives by default: an underscore folder, sorted with _archive and _templates. */
export const WORLD_NOTE_DEFAULT = "_proseprince/World.md";
export type RhythmScope = "paragraph" | "visible";

/** Explicit on/off choices that win over the lenses. Missing keys follow the lenses. */
export interface Overrides {
	pos: Partial<Record<PosCategory, boolean>>;
	checks: Partial<Record<CheckKind, boolean>>;
	ooze?: boolean;
	rhythm?: boolean;
}

export interface ProsePrinceSettings {
	enabled: boolean;
	/** Lenses stack: every lens switched on adds its highlights. */
	lenses: Partial<Record<LensId, boolean>>;
	overrides: Overrides;
	rhythm: { scope: RhythmScope; tiers: number };
	readabilityStatus: boolean;
	/** The hover card's "How to approach this" drawer: closed until clicked, or not shown at all. */
	guidance: "collapsed" | "hidden";
	echoWindow: number;
	debounceMs: number;
	/** Vault path of the story's World note (names, places, terms). */
	worldNote: string;
	/** Optional folder of character notes; notes with `type: character` are always included. */
	characterFolder: string;
	/** Folders where ProsePrince runs. Empty means every note. Frontmatter `proseprince: true|false` wins. */
	folders: string[];
	/** Optional online word lookups (Datamuse). Off unless the writer switches them on. */
	lookup: LookupSettings;
	dialogue: DialogueSettings;
	/** The sidebar counts every check, not just what the lenses show. */
	outlineAllChecks: boolean;
}

export interface DialogueSettings {
	/** With the Dialogue lens on, fade everything that isn't speech. */
	dimNarration: boolean;
	/**
	 * Craft and part-of-speech highlights inside quoted speech. Off: characters don't talk like Le
	 * Guin, so their lines are left alone (dialogue checks still show). Applies with or without the lens.
	 */
	highlightsInDialogue: boolean;
}

export interface LookupSettings {
	enabled: boolean;
	/** Datamuse requires a key from 1 February 2027. */
	apiKey: string;
	/** "Words to try" in hover cards for adverbs, qualifiers, nominalisations and echoes. */
	hoverCards: boolean;
	/** Right-click "Look up" and its command. */
	rightClick: boolean;
	hideRare: boolean;
	/** Keep a per-vault record of lookups and replacements, shown on the settings page. */
	history: boolean;
}

/** What is actually highlighted: the union of the active lenses, then the overrides. */
export interface Effective {
	pos: Record<PosCategory, boolean>;
	checks: Record<CheckKind, boolean>;
	oozeMode: boolean;
	rhythm: boolean;
	/** Speakers underlined in their colours (the Dialogue lens). */
	dialogue: boolean;
}

const allOff = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, false])) as Record<K, boolean>;

export const POS_LABELS: Record<PosCategory, string> = {
	ADJ: "Adjectives",
	ADV: "Adverbs",
	NOUN: "Nouns",
	PROPN: "Proper nouns",
	PRON: "Pronouns",
	NUM: "Numerals",
	VERB: "Verbs",
	AUX: "Auxiliary verbs (is, was, have, will…)",
	CONJ: "Conjunctions",
};

export type CheckGroup = "Word choice" | "Viewpoint and voice" | "Sentences" | "Modifiers" | "Repetition and imagery" | "Dialogue";

export const CHECK_INFO: Record<CheckKind, { name: string; desc: string; group: CheckGroup; short: string }> = {
	cliche: { group: "Word choice", short: "a cliché", name: "Clichés", desc: "About 1,600 worn phrases, matched in any tense: \"bit the bullet\", \"heart skipped a beat\"." },
	redundancy: { group: "Word choice", short: "a redundancy", name: "Redundancies", desc: "Phrases that say the same thing twice; only the words to cut are marked: free gift, shrugged his shoulders." },
	filler: { group: "Word choice", short: "filler", name: "Filler words", desc: "Words that add nothing in narration: actually, basically, just, literally, of course." },
	qualifier: { group: "Word choice", short: "a qualifier", name: "Qualifiers", desc: "Softeners and intensifiers: very, rather, quite, a little, kind of." },
	weasel: { group: "Word choice", short: "weasel words", name: "Weasel words", desc: "Vague quantities and claims where a specific would land: a lot, various, somehow, for some reason." },
	hedge: { group: "Word choice", short: "a hedge", name: "Hedges", desc: "Uncertainty in the narration: perhaps, seemed, might have, a kind of." },
	filterWord: { group: "Viewpoint and voice", short: "a filter word", name: "Filter words", desc: "Perception and thought verbs that put the reader behind the character's senses: she saw, he felt, could hear." },
	passive: { group: "Viewpoint and voice", short: "a passive", name: "Passive voice", desc: "\"The letter was sent\": who sent it? States like \"was tired\" are left alone." },
	adverb: { group: "Viewpoint and voice", short: "an adverb", name: "Manner adverbs", desc: "-ly adverbs a stronger verb could replace. Stance words like \"suddenly\" are left alone." },
	tagAdverb: { group: "Viewpoint and voice", short: "a dialogue-tag adverb", name: "Dialogue-tag adverbs", desc: "\"she said softly\": let the line carry the softness." },
	weakVerb: { group: "Sentences", short: "a weak verb", name: "Weak verbs", desc: "Long sentences carried only by \"to be\"." },
	nominalization: { group: "Sentences", short: "a nominalisation", name: "Nominalisations", desc: "Actions hidden in nouns: made a decision → decided." },
	opener: { group: "Sentences", short: "a repeated opener", name: "Repeated openers", desc: "Runs of sentences that start with the same word." },
	stackedModifier: { group: "Modifiers", short: "stacked modifiers", name: "Stacked modifiers", desc: "Two or more adjectives on one noun: the silky green liquid." },
	participle: { group: "Modifiers", short: "a verb form as adjective", name: "Verb forms as adjectives", desc: "-ed and -ing forms before a noun: his frayed mind." },
	echo: { group: "Repetition and imagery", short: "an echo", name: "Echoes", desc: "The same word, in any form, repeated within the echo window. Names are ignored." },
	metaphor: { group: "Repetition and imagery", short: "a metaphor", name: "Metaphor candidates", desc: "Dead metaphors, and concrete words on abstract ones (velvet silence) to check for freshness." },
	nonSpeechTag: { group: "Dialogue", short: "a tag that can't speak", name: "Tags that can't speak", desc: "\"Fine,\" she smiled: smiling, laughing, shrugging and nodding don't make words. Make it a beat, or use \"said\"." },
	showyTag: { group: "Dialogue", short: "a showy tag", name: "Showy tags", desc: "hissed, scoffed, exclaimed, retorted: tags that draw the eye. A hint; fine now and then." },
	invertedTag: { group: "Dialogue", short: "an inverted tag", name: "Inverted tags", desc: "\"said Linh\", \"replied his father\", \"said he\": modern fiction puts the speaker first. A long subject may invert." },
	twoSpeakers: { group: "Dialogue", short: "two speakers", name: "Two speakers in a paragraph", desc: "A new speaker starts a new paragraph." },
	untaggedRun: { group: "Dialogue", short: "a long untagged run", name: "Long untagged runs", desc: "Every fifth line in a row with no tag, beat or pin: the place a tag or beat would re-anchor the reader." },
	quotedThought: { group: "Dialogue", short: "quoted thought", name: "Thought conventions", desc: "Direct thought in quote marks, and \"thought to himself\"; thought usually goes in italics." },
	dialoguePunct: { group: "Dialogue", short: "a dialogue punctuation slip", name: "Dialogue punctuation", desc: "Mechanical slips only: a missing comma before a tag (\"…new\" she mused), a full stop or capital where a tag joins its line, ?\". endings, two-dot ellipses, and a speech tag split from its line across paragraphs." },
};

export const CHECK_GROUPS: CheckGroup[] = ["Word choice", "Viewpoint and voice", "Sentences", "Modifiers", "Repetition and imagery", "Dialogue"];

export interface Lens {
	id: LensId;
	name: string;
	/** Lucide icon name, used in the status bar and the lens menu. */
	icon: string;
	credit: string;
	pos: readonly PosCategory[];
	checks: readonly CheckKind[];
	ooze?: boolean;
	rhythm?: boolean;
	dialogue?: boolean;
}

export const LENSES: Lens[] = [
	{
		id: "style",
		name: "Style checks",
		icon: "spell-check",
		credit: "The word-choice, voice and sentence checks.",
		pos: [],
		checks: ["cliche", "redundancy", "filler", "qualifier", "weasel", "hedge", "filterWord", "passive", "adverb", "tagAdverb", "weakVerb", "nominalization", "opener", "echo", "metaphor", "dialoguePunct", "nonSpeechTag", "invertedTag", "twoSpeakers", "quotedThought"],
	},
	{
		id: "king",
		name: "King lens",
		icon: "crown",
		credit: "Inspired by Stephen King's On Writing: adverbs ooze red ink.",
		pos: ["ADV"],
		checks: ["tagAdverb", "passive", "qualifier", "filler", "nonSpeechTag", "showyTag"],
		ooze: true,
	},
	{
		id: "leguin",
		name: "Le Guin lens",
		icon: "sailboat",
		credit: "Inspired by Ursula K. Le Guin's Steering the Craft, for awareness rather than as faults.",
		pos: ["ADJ", "ADV"],
		checks: ["qualifier", "stackedModifier", "participle", "echo", "opener"],
		rhythm: true,
	},
	{
		id: "pos",
		name: "Parts of speech",
		icon: "palette",
		credit: "Every part of speech in its own colour, iA Writer style.",
		pos: POS_CATEGORIES.filter((c) => c !== "AUX"),
		checks: [],
	},
	{
		id: "rhythm",
		name: "Rhythm",
		icon: "audio-waveform",
		credit: "Sentence-length tints, short to long, cool to warm.",
		pos: [],
		checks: [],
		rhythm: true,
	},
	{
		id: "dialogue",
		name: "Dialogue",
		icon: "messages-square",
		credit: "Who is speaking: each line underlined in its speaker's colour, guesses dotted, narration faded.",
		pos: [],
		checks: ["dialoguePunct", "tagAdverb", "nonSpeechTag", "showyTag", "invertedTag", "twoSpeakers", "untaggedRun", "quotedThought"],
		dialogue: true,
	},
];

export const activeLenses = (s: ProsePrinceSettings) => LENSES.filter((l) => s.lenses[l.id]);

/** The union of the active lenses, before overrides. */
export function fromLenses(s: ProsePrinceSettings): Effective {
	const e: Effective = { pos: allOff(POS_CATEGORIES), checks: allOff(CHECK_KINDS), oozeMode: false, rhythm: false, dialogue: false };
	for (const l of activeLenses(s)) {
		for (const p of l.pos) e.pos[p] = true;
		for (const c of l.checks) e.checks[c] = true;
		if (l.ooze) e.oozeMode = true;
		if (l.rhythm) e.rhythm = true;
		if (l.dialogue) e.dialogue = true;
	}
	return e;
}

export function effective(s: ProsePrinceSettings): Effective {
	const e = fromLenses(s);
	const o = s.overrides;
	for (const [k, v] of Object.entries(o.pos) as [PosCategory, boolean][]) e.pos[k] = v;
	for (const [k, v] of Object.entries(o.checks) as [CheckKind, boolean][]) e.checks[k] = v;
	if (o.ooze !== undefined) e.oozeMode = o.ooze;
	if (o.rhythm !== undefined) e.rhythm = o.rhythm;
	// Ooze is a way of showing adverbs, so it needs adverbs shown.
	if (e.oozeMode && o.pos.ADV === undefined) e.pos.ADV = true;
	return e;
}

/** Set one item, storing an override only when it differs from what the lenses give. */
export function setPos(s: ProsePrinceSettings, k: PosCategory, v: boolean): void {
	if (fromLenses(s).pos[k] === v) delete s.overrides.pos[k];
	else s.overrides.pos[k] = v;
}
export function setCheck(s: ProsePrinceSettings, k: CheckKind, v: boolean): void {
	if (fromLenses(s).checks[k] === v) delete s.overrides.checks[k];
	else s.overrides.checks[k] = v;
}
export function setOoze(s: ProsePrinceSettings, v: boolean): void {
	if (fromLenses(s).oozeMode === v) delete s.overrides.ooze;
	else s.overrides.ooze = v;
}
export function setRhythm(s: ProsePrinceSettings, v: boolean): void {
	if (fromLenses(s).rhythm === v) delete s.overrides.rhythm;
	else s.overrides.rhythm = v;
}

export const overrideCount = (s: ProsePrinceSettings) =>
	Object.keys(s.overrides.pos).length + Object.keys(s.overrides.checks).length + (s.overrides.ooze !== undefined ? 1 : 0) + (s.overrides.rhythm !== undefined ? 1 : 0);

export function clearOverrides(s: ProsePrinceSettings): void {
	s.overrides = { pos: {}, checks: {} };
}

/** The lenses that switch an item on, for "On via …" labels. */
export function lensesFor(item: { pos: PosCategory } | { check: CheckKind } | "ooze" | "rhythm", s: ProsePrinceSettings): Lens[] {
	return activeLenses(s).filter((l) =>
		item === "ooze" ? l.ooze : item === "rhythm" ? l.rhythm : "pos" in item ? l.pos.includes(item.pos) : l.checks.includes(item.check),
	);
}

/** "Adverbs (oozing), Dialogue-tag adverbs, Passive voice…": exactly what a lens turns on. */
export function lensSummary(l: Lens): string {
	const parts = [
		...(l.dialogue ? ["Speakers in colour"] : []),
		...(l.rhythm ? ["Sentence rhythm"] : []),
		...l.pos.map((p) => (p === "ADV" && l.ooze ? "Adverbs (oozing red)" : POS_LABELS[p].replace(/ \(.*\)$/, ""))),
		...l.checks.map((c) => CHECK_INFO[c].name),
	];
	return parts.join(", ");
}

/** Full description for the status-bar tooltip: "Style checks + King lens · 2 of your changes". */
export function lensLabel(s: ProsePrinceSettings): string {
	const names = activeLenses(s).map((l) => l.name);
	const base = names.length ? names.join(" + ") : "No lenses on";
	const n = overrideCount(s);
	return n ? `${base} · ${n} of your change${n === 1 ? "" : "s"}` : base;
}

function defaults(): ProsePrinceSettings {
	return {
		enabled: true,
		lenses: { style: true },
		overrides: { pos: {}, checks: {} },
		rhythm: { scope: "paragraph", tiers: 5 },
		readabilityStatus: true,
		guidance: "collapsed",
		echoWindow: 25,
		debounceMs: 250,
		worldNote: WORLD_NOTE_DEFAULT,
		characterFolder: "",
		folders: [],
		dialogue: { dimNarration: true, highlightsInDialogue: false },
		outlineAllChecks: false,
		lookup: { enabled: false, apiKey: "", hoverCards: true, rightClick: true, hideRare: false, history: true },
	};
}

export const DEFAULT_SETTINGS: ProsePrinceSettings = defaults();

/**
 * Whether ProsePrince runs on a note. A `proseprince: true|false` frontmatter flag always wins;
 * otherwise the note must sit inside one of `folders` (or anywhere, when the list is empty).
 */
export function inScope(path: string, folders: readonly string[], flag?: boolean): boolean {
	if (flag !== undefined) return flag;
	const clean = folders.map((f) => f.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
	if (clean.length === 0) return true;
	return clean.some((f) => path === f || path.startsWith(`${f}/`));
}

/**
 * Settings saved by 0.2–0.3, where a lens was a preset that overwrote the toggles. A named lens
 * becomes that lens switched on; "custom" keeps the hand-set toggles as overrides.
 */
export function migrateLegacy(saved: Record<string, unknown>): Partial<ProsePrinceSettings> {
	// 0.5 and earlier kept the World note in "ProsePrince/"; it now lives in "_proseprince/".
	if (saved.worldNote === "ProsePrince/World.md") saved = { ...saved, worldNote: WORLD_NOTE_DEFAULT };
	if (saved.lenses !== undefined || saved.lens === undefined) return saved as Partial<ProsePrinceSettings>;
	const { lens, pos, checks, oozeMode, rhythm, ...rest } = saved as {
		lens: string; pos?: Record<string, boolean>; checks?: Record<string, boolean>; oozeMode?: boolean; rhythm?: { enabled?: boolean; scope?: RhythmScope; tiers?: number };
	};
	const out: Partial<ProsePrinceSettings> = { ...(rest as Partial<ProsePrinceSettings>) };
	if (rhythm) out.rhythm = { scope: rhythm.scope ?? "paragraph", tiers: rhythm.tiers ?? 5 };
	if (lens !== "custom" && LENSES.some((l) => l.id === lens)) {
		out.lenses = { [lens]: true };
		out.overrides = { pos: {}, checks: {} };
	} else {
		out.lenses = {};
		out.overrides = {
			pos: Object.fromEntries(Object.entries(pos ?? {}).filter(([, v]) => v)),
			checks: Object.fromEntries(Object.entries(checks ?? {}).filter(([, v]) => v)),
			...(oozeMode ? { ooze: true } : {}),
			...(rhythm?.enabled ? { rhythm: true } : {}),
		};
	}
	return out;
}
