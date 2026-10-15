import type { WordInfo, WordPos } from "./types";

/**
 * Re-inflect a thesaurus suggestion (which Datamuse gives in its base form) to match the word it
 * replaces: "walked" + stroll → "strolled", "doors" + gate → "gates". British spellings throughout
 * (travelled, dreamt). When a form can't be worked out, the base form is used rather than a guess.
 */
export type Form = "base" | "s" | "past" | "pastPart" | "ing" | "plural" | "comparative" | "superlative";

// base past participle. British forms where they differ (dreamt, got, dived).
const IRREGULAR_VERBS = `
arise arose arisen|awake awoke awoken|be was been|bear bore borne|beat beat beaten|become became become
begin began begun|bend bent bent|bet bet bet|bid bid bid|bind bound bound|bite bit bitten|bleed bled bled
blow blew blown|break broke broken|breed bred bred|bring brought brought|broadcast broadcast broadcast
build built built|burn burnt burnt|burst burst burst|buy bought bought|cast cast cast|catch caught caught
choose chose chosen|cling clung clung|come came come|cost cost cost|creep crept crept|cut cut cut
deal dealt dealt|dig dug dug|dive dived dived|do did done|draw drew drawn|dream dreamt dreamt|drink drank drunk
drive drove driven|dwell dwelt dwelt|eat ate eaten|fall fell fallen|feed fed fed|feel felt felt|fight fought fought
find found found|flee fled fled|fling flung flung|fly flew flown|forbid forbade forbidden|forsake forsook forsaken
freeze froze frozen|get got got|give gave given|go went gone|grind ground ground|grow grew grown|hang hung hung
have had had|hear heard heard|hew hewed hewn|hide hid hidden|hit hit hit|hold held held|hurt hurt hurt
keep kept kept|kneel knelt knelt|knit knitted knitted|know knew known|lay laid laid|lead led led|lean leant leant
leap leapt leapt|learn learnt learnt|leave left left|lend lent lent|let let let|lie lay lain|light lit lit
lose lost lost|make made made|mean meant meant|meet met met|pay paid paid|plead pleaded pleaded|put put put
quit quit quit|read read read|rend rent rent|rid rid rid|ride rode ridden|ring rang rung|rise rose risen
run ran run|saw sawed sawn|say said said|see saw seen|seek sought sought|sell sold sold|send sent sent
set set set|sew sewed sewn|shake shook shaken|shear sheared shorn|shed shed shed|shine shone shone
shoot shot shot|show showed shown|shrink shrank shrunk|shut shut shut|sing sang sung|sink sank sunk|sit sat sat
slay slew slain|sleep slept slept|slide slid slid|sling slung slung|slink slunk slunk|slit slit slit
smell smelt smelt|smite smote smitten|sow sowed sown|speak spoke spoken|speed sped sped|spell spelt spelt
spend spent spent|spill spilt spilt|spin spun spun|spit spat spat|split split split|spoil spoilt spoilt
spread spread spread|spring sprang sprung|stand stood stood|steal stole stolen|stick stuck stuck|sting stung stung
stink stank stunk|stride strode stridden|strike struck struck|string strung strung|strive strove striven
swear swore sworn|sweep swept swept|swell swelled swollen|swim swam swum|swing swung swung|take took taken
teach taught taught|tear tore torn|tell told told|think thought thought|throw threw thrown|thrust thrust thrust
tread trod trodden|wake woke woken|wear wore worn|weave wove woven|weep wept wept|wet wet wet|win won won
wind wound wound|wring wrung wrung|write wrote written`;

const VERBS = new Map<string, [string, string]>();
for (const entry of IRREGULAR_VERBS.split(/[|\n]/)) {
	const [base, past, part] = entry.trim().split(" ");
	if (base && past && part) VERBS.set(base, [past, part]);
}
// "understand" = under + stand, "forgive" = for + give, "rebuild" = re + build.
const PREFIXES = ["under", "over", "with", "fore", "for", "mis", "out", "re", "un", "up", "be"];
const NOT_PREFIXED = new Set(["relay", "repay", "reset", "bewail", "befit"]);

function irregularVerb(base: string): [string, string] | null {
	const direct = VERBS.get(base);
	if (direct) return direct;
	if (NOT_PREFIXED.has(base)) return null;
	for (const p of PREFIXES) {
		if (!base.startsWith(p)) continue;
		const forms = VERBS.get(base.slice(p.length));
		if (forms && base.length - p.length >= 2) return [p + forms[0], p + forms[1]];
	}
	return null;
}

