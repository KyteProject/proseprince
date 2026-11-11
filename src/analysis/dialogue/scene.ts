import { excludedBlocks } from "../mask";
import { namesIn, namesInText } from "../names";
import { beatAt, beatNotes, beatsOf, headingsIn, isNamedPerson } from "../outline";
import { attribute, type How, type ParagraphDialogue } from "./attribute";
import type { DialogueLine } from "./speech";

/**
 * Who speaks in a scene, read from the whole note at once: the same paragraphs, names and rules the
 * Dialogue lens uses in the editor, so the two agree. Pure: the paragraphs are analysed elsewhere
 * (in the worker) and handed back in.
 */

export interface SpeechParagraph {
	/** Offset of the paragraph's first character in the note. */
	from: number;
	text: string;
	/** Known names that occur in it, sorted: part of what the paragraph's analysis is cached under. */
	names: string[];
}

/**
 * A note's paragraphs (runs of non-blank lines), with frontmatter, code, comments and callouts
 * blanked out, and the known names found in each.
 * @param castNames names known beyond this note: the World note's and the character notes'.
 */
export function speechParagraphs(text: string, castNames: Iterable<string> = []): SpeechParagraph[] {
	const excluded = excludedBlocks(text);
	const headings = beatsOf(headingsIn(text, excluded)).beats;
	// Names listed in a beat's `who:` line count as names everywhere in the note.
	const listed = beatNotes(text, headings).flatMap((n) => n.who ?? []).filter(isNamedPerson).flatMap((n) => n.split(" "));
	const known = new Set([...namesInText(text), ...castNames, ...listed]);
	const out: SpeechParagraph[] = [];
	let offset = 0;
	let block = 0;
	let current: { from: number; lines: string[] } | null = null;
	const flush = () => {
		if (current) {
			const joined = current.lines.join("\n");
			if (joined.trim() !== "") out.push({ from: current.from, text: joined, names: namesIn(joined, known) });
		}
		current = null;
	};
	for (const line of text.split("\n")) {
		const from = offset;
		const to = from + line.length;
		offset = to + 1;
		if (line.trim() === "") {
			flush();
			continue;
		}
		// Blank whatever falls inside an excluded block, keeping every offset where it was.
		let shown = line;
		while (block < excluded.length && excluded[block]!.to <= from) block++;
		for (let b = block; b < excluded.length && excluded[b]!.from < to; b++) {
			const a = Math.max(excluded[b]!.from, from) - from;
			const z = Math.min(excluded[b]!.to, to) - from;
			if (z > a) shown = shown.slice(0, a) + " ".repeat(z - a) + shown.slice(z);
		}
		if (current) current.lines.push(shown);
		else current = { from, lines: [shown] };
	}
	flush();
	return out;
}

/** One speaker's lines in a scene. */
export interface Spoke {
	/** As the Dialogue lens shows them: "Linh", "the inspector". */
	name: string;
	/** Lines given to them by a tag ("Linh said") or a pinned speaker. */
	tagged: number;
	/** Lines given to them by an action beat, or by a pronoun the scene settles. */
	placed: number;
	/** Lines guessed from turn-taking. */
	guessed: number;
}

export interface SceneSpeech {
	/** In order of first line. */
	speakers: Spoke[];
	/** Every line of speech in the scene. */
	lines: number;
	/** Lines no rule could give to anyone. */
	unknown: number;
}

export const EMPTY_SPEECH: SceneSpeech = { speakers: [], lines: 0, unknown: 0 };

const FIRM: ReadonlySet<How> = new Set<How>(["pin", "tag"]);

/**
 * Who speaks in a note, and how many lines each.
 * @param dialogue each paragraph's lines, from its analysis; a paragraph with none is narration.
 * @param canonical the shown name for a name or alias ("Effie" is "Eufemie").
 */
export function sceneSpeech(text: string, paragraphs: readonly SpeechParagraph[], dialogue: readonly (readonly DialogueLine[] | undefined)[], canonical: (name: string) => string = (n) => n): SceneSpeech {
	const excluded = excludedBlocks(text);
	const beats = beatsOf(headingsIn(text, excluded)).beats;
	const notes = beatNotes(text, beats);
	const castAt = (pos: number) => {
		const i = beatAt(beats, pos);
		return i >= 0 ? notes[i]?.who : undefined;
	};
	const items: ParagraphDialogue[] = [];
	paragraphs.forEach((p, i) => {
		const lines = dialogue[i];
		if (!lines) {
			items.push({ text: p.text, info: null });
			return;
		}
		for (const line of lines) items.push({ text: p.text.slice(line.from, line.to), info: line, cast: castAt(p.from + line.from) });
	});
	const found = new Map<string, Spoke>();
	let lines = 0;
	let unknown = 0;
	for (const spans of attribute(items, (name, kind) => (kind === "pronoun" ? name : canonical(name)))) {
		for (const a of spans) {
			if (a.thought) continue;
			lines++;
			if (!a.speaker) {
				unknown++;
				continue;
			}
			const key = a.speaker.toLowerCase();
			if (!found.has(key)) found.set(key, { name: a.speaker, tagged: 0, placed: 0, guessed: 0 });
			const s = found.get(key)!;
			if (!a.certain) s.guessed++;
			else if (a.how && FIRM.has(a.how)) s.tagged++;
			else s.placed++;
		}
	}
	return { speakers: [...found.values()], lines, unknown };
}
