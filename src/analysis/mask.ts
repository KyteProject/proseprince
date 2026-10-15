/**
 * Markdown masking. Every function here returns a string of the same length as its
 * input, with markup replaced by spaces, so tagger offsets map straight back onto the
 * editor document. (iwl.me fed raw Markdown to its tagger; `_` and `#` were tagged as words.)
 */

const blank = (s: string) => s.replace(/[^\n]/g, " ");

function replaceAll(text: string, re: RegExp, fn: (m: RegExpExecArray) => string): string {
	let out = "";
	let last = 0;
	re.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		if (m[0].length === 0) {
			re.lastIndex++;
			continue;
		}
		const replacement = fn(m);
		out += text.slice(last, m.index) + replacement;
		last = m.index + m[0].length;
	}
	return out + text.slice(last);
}

/** Keep `keep` (a substring of the match at `keepAt`) and blank everything else in the match. */
function keepInner(match: string, keepAt: number, keep: string): string {
	return blank(match.slice(0, keepAt)) + keep + blank(match.slice(keepAt + keep.length));
}

/** Mask inline Markdown inside a single paragraph. */
export function maskInline(text: string): string {
	let t = text;
	// Things that are never prose: comments, inline code, embeds, HTML, footnote refs, bare URLs, tags.
	t = replaceAll(t, /%%[\s\S]*?%%/g, (m) => blank(m[0]));
	t = replaceAll(t, /<!--[\s\S]*?-->/g, (m) => blank(m[0]));
	t = replaceAll(t, /`+[^`\n]*`+/g, (m) => blank(m[0]));
	t = replaceAll(t, /!\[\[[^\]\n]*\]\]/g, (m) => blank(m[0]));
	t = replaceAll(t, /!\[[^\]\n]*\]\([^)\n]*\)/g, (m) => blank(m[0]));
	t = replaceAll(t, /<\/?[A-Za-z][^>\n]*>/g, (m) => blank(m[0]));
	t = replaceAll(t, /\[\^[^\]\n]+\]/g, (m) => blank(m[0]));
	t = replaceAll(t, /\bhttps?:\/\/[^\s)>\]]+/g, (m) => blank(m[0]));
	t = replaceAll(t, /(^|\s)#[\p{L}\p{N}_\-/]+/gu, (m) => (m[1] ?? "") + blank(m[0].slice((m[1] ?? "").length)));
	// Links keep their visible text.
	t = replaceAll(t, /\[\[([^\]|\n]+)\|([^\]\n]+)\]\]/g, (m) => keepInner(m[0], m[0].lastIndexOf(m[2]!), m[2]!));
	t = replaceAll(t, /\[\[([^\]\n]+)\]\]/g, (m) => keepInner(m[0], 2, m[1]!));
	t = replaceAll(t, /\[([^\]\n]+)\]\([^)\n]*\)/g, (m) => keepInner(m[0], 1, m[1]!));
	// Line-start markers: headings, blockquotes, list items, task boxes.
	t = replaceAll(t, /^([ \t]*)(#{1,6}[ \t]+|(?:>[ \t]?)+|(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)/gm, (m) => m[1]! + blank(m[2]!));
	// Emphasis markers. `_` only counts when it sits on a word boundary (not inside snake_case).
	t = replaceAll(t, /\*+|~~|==/g, (m) => blank(m[0]));
	t = replaceAll(t, /(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, (m) => blank(m[0]));
	return t;
}

export interface Range {
	from: number;
	to: number;
}

/**
 * Block-level regions that are never prose, found by scanning the whole document:
 * frontmatter, fenced code, math blocks and multi-line comments. Needs document context,
 * because a fence can span blank lines.
 */
export function excludedBlocks(doc: string): Range[] {
	const ranges: Range[] = [];
	const lines = doc.split("\n");
	let offset = 0;
	let open: { kind: "fence" | "math" | "comment" | "frontmatter"; marker: string; from: number } | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const lineEnd = offset + line.length;
		const trimmed = line.trim();
		if (open) {
			const closes =
				(open.kind === "fence" && trimmed.startsWith(open.marker)) ||
				(open.kind === "math" && trimmed.endsWith("$$")) ||
				(open.kind === "comment" && trimmed.includes("%%")) ||
				(open.kind === "frontmatter" && (trimmed === "---" || trimmed === "..."));
			if (closes) {
				ranges.push({ from: open.from, to: lineEnd });
				open = null;
			}
		} else if (i === 0 && trimmed === "---") {
			open = { kind: "frontmatter", marker: "---", from: offset };
		} else {
			const fence = /^(`{3,}|~{3,})/.exec(trimmed);
			if (fence) open = { kind: "fence", marker: fence[1]!, from: offset };
			else if (trimmed.startsWith("$$") && !(trimmed.length > 2 && trimmed.endsWith("$$"))) open = { kind: "math", marker: "$$", from: offset };
			else if (trimmed.startsWith("%%") && (trimmed.match(/%%/g)?.length ?? 0) === 1) open = { kind: "comment", marker: "%%", from: offset };
		}
		offset = lineEnd + 1;
	}
	if (open) ranges.push({ from: open.from, to: doc.length });
	return ranges;
}

/** Ranges of quoted dialogue in a (masked) paragraph: straight and curly double quotes. */
export function dialogueRanges(text: string): Range[] {
	const ranges: Range[] = [];
	let start = -1;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === "“") start = i;
		else if (c === "”") {
			if (start !== -1) ranges.push({ from: start, to: i + 1 });
			start = -1;
		} else if (c === '"') {
			if (start === -1) start = i;
			else {
				ranges.push({ from: start, to: i + 1 });
				start = -1;
			}
		}
	}
	// An unclosed quote runs to the end of the paragraph (multi-paragraph speeches).
	if (start !== -1) ranges.push({ from: start, to: text.length });
	return ranges;
}