const IRREGULAR_PLURALS: Record<string, string> = {
	man: "men", woman: "women", child: "children", foot: "feet", tooth: "teeth", goose: "geese", mouse: "mice",
	louse: "lice", person: "people", ox: "oxen", leaf: "leaves", knife: "knives", wife: "wives", life: "lives",
	wolf: "wolves", half: "halves", shelf: "shelves", thief: "thieves", loaf: "loaves", calf: "calves",
	sheaf: "sheaves", self: "selves", elf: "elves", scarf: "scarves", hoof: "hooves", sheep: "sheep",
	deer: "deer", fish: "fish", swine: "swine", crisis: "crises", phenomenon: "phenomena", criterion: "criteria",
};
const O_ES = new Set(["echo", "hero", "potato", "tomato", "torpedo", "veto", "embargo", "volcano", "domino", "mosquito"]);
const IRREGULAR_ADJ: Record<string, [string, string]> = {
	good: ["better", "best"], well: ["better", "best"], bad: ["worse", "worst"], ill: ["worse", "worst"],
	far: ["further", "furthest"], little: ["less", "least"], much: ["more", "most"], many: ["more", "most"],
};
// Stress on the last syllable, so the final consonant doubles (admitted, preferred).
const STRESS_FINAL = new Set([
	"abhor", "acquit", "admit", "commit", "compel", "confer", "defer", "deter", "dispel", "distil", "emit",
	"enrol", "equip", "excel", "expel", "fulfil", "impel", "incur", "infer", "instil", "occur", "omit",
	"outwit", "patrol", "permit", "prefer", "propel", "rebel", "recur", "refer", "regret", "repel", "submit",
	"transfer", "transmit", "control", "extol",
]);
// British English doubles the l even when unstressed (travelled, dialled, fuelled).
const DOUBLE_L = new Set(["dial", "fuel", "duel", "trial", "vial"]);
const PARTICIPLE_CUES = new Set(["have", "has", "had", "having", "'ve", "'d", "been", "be", "being", "was", "were", "is", "are", "am", "'s", "'re", "get", "got", "gets", "getting"]);


export function syllables(word: string): number {
	const w = word.toLowerCase().replace(/[^a-z]/g, "");
	if (!w) return 0;
	const trimmed = w.replace(/(?<=[^aeiouy])e$/, "").replace(/^y/, "");
	const groups = trimmed.match(/[aeiouy]+/g)?.length ?? 0;
	return Math.max(1, groups + (/[^aeiouy]le$/.test(w) ? 1 : 0));
}

/** stop → stopp(ed), travel → travell(ed); visit, open and appeal stay as they are. */
function doubles(word: string): boolean {
	if (STRESS_FINAL.has(word) || DOUBLE_L.has(word)) return true;
	const w = word.replace(/qu/g, "q");
	if (!/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) return false;
	if (syllables(w) === 1) return true;
	return w.endsWith("l");
}

function addEd(w: string): string {
	if (w.endsWith("e")) return `${w}d`;
	if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ied`;
	if (/[^aeiou]ic$/.test(w) && syllables(w) > 1) return `${w}ked`;
	return doubles(w) ? `${w}${w.at(-1)}ed` : `${w}ed`;
}

function addIng(w: string): string {
	if (w === "be") return "being";
	if (w.endsWith("ie")) return `${w.slice(0, -2)}ying`;
	if (/(ee|oe|ye)$/.test(w)) return `${w}ing`;
	if (w.endsWith("e") && w.length > 2) return `${w.slice(0, -1)}ing`;
	if (/[^aeiou]ic$/.test(w) && syllables(w) > 1) return `${w}king`;
	return doubles(w) ? `${w}${w.at(-1)}ing` : `${w}ing`;
}

function addS(w: string, noun: boolean): string {
	if (!noun && w === "be") return "is";
	if (!noun && w === "have") return "has";
	if (/(s|x|z|ch|sh)$/.test(w)) return `${w}es`;
	if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`;
	if (/[^aeiou]o$/.test(w) && (!noun || O_ES.has(w))) return `${w}es`;
	return `${w}s`;
}

