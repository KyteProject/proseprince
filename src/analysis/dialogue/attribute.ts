import type { DialogueInfo, SpeakerKind, SpeechSpan } from "./speech";

/**
 * Who says each line, across a whole note. Rules, first match wins:
 *
 *   1. pin      `%% speaker: Linh %%` in the paragraph
 *   2. tag      "Linh said", "said Linh", "the inspector said"
 *   3. beat     the narration names exactly one person ("Linh set down his cup.")
 *   4. turns    an untagged line in a two-person exchange goes to whoever spoke before the last line
 *
 * Pronoun tags ("she said") aren't resolved from the pronoun: they take the turn-taking guess, and
 * count as certain only when there is one. Pure and synchronous; the editor runs it over cached
 * paragraph results.
 */

export type How = "pin" | "tag" | "beat" | "turns" | "pronoun";

export interface Attribution {
	/** Paragraph offsets. */
	from: number;
	to: number;
	thought: boolean;
	/** Display name: "Linh", "the inspector". Null when no rule found anyone. */
	speaker: string | null;
	how: How | null;
	certain: boolean;
	span: SpeechSpan;
}

export interface ParagraphDialogue {
	info: DialogueInfo | null;
	/** Raw paragraph text, for pins, headings and scene breaks. */
	text: string;
}

/** How many narration-only paragraphs turn-taking survives. */
export const MAX_GAP = 2;

