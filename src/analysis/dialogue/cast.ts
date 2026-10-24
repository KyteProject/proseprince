/**
 * Who is who, for speaker colours: "Eufemie | Effie" in the World note, or a character note's
 * name and aliases, are one speaker. The first name in a group is the one shown.
 */

const NAME_SECTIONS = new Set(["names", "characters", "people", "cast"]);

/** Groups of names for the same person from the World note's Names section (`- Eufemie | Effie`). */
export function nameGroupsIn(markdown: string): string[][] {
	const groups: string[][] = [];
	let inNames = true;
	let seenHeading = false;
	let inFrontmatter = markdown.startsWith("---");
	for (const [i, raw] of markdown.split("\n").entries()) {
		if (inFrontmatter) {
			if (i > 0 && raw.trim() === "---") inFrontmatter = false;
			continue;
		}
		const heading = /^#{1,6}\s+(.+?)\s*#*$/.exec(raw);
		if (heading) {
			inNames = NAME_SECTIONS.has(heading[1]!.toLowerCase().replace(/[^a-z]/g, ""));
			seenHeading = true;
			continue;
		}
		const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(raw);
		const line = item ? item[1]! : seenHeading ? raw : "";
		if (!inNames || line.trim() === "" || line.trim().startsWith(">")) continue;
		const entry = line.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target)
			.replace(/[*_`]/g, "")
			.split(/:\s| [—–-] /)[0]!;
		const names = entry.split(/[|,]/).map((p) => p.replace(/\(.*?\)/g, "").trim()).filter(Boolean);
		if (names.length) groups.push(names);
	}
	return groups;
}

/**
 * Alias (lowercased) → the name shown for that speaker. A full name also answers to its first word
 * ("Eufemie Kanda" → "Eufemie"), unless that word belongs to someone else.
 */
export function speakerIndex(groups: string[][]): Map<string, string> {
	const out = new Map<string, string>();
	const claim = (alias: string, canonical: string) => {
		const key = alias.toLowerCase();
		if (!out.has(key)) out.set(key, canonical);
	};
	for (const g of groups) for (const n of g) claim(n, g[0]!);
	for (const g of groups) for (const n of g) if (n.includes(" ")) claim(n.split(" ")[0]!, g[0]!);
	return out;
}

/** A CSS colour from a note's `colour:` field: hex only (#rgb, #rrggbb), so nothing odd reaches the style attribute. */
export function cssColour(value: unknown): string | undefined {
	return typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim() : undefined;
}
