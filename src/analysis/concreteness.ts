// Loader adapted from Creative Writer's BrysbaertConcreteness (MIT). Data: Brysbaert, Warriner &
// Kuperman (2014), CC-BY 4.0. See THIRD_PARTY_NOTICES.md.
import { CONCRETENESS_DATA } from "./lexicon/concreteness.data";

let table: Map<string, number> | null = null;

function load(): Map<string, number> {
	if (table) return table;
	const m = new Map<string, number>();
	for (const entry of CONCRETENESS_DATA.split(" ")) m.set(entry.slice(0, -2), Number(entry.slice(-2)) / 10);
	return (table = m);
}

/** Concreteness from 1 (abstract: "justice") to 5 (concrete: "knife"), or null if unknown. */
export function concreteness(word: string): number | null {
	const t = load();
	for (const candidate of lemmaCandidates(word.toLowerCase())) {
		const s = t.get(candidate);
		if (s !== undefined) return s;
	}
	return null;
}

/** Whether the word is one of the 40k generally known lemmas in the norms. */
export function isKnownLemma(word: string): boolean {
	return load().has(word.toLowerCase());
}

/** The word itself, then cheap de-inflections in order of likelihood. */
function lemmaCandidates(w: string): string[] {
	const out = [w];
	if (w.endsWith("ies") && w.length > 4) out.push(w.slice(0, -3) + "y");
	if (w.endsWith("ves") && w.length > 4) out.push(w.slice(0, -3) + "fe", w.slice(0, -3) + "f");
	if (w.endsWith("es") && w.length > 3) out.push(w.slice(0, -2));
	if (w.endsWith("s") && w.length > 3) out.push(w.slice(0, -1));
	if (w.endsWith("ied") && w.length > 4) out.push(w.slice(0, -3) + "y");
	if (w.endsWith("ed") && w.length > 3) out.push(w.slice(0, -2), w.slice(0, -1));
	if (w.endsWith("ing") && w.length > 4) out.push(w.slice(0, -3), w.slice(0, -3) + "e");
	if (/(.)\1(ed|ing)$/.test(w)) out.push(w.replace(/(.)\1(ed|ing)$/, "$1"));
	if (w.endsWith("er") && w.length > 4) out.push(w.slice(0, -2));
	if (w.endsWith("ly") && w.length > 4) out.push(w.slice(0, -2));
	// British spellings: the norms are American.
	if (/our$/.test(w)) out.push(w.replace(/our$/, "or"));
	if (/re$/.test(w) && w.length > 4) out.push(w.replace(/re$/, "er"));
	if (/is(e|ed|es|ing)$/.test(w)) out.push(w.replace(/is(e|ed|es|ing)$/, "iz$1"));
	return out;
}