function compare(w: string, superlative: boolean): string {
	const irregular = IRREGULAR_ADJ[w];
	if (irregular) return irregular[superlative ? 1 : 0];
	const n = syllables(w);
	const short = n === 1 || (n === 2 && /(y|le|ow|er)$/.test(w));
	if (!short) return `${superlative ? "most" : "more"} ${w}`;
	const end = superlative ? "est" : "er";
	if (w.endsWith("e")) return `${w}${end.slice(1)}`;
	if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}i${end}`;
	if (n === 1 && /[^aeiou][aeiou][^aeiouwxy]$/.test(w)) return `${w}${w.at(-1)}${end}`;
	return `${w}${end}`;
}

/** Inflect one word. */
function inflectWord(w: string, form: Form): string {
	switch (form) {
		case "base":
			return w;
		case "s":
			return addS(w, false);
		case "plural":
			return IRREGULAR_PLURALS[w] ?? addS(w, true);
		case "past":
			return irregularVerb(w)?.[0] ?? addEd(w);
		case "pastPart":
			return irregularVerb(w)?.[1] ?? addEd(w);
		case "ing":
			return addIng(w);
		case "comparative":
			return compare(w, false);
		case "superlative":
			return compare(w, true);
	}
}

/** Inflect a suggestion. In a two-word verb ("walk off") the verb is inflected; in a compound noun, the last word. */
export function inflect(suggestion: string, form: Form): string {
	const parts = suggestion.toLowerCase().split(" ");
	if (form === "plural") parts[parts.length - 1] = inflectWord(parts[parts.length - 1]!, form);
	else if (form === "comparative" || form === "superlative") return parts.length === 1 ? inflectWord(parts[0]!, form) : suggestion;
	else parts[0] = inflectWord(parts[0]!, form);
	return parts.join(" ");
}

/** Which form the original word is in, from its surface text, lemma and part of speech. */
export function detectForm(info: WordInfo, pos: WordPos | null): Form {
	const surface = info.text.toLowerCase();
	const lemma = info.lemma.toLowerCase();
	if (!pos || surface === lemma) return "base";
	if (pos === "v") {
		if (surface.endsWith("ing")) return "ing";
		const irregular = irregularVerb(lemma);
		const cue = PARTICIPLE_CUES.has(info.prev.toLowerCase());
		if (irregular) {
			const [past, part] = irregular;
			if (surface === past && surface === part) return cue ? "pastPart" : "past";
			if (surface === part) return "pastPart";
			if (surface === past) return "past";
		}
		if (surface.endsWith("ed")) return cue ? "pastPart" : "past";
		if (surface.endsWith("s")) return "s";
		return "base";
	}
	if (pos === "n") return "plural";
	if (pos === "adj" || pos === "adv") {
		const irregular = IRREGULAR_ADJ[lemma];
		if (irregular?.[0] === surface || surface.endsWith("er")) return "comparative";
		if (irregular?.[1] === surface || surface.endsWith("est")) return "superlative";
	}
	return "base";
}

// Verbs with no past or -ing form of their own.
const DEFECTIVE = new Set(["beware", "must", "ought", "shall", "should", "may", "might", "can", "could", "will", "would"]);

/** Whether `word` can take `form`: "beware" has no past tense, so it can't replace "watched". */
export function canInflect(word: string, form: Form): boolean {
	return form === "base" || !DEFECTIVE.has(word.toLowerCase().split(" ")[0]!);
}

const BASE_ING = /^(bring|sing|ring|string|sting|swing|fling|cling|sling|wring|spring|ding|ping|zing|wing)$/;
const BASE_ED = /(eed|^shed|^wed|^shred|^embed|^bed|^sled)$/;

/**
 * Datamuse's "means like" answers sometimes come already inflected ("replied", "murmuring"); as verbs
 * they would be inflected twice. Base forms that happen to end that way (bring, need) are kept.
 */
export function looksInflected(word: string): boolean {
	const w = word.toLowerCase().split(" ")[0]!;
	if (w.endsWith("ing")) return w.length > 5 && !BASE_ING.test(w);
	if (w.endsWith("ed")) return w.length > 4 && !BASE_ED.test(w);
	return false;
}

/** Keep the original's case: "Walked" → "Strolled", "WALKED" → "STROLLED". */
export function matchCase(original: string, replacement: string): string {
	if (original.length > 1 && /\p{Lu}/u.test(original) && original === original.toUpperCase()) return replacement.toUpperCase();
	if (/^\p{Lu}/u.test(original)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
	return replacement;
}

/** The text that replaces `info` when the writer picks `suggestion`. */
export function replacementFor(info: WordInfo, pos: WordPos | null, suggestion: string): string {
	return matchCase(info.text, inflect(suggestion, detectForm(info, pos)));
}