const PIN = /%%\s*speaker\s*:?\s*([^%\n]+?)\s*%%/i;
const NOT_SPEECH = /%%\s*not\s+speech\s*%%/i;
const RESET = /^(#{1,6}\s|(\*\s*){3,}$|(-\s*){3,}$|(_\s*){3,}$)/;

/** The pinned speaker, if any: `%% speaker: Linh %%`. */
export function pinIn(text: string): string | null {
	return PIN.exec(text)?.[1]?.trim() || null;
}

export const isNotSpeech = (text: string) => NOT_SPEECH.test(text);

/** Headings and scene breaks (`***`, `---`) start a new exchange. */
export const resetsTurns = (text: string) => RESET.test(text.trim());

/**
 * Attribute every speech span in a note. `canonical` maps a name or alias to the speaker it belongs
 * to ("Effie" → "Eufemie"); described speakers and unknown names pass through.
 */
export function attribute(paragraphs: ParagraphDialogue[], canonical: (name: string, kind: SpeakerKind) => string = (n) => n): Attribution[][] {
	const out: Attribution[][] = [];
	/** Distinct recent speakers, most recent first. */
	let history: string[] = [];
	/** Whether each speaker in `history` got there for certain, or by a guess. */
	const sure = new Map<string, boolean>();
	let gap = 0;
	const spoke = (speaker: string, certain: boolean) => {
		history = [speaker, ...history.filter((s) => s !== speaker)].slice(0, 4);
		sure.set(speaker, certain);
		gap = 0;
	};
	/** Stands in for an unnamed second speaker, so turn-taking can still alternate back to the named one. */
	const OTHER = "\u0000other";
	const turnGuess = (): string | null => (history[1] && history[1] !== OTHER ? history[1] : null);
	/** "she" → Shaddid for this scene, learned from the narration. Null once two people have claimed it. */
	let bound = new Map<string, string | null>();
	const bind = (pronoun: string, speaker: string) => {
		const had = bound.get(pronoun);
		if (had === undefined) bound.set(pronoun, speaker);
		else if (had !== null && had !== speaker) bound.set(pronoun, null);
	};
	/** People named in this scene's narration or heard speaking, most recent first. */
	let present: string[] = [];
	const meet = (speaker: string) => {
		present = [speaker, ...present.filter((s) => s !== speaker)].slice(0, 6);
	};
	/**
	 * Who "he" or "she" is: the scene's binding from the narration; or, when the other pronoun is
	 * bound (she = Shaddid), the other person in the exchange, or failing that the most recent other
	 * person in the scene (a guess).
	 */
	const resolvePronoun = (pronoun: string): { speaker: string; certain: boolean } | null => {
		const direct = bound.get(pronoun);
		if (direct) return { speaker: direct, certain: true };
		if (pronoun !== "he" && pronoun !== "she") return null;
		const other = bound.get(pronoun === "he" ? "she" : "he");
		if (!other) return null;
		const rest = history.slice(0, 2).filter((s) => s !== other && s !== OTHER);
		if (rest.length === 1) return { speaker: rest[0]!, certain: sure.get(rest[0]!) === true };
		// Otherwise someone else in the scene, preferring whoever the narration names most (often the viewpoint).
		const someone = present.filter((s) => s !== other).sort((a, b) => (named.get(b) ?? 0) - (named.get(a) ?? 0))[0];
		return someone ? { speaker: someone, certain: false } : null;
	};
	// "The door opened" isn't a person: a described subject only counts as a beat once it has spoken in a tag.
	const described = new Set<string>();
	// People, as opposed to places and organisations ("the Outer Planets Alliance was…"): anyone tagged
	// as speaking somewhere in the note, or pinned.
	const people = new Set<string>();
	for (const p of paragraphs) {
		for (const s of p.info?.spans ?? []) {
			if (s.tag?.kind === "described") described.add(canonical(s.tag.speaker, "described"));
			if (s.tag && s.tag.kind !== "pronoun") people.add(canonical(s.tag.speaker, s.tag.kind));
		}
		const pin = pinIn(p.text);
		if (pin) people.add(canonical(pin, "name"));
	}
	// How often each person is named in the narration: the viewpoint character usually leads.
	const named = new Map<string, number>();
	for (const p of paragraphs) for (const m of p.info?.mentions ?? []) {
		const who = canonical(m, "name");
		if (people.has(who)) named.set(who, (named.get(who) ?? 0) + 1);
	}

	for (const p of paragraphs) {
		if (resetsTurns(p.text)) {
			history = [];
			gap = 0;
			bound = new Map();
			present = [];
			out.push([]);
			continue;
		}
		for (const link of p.info?.pronouns ?? []) {
			const who = canonical(link.speaker, "name");
			if (people.has(who)) bind(link.pronoun, who);
		}
		for (const name of [...(p.info?.mentions ?? [])].reverse()) {
			const who = canonical(name, "name");
			if (people.has(who)) meet(who);
		}
		const spans = p.info && !isNotSpeech(p.text) ? p.info.spans : [];
		const speech = spans.filter((s) => !s.thought);
		if (speech.length === 0) {
			out.push(spans.map((span) => ({ from: span.from, to: span.to, thought: true, speaker: null, how: null, certain: false, span })));
			// A long stretch of narration ends the exchange; what "he" meant in it may not hold in the next.
			if (++gap > MAX_GAP) {
				history = [];
				bound = new Map();
			}
			continue;
		}

		// The paragraph's speaker: pin, then the first named or described tag, then a pronoun tag, a beat, turns.
		let speaker: string | null = null;
		let how: How | null = null;
		let certain = false;
		const pin = pinIn(p.text);
		const tagged = speech.find((s) => s.tag && s.tag.kind !== "pronoun")?.tag;
		const beats = p.info!.beats.map((b) => canonical(b.speaker, b.kind)).filter((b, i) => p.info!.beats[i]!.kind !== "described" || described.has(b));
		const uniqueBeats = [...new Set(beats)];
		if (pin) {
			[speaker, how, certain] = [canonical(pin, "name"), "pin", true];
		} else if (tagged) {
			[speaker, how, certain] = [canonical(tagged.speaker, tagged.kind), "tag", true];
		} else if (speech.some((s) => s.tag?.kind === "pronoun")) {
			// "she said": who "she" is in this scene; else turn-taking; else the one person acting here.
			const pronoun = speech.find((s) => s.tag?.kind === "pronoun")!.tag!.speaker;
			const resolved = resolvePronoun(pronoun);
			// Never someone the other pronoun already means: if "he" is Linh, "she said" isn't Linh.
			const opposite = pronoun === "he" ? bound.get("she") : pronoun === "she" ? bound.get("he") : undefined;
			const candidate = turnGuess() ?? (uniqueBeats.length === 1 ? uniqueBeats[0]! : null);
			const fallback = candidate && candidate === opposite ? null : candidate;
			[speaker, how, certain] = resolved ? [resolved.speaker, "pronoun", resolved.certain] : [fallback, fallback ? "pronoun" : null, fallback !== null];
			// Once known for sure, the pronoun keeps meaning this speaker for the scene.
			if (resolved?.certain && (pronoun === "he" || pronoun === "she") && bound.get(pronoun) === undefined) bind(pronoun, resolved.speaker);
			// Someone, just not anyone named: keep the turns alternating.
			if (!speaker && history.length > 0 && history[0] !== OTHER) spoke(OTHER, false);
		} else if (uniqueBeats.length === 1) {
			[speaker, how, certain] = [uniqueBeats[0]!, "beat", true];
		} else {
			const guess = turnGuess();
			// A guess that names someone the paragraph doesn't mention, while it mentions others, is no guess.
			const contradicted = guess !== null && uniqueBeats.length > 0 && !uniqueBeats.includes(guess);
			[speaker, how, certain] = contradicted ? [null, null, false] : [guess, guess ? "turns" : null, false];
			// With one named speaker so far, this line is probably the other, unnamed person: remember that
			// someone spoke, so the next untagged line can alternate back.
			if (!speaker && !contradicted && history.length > 0 && history[0] !== OTHER) spoke(OTHER, false);
			else if (!speaker && history[0] === OTHER && history[1]) {
				[speaker, how, certain] = [history[1], "turns", false];
			}
		}

		// Each line's own tag: a name, or a pronoun resolved for this scene. A pronoun that can't be
		// resolved, next to a named tag, may well be someone else ("Morning," Linh said. … she said).
		const ownSpeaker = (span: SpeechSpan): { speaker: string | null; certain: boolean } | undefined => {
			if (pin || !span.tag) return undefined;
			if (span.tag.kind !== "pronoun") return { speaker: canonical(span.tag.speaker, span.tag.kind), certain: true };
			if (how === "pronoun") return undefined;
			const r = resolvePronoun(span.tag.speaker);
			return r ?? { speaker: null, certain: false };
		};
		const owners = speech.map(ownSpeaker);
		// Several people tagged in one paragraph: an untagged line in it could be any of them.
		const distinct = new Set(owners.filter((o) => o !== undefined).map((o) => o!.speaker ?? "\u0000someone"));
		const crowded = !pin && distinct.size > 1;
		out.push(spans.map((span) => {
			if (span.thought) return { from: span.from, to: span.to, thought: true, speaker: null, how: null, certain: false, span };
			const own = owners[speech.indexOf(span)];
			if (own === undefined) {
				return crowded
					? { from: span.from, to: span.to, thought: false, speaker: null, how: null, certain: false, span }
					: { from: span.from, to: span.to, thought: false, speaker, how, certain, span };
			}
			if (own.speaker === speaker) return { from: span.from, to: span.to, thought: false, speaker, how, certain, span };
			return { from: span.from, to: span.to, thought: false, speaker: own.speaker, how: own.speaker ? (span.tag!.kind === "pronoun" ? "pronoun" as const : "tag" as const) : null, certain: own.certain, span };
		}));
		if (speaker) {
			spoke(speaker, certain);
			meet(speaker);
		} else gap = 0;
	}
	return out;
}

/** Lines in a row without a tag, beat, pin or pronoun tag before the reader needs re-anchoring. */
export const UNTAGGED_RUN = 5;

/**
 * Every fifth line of an untagged run, as [unit index, attribution]: the places a tag would help. Narration
 * between lines doesn't break a run (the reader still has to count) unless the exchange has ended.
 */
export function untaggedRuns(attributions: Attribution[][], paragraphs: ParagraphDialogue[]): [number, Attribution][] {
	const out: [number, Attribution][] = [];
	let run = 0;
	let gap = 0;
	attributions.forEach((spans, i) => {
		if (resetsTurns(paragraphs[i]?.text ?? "")) {
			run = 0;
			return;
		}
		const speech = spans.filter((a) => !a.thought);
		if (speech.length === 0) {
			if (++gap > MAX_GAP) run = 0;
			return;
		}
		gap = 0;
		for (const a of speech) {
			if (a.how === "turns" || a.how === null) {
				// Flag every fifth line: where a tag or beat would re-anchor the reader.
				if (++run >= UNTAGGED_RUN) {
					out.push([i, a]);
					run = 0;
				}
			} else run = 0;
		}
	});
	return out;
}

/** The speakers of a note in order of first appearance. */
export function speakersIn(attributions: Attribution[][]): string[] {
	const seen: string[] = [];
	for (const p of attributions) for (const a of p) if (a.speaker && !seen.includes(a.speaker)) seen.push(a.speaker);
	return seen;
}

/** Six hues that stay distinct in light and dark themes; a seventh speaker in a note shares a colour. */
export const SPEAKER_COLOURS = 6;

function hash(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/**
 * A palette slot per speaker: stable for a name (adding a character never moves anyone else),
 * nudged to the next free slot when two speakers in the same note would share one.
 */
export function colourSlots(speakers: string[]): Map<string, number> {
	const out = new Map<string, number>();
	const taken = new Set<number>();
	for (const s of speakers) {
		let slot = hash(s.toLowerCase()) % SPEAKER_COLOURS;
		for (let n = 0; n < SPEAKER_COLOURS && taken.has(slot); n++) slot = (slot + 1) % SPEAKER_COLOURS;
		out.set(s, slot);
		taken.add(slot);
	}
	return out;
}
