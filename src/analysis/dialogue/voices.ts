/**
 * How each character talks, from their attributed lines: how much, how long a line, how often they
 * ask or exclaim, and the words they use more than everyone else. Pure; reads the note only.
 */

export interface VoiceLine {
	speaker: string;
	/** The words spoken, quote marks and Markdown included (they're stripped here). */
	text: string;
	/** Attributed by a guess (turn-taking), not a tag, beat or pin. */
	guessed: boolean;
}

export interface Voice {
	speaker: string;
	lines: number;
	/** Of `lines`, how many were guesses. */
	guessed: number;
	words: number;
	wordsPerLine: number;
	/** Share of this speaker's lines with a question mark / an exclamation mark. */
	questions: number;
	exclamations: number;
	/** Share of all the note's spoken words. */
	share: number;
	/** Words this speaker uses notably more than the others, strongest first. */
	distinctive: string[];
}

/** Function words: everyone uses them, so they say nothing about a voice. Contractions and slang stay: they do. */
const STOP = new Set(`a an the and or but nor so yet if then than to of in on at by for with from into onto up down out over
under about as is are was were be been being am it its it's this that these those there here i me my mine you your yours
he him his she her hers we us our ours they them their theirs what which who whom whose when where why how all any some no
not do does did done have has had having will would shall should can could may might must just very too also only own same
such more most other another each every both either neither one two let's oh`.split(/\s+/));

const words = (text: string) =>
	text.toLowerCase().replace(/[’‘]/g, "'").replace(/[*_~`"“”]/g, " ").match(/[\p{L}][\p{L}'-]*/gu)?.map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean) ?? [];

/**
 * Prior strength and cut-off for the word comparison. A chapter gives each speaker a few hundred words,
 * far too few for formal significance (z ≥ 1.96 found nothing in a published chapter), so this is a
 * lean, not a test: tuned on Leviathan Wakes ch. 2, where it finds Miller's "sir", "right", "don't".
 */
const PRIOR = 50;
const MIN_Z = 1;

/**
 * Words a speaker leans on relative to everyone else: the weighted log-odds ratio with an informative
 * Dirichlet prior (Monroe, Colaresi & Quinn, 2008), a standard way to compare word use between groups
 * that doesn't let rare words dominate. Kept: used at least twice and above MIN_Z.
 */
export function distinctiveWords(mine: Map<string, number>, rest: Map<string, number>, limit = 6): string[] {
	const total = new Map<string, number>();
	for (const m of [mine, rest]) for (const [w, n] of m) total.set(w, (total.get(w) ?? 0) + n);
	const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
	const nMine = sum(mine);
	const nRest = sum(rest);
	const nAll = nMine + nRest;
	if (!nMine || !nRest) return [];
	const a0 = PRIOR;
	const scored: [string, number][] = [];
	for (const [w, yi] of mine) {
		if (yi < 2 || STOP.has(w)) continue;
		const yj = rest.get(w) ?? 0;
		const aw = (a0 * total.get(w)!) / nAll;
		const delta = Math.log((yi + aw) / (nMine + a0 - yi - aw)) - Math.log((yj + aw) / (nRest + a0 - yj - aw));
		const z = delta / Math.sqrt(1 / (yi + aw) + 1 / (yj + aw));
		if (z >= MIN_Z) scored.push([w, z]);
	}
	return scored.sort((x, y) => y[1] - x[1]).slice(0, limit).map(([w]) => w);
}

export function voices(lines: VoiceLine[]): Voice[] {
	const by = new Map<string, VoiceLine[]>();
	for (const l of lines) by.set(l.speaker, [...(by.get(l.speaker) ?? []), l]);
	const counts = new Map<string, Map<string, number>>();
	let allWords = 0;
	for (const [speaker, ls] of by) {
		const c = new Map<string, number>();
		for (const l of ls) for (const w of words(l.text)) c.set(w, (c.get(w) ?? 0) + 1);
		counts.set(speaker, c);
		allWords += [...c.values()].reduce((a, b) => a + b, 0);
	}
	const out: Voice[] = [];
	for (const [speaker, ls] of by) {
		const mine = counts.get(speaker)!;
		const rest = new Map<string, number>();
		for (const [other, c] of counts) if (other !== speaker) for (const [w, n] of c) rest.set(w, (rest.get(w) ?? 0) + n);
		const n = [...mine.values()].reduce((a, b) => a + b, 0);
		out.push({
			speaker,
			lines: ls.length,
			guessed: ls.filter((l) => l.guessed).length,
			words: n,
			wordsPerLine: ls.length ? n / ls.length : 0,
			questions: ls.filter((l) => l.text.includes("?")).length / ls.length,
			exclamations: ls.filter((l) => l.text.includes("!")).length / ls.length,
			share: allWords ? n / allWords : 0,
			distinctive: distinctiveWords(mine, rest),
		});
	}
	return out.sort((a, b) => b.words - a.words);
}

export interface Stretch {
	kind: "narration" | "dialogue";
	/** Index of the first and last unit (line) in the stretch. */
	first: number;
	last: number;
	length: number;
}

/** Long stretches with no dialogue, or nothing but dialogue: a hint about the scene's shape, not a rule. */
export const LONG_STRETCH = 8;

/** The longest narration-only and dialogue-only stretches, given whether each unit has speech (null for breaks). */
export function longestStretches(hasSpeech: (boolean | null)[]): Stretch[] {
	const best: Partial<Record<Stretch["kind"], Stretch>> = {};
	let run: Stretch | null = null;
	const close = () => {
		if (run && run.length > (best[run.kind]?.length ?? 0)) best[run.kind] = run;
		run = null;
	};
	hasSpeech.forEach((speech, i) => {
		if (speech === null) return close();
		const kind = speech ? "dialogue" : "narration";
		if (run && run.kind === kind) {
			run.last = i;
			run.length++;
		} else {
			close();
			run = { kind, first: i, last: i, length: 1 };
		}
	});
	close();
	return Object.values(best).filter((s): s is Stretch => !!s && s.length >= LONG_STRETCH);
}
