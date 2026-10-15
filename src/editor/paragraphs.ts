import type { Text } from "@codemirror/state";
import type { Range } from "../analysis/mask";

export interface Paragraph {
	/** Document offset of the paragraph's first character. */
	from: number;
	text: string;
}

/** How far to look beyond a visible range for the start/end of its paragraph. */
const MAX_EXPANSION_LINES = 60;

const isBlank = (doc: Text, line: number) => doc.line(line).text.trim() === "";

/**
 * Whole paragraphs (runs of non-blank lines) touching the given ranges. Tagging whole
 * paragraphs means a sentence cut off at the edge of the screen still gets its full context
 * (iwl.me tagged only the visible slice).
 */
export function paragraphsAround(doc: Text, ranges: readonly Range[]): Paragraph[] {
	const found = new Map<number, Paragraph>();
	for (const range of ranges) {
		let start = doc.lineAt(range.from).number;
		let end = doc.lineAt(Math.min(range.to, doc.length)).number;
		for (let n = 0; n < MAX_EXPANSION_LINES && start > 1 && !isBlank(doc, start - 1); n++) start--;
		for (let n = 0; n < MAX_EXPANSION_LINES && end < doc.lines && !isBlank(doc, end + 1); n++) end++;
		let current: { from: number; lines: string[] } | null = null;
		const flush = () => {
			if (current && !found.has(current.from)) found.set(current.from, { from: current.from, text: current.lines.join("\n") });
			current = null;
		};
		for (let n = start; n <= end; n++) {
			const line = doc.line(n);
			if (line.text.trim() === "") flush();
			else if (current) current.lines.push(line.text);
			else current = { from: line.from, lines: [line.text] };
		}
		flush();
	}
	return [...found.values()].sort((a, b) => a.from - b.from);
}

/** Blank out parts of paragraphs that fall inside excluded blocks; drop paragraphs left empty. */
export function applyExclusions(paragraphs: Paragraph[], excluded: readonly Range[]): Paragraph[] {
	const out: Paragraph[] = [];
	for (const p of paragraphs) {
		const end = p.from + p.text.length;
		let text = p.text;
		for (const r of excluded) {
			if (r.to <= p.from || r.from >= end) continue;
			const a = Math.max(r.from, p.from) - p.from;
			const b = Math.min(r.to, end) - p.from;
			text = text.slice(0, a) + text.slice(a, b).replace(/[^\n]/g, " ") + text.slice(b);
		}
		if (text.trim() !== "") out.push({ from: p.from, text });
	}
	return out;
}
