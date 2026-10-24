import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeParagraph } from "../src/analysis/analyze";
import { wordInfoAt } from "../src/analysis/wordInfo";
import { pickEdits } from "../src/lookup/edit";
import { suggestForHint, usualPairings } from "../src/lookup/suggest";
import { buildUrl, definitionOf, parseWords, queryKey, synonymsOf } from "../src/lookup/datamuse";
import { LookupHistory } from "../src/lookup/history";
import { canInflect, detectForm, inflect, looksInflected, matchCase, replacementFor, syllables } from "../src/lookup/inflect";
import { rankSuggestions, uposToWordPos } from "../src/lookup/rank";
import { BACKOFF_MS, CACHE_TTL_MS, LookupError, LookupService } from "../src/lookup/service";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/datamuse/${name}.json`, import.meta.url), "utf8"));

describe("datamuse", () => {
	it("builds URLs with metadata and an optional key", () => {
		const url = new URL(buildUrl(synonymsOf("Walk")));
		expect(url.origin + url.pathname).toBe("https://api.datamuse.com/words");
		expect(url.searchParams.get("rel_syn")).toBe("walk");
		expect(url.searchParams.get("md")).toBe("dpf");
		expect(url.searchParams.has("key")).toBe(false);
		expect(new URL(buildUrl(definitionOf("walk"), " abc ")).searchParams.get("key")).toBe("abc");
		expect(new URL(buildUrl(definitionOf("walk"))).searchParams.get("max")).toBe("1");
	});

	it("keys queries independently of parameter order", () => {
		expect(queryKey({ b: "2", a: "1" })).toBe(queryKey({ a: "1", b: "2" }));
	});

	it("parses parts of speech, frequency and definitions", () => {
		const [walk] = parseWords(fixture("define-walk"));
		expect(walk?.word).toBe("walk");
		expect(walk?.pos).toEqual(["v", "n"]);
		expect(walk?.freq).toBeCloseTo(42.08, 1);
		expect(walk?.defs[0]?.pos).toBe("v");
		expect(walk?.defs[0]?.text.length).toBeGreaterThan(5);
	});

	it("skips malformed items instead of throwing", () => {
		expect(parseWords({ nope: 1 })).toEqual([]);
		expect(parseWords([null, 3, { word: 4 }, { word: "ok", tags: "x", defs: [1, "adj\tfine"] }])).toEqual([
			{ word: "ok", pos: [], freq: null, defs: [{ pos: "adj", text: "fine" }] },
		]);
	});
});

describe("rankSuggestions", () => {
	const gen = parseWords(fixture("gen-walk"));
	const syn = parseWords(fixture("syn-walk"));

	it("keeps only words in the wanted part of speech", () => {
		const words = rankSuggestions(gen, { pos: "v", exclude: ["walk"], hideRare: false, limit: 12 }).map((s) => s.word);
		expect(words).toContain("saunter");
		expect(words).toContain("stride");
		expect(words).not.toContain("walk");
	});

	it("drops multi-word junk unless it is a two-word verb", () => {
		const nouns = rankSuggestions(syn, { pos: "n", exclude: [], hideRare: false, limit: 40 }).map((s) => s.word);
		expect(nouns).not.toContain("walk of life");
		expect(nouns).not.toContain("base on balls");
	});

	it("gives each word its definition in the wanted part of speech", () => {
		const stride = rankSuggestions(gen, { pos: "v", exclude: [], hideRare: false, limit: 40 }).find((s) => s.word === "stride");
		expect(stride?.def).toBeTruthy();
	});

	it("labels or hides rare words", () => {
		const list = parseWords([{ word: "perambulate", tags: ["v", "f:0.0169"] }, { word: "amble", tags: ["v", "f:0.14"] }]);
		expect(rankSuggestions(list, { pos: "v", exclude: [], hideRare: false, limit: 5 }).map((s) => [s.word, s.rare])).toEqual([["perambulate", true], ["amble", false]]);
		expect(rankSuggestions(list, { pos: "v", exclude: [], hideRare: true, limit: 5 }).map((s) => s.word)).toEqual(["amble"]);
	});

	it("maps tagger tags to word classes", () => {
		expect(uposToWordPos("VERB")).toBe("v");
		expect(uposToWordPos("PROPN")).toBeNull();
	});
});

describe("inflect", () => {
	it.each([
		["stroll", "past", "strolled"],
		["stride", "past", "strode"],
		["stride", "pastPart", "stridden"],
		["understand", "past", "understood"],
		["stop", "ing", "stopping"],
		["travel", "past", "travelled"],
		["visit", "ing", "visiting"],
		["admit", "past", "admitted"],
		["panic", "past", "panicked"],
		["die", "ing", "dying"],
		["make", "ing", "making"],
		["see", "ing", "seeing"],
		["hurry", "s", "hurries"],
		["watch", "s", "watches"],
		["dream", "past", "dreamt"],
		["relay", "past", "relayed"],
		["walk off", "past", "walked off"],
		["wolf", "plural", "wolves"],
		["echo", "plural", "echoes"],
		["piano", "plural", "pianos"],
		["city", "plural", "cities"],
		["cold", "comparative", "colder"],
		["big", "superlative", "biggest"],
		["happy", "comparative", "happier"],
		["freezing", "comparative", "more freezing"],
		["good", "superlative", "best"],
	] as const)("%s → %s = %s", (word, form, expected) => {
		expect(inflect(word, form)).toBe(expected);
	});

	it("counts syllables roughly", () => {
		expect(syllables("stop")).toBe(1);
		expect(syllables("make")).toBe(1);
		expect(syllables("gentle")).toBe(2);
		expect(syllables("travel")).toBe(2);
	});

	it("reads the original's form", () => {
		expect(detectForm({ text: "walked", lemma: "walk", upos: "VERB", prev: "she" }, "v")).toBe("past");
		expect(detectForm({ text: "walked", lemma: "walk", upos: "VERB", prev: "had" }, "v")).toBe("pastPart");
		expect(detectForm({ text: "taken", lemma: "take", upos: "VERB", prev: "she" }, "v")).toBe("pastPart");
		expect(detectForm({ text: "walking", lemma: "walk", upos: "VERB", prev: "" }, "v")).toBe("ing");
		expect(detectForm({ text: "walks", lemma: "walk", upos: "VERB", prev: "" }, "v")).toBe("s");
		expect(detectForm({ text: "doors", lemma: "door", upos: "NOUN", prev: "" }, "n")).toBe("plural");
		expect(detectForm({ text: "colder", lemma: "cold", upos: "ADJ", prev: "" }, "adj")).toBe("comparative");
		expect(detectForm({ text: "walk", lemma: "walk", upos: "VERB", prev: "" }, "v")).toBe("base");
	});

	it("keeps case", () => {
		expect(matchCase("Walked", "strolled")).toBe("Strolled");
		expect(matchCase("WALKED", "strolled")).toBe("STROLLED");
		expect(matchCase("I", "me")).toBe("Me");
		expect(replacementFor({ text: "Walked", lemma: "walk", upos: "VERB", prev: "" }, "v", "stride")).toBe("Strode");
	});
});

describe("wordInfoAt", () => {
	it("finds the lemma, tag and previous word", () => {
		const line = "She had walked to the door.";
		const info = wordInfoAt(line, 8, 14);
		expect(info).toMatchObject({ text: "walked", lemma: "walk", upos: "VERB", prev: "had" });
	});

	it("returns null away from a word", () => {
		expect(wordInfoAt("Hello there.", 5, 6)).toBeNull();
	});
});

describe("LookupService", () => {
	const setup = (fetchJson: (url: string) => Promise<unknown>) => {
		let now = Date.parse("2026-10-15T12:00:00");
		let changes = 0;
		const service = new LookupService({ fetchJson, apiKey: () => "", now: () => now, onChange: () => changes++ });
		return { service, advance: (ms: number) => (now += ms), changes: () => changes };
	};

	it("caches answers and shares requests in flight", async () => {
		let calls = 0;
		const { service } = setup(async () => {
			calls++;
			return fixture("syn-walk");
		});
		const [a, b] = await Promise.all([service.get(synonymsOf("walk")), service.get(synonymsOf("walk"))]);
		expect(a).toBe(b);
		await service.get(synonymsOf("walk"));
		expect(calls).toBe(1);
		expect(service.requestsToday()).toBe(1);
	});

	it("expires answers after the TTL", async () => {
		let calls = 0;
		const { service, advance } = setup(async () => {
			calls++;
			return [];
		});
		await service.get(synonymsOf("walk"));
		advance(CACHE_TTL_MS + 1);
		expect(service.cached(synonymsOf("walk"))).toBeUndefined();
		await service.get(synonymsOf("walk"));
		expect(calls).toBe(2);
	});

	it("backs off after a failure and doesn't cache it", async () => {
		let fail = true;
		const { service, advance } = setup(async () => {
			if (fail) throw new Error("ENOTFOUND");
			return [];
		});
		await expect(service.get(synonymsOf("walk"))).rejects.toMatchObject({ reason: "failed" });
		fail = false;
		await expect(service.get(synonymsOf("walk"))).rejects.toBeInstanceOf(LookupError);
		advance(BACKOFF_MS + 1);
		await expect(service.get(synonymsOf("walk"))).resolves.toEqual([]);
	});

	it("saves and restores, keeping one definition per part of speech for lists", async () => {
		const { service } = setup(async () => fixture("gen-walk"));
		await service.get({ rel_gen: "walk" });
		const text = service.serialize();
		const copy = new LookupService({ fetchJson: async () => [], apiKey: () => "" });
		copy.restore(text);
		const words = copy.cached({ rel_gen: "walk" })!;
		expect(words.length).toBeGreaterThan(5);
		for (const w of words) expect(new Set(w.defs.map((d) => d.pos)).size).toBe(w.defs.length);
		copy.restore("not json");
		expect(copy.size).toBe(1);
	});
});

describe("LookupHistory", () => {
	it("counts lookups and replacements and survives a round trip", () => {
		const history = new LookupHistory(undefined, () => 1);
		history.recordLookup("Walk");
		history.recordLookup("walk");
		history.recordLookup("cold");
		history.recordPick("walked", "strolled", "lookup");
		history.recordPick("walked", "strode", "adverb");
		history.recordPick("Walked", "Strode", "lookup");
		const copy = new LookupHistory();
		copy.restore(history.serialize());
		expect(copy.topLookups(1)).toEqual([{ word: "walk", n: 2 }]);
		expect(copy.topReplaced(1)).toEqual([{ word: "walked", n: 3, chosen: ["strode", "strolled"] }]);
		expect(copy.picksBySource()).toEqual({ lookup: 2, adverb: 1 });
		expect(copy.totals()).toEqual({ lookups: 3, words: 2, picks: 3 });
	});
});

describe("lookup hints from the rules", () => {
	const hintFor = (text: string, check: string) =>
		analyzeParagraph(text, 25).highlights.find((h) => "check" in h.kind && h.kind.check === check)?.lookup;
	const apply = (text: string, hint: NonNullable<ReturnType<typeof hintFor>>, word: string) => {
		const edits = pickEdits(hint, word, (a, b) => text.slice(a, b));
		if (!edits) return null;
		let out = text;
		for (const e of [...edits].reverse()) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
		return out;
	};

	it("adverb next to its verb: one phrase, both words replaced", () => {
		const text = "She walked slowly to the door.";
		const hint = hintFor(text, "adverb")!;
		expect(hint).toMatchObject({ mode: "phrase", query: "walk slowly" });
		expect(apply(text, hint, "stroll")).toBe("She strolled to the door.");
	});

	it("adverb away from its verb: verb replaced, adverb removed", () => {
		const text = "She walked across the room slowly.";
		const hint = hintFor(text, "adverb")!;
		expect(hint.query).toBe("walk slowly");
		expect(apply(text, hint, "stroll")).toBe("She strolled across the room.");
	});

	it("fronted adverb: comma removed and the capital moved", () => {
		const text = "Slowly, she walked to the door.";
		const hint = hintFor(text, "adverb")!;
		expect(hint.query).toBe("walk slowly");
		expect(apply(text, hint, "stroll")).toBe("She strolled to the door.");
	});

	it("tag adverb: the tag and adverb become one verb", () => {
		const text = "\"Go,\" she said softly.";
		const hint = hintFor(text, "tagAdverb")!;
		expect(hint.query).toBe("say softly");
		expect(apply(text, hint, "whisper")).toBe("\"Go,\" she whispered.");
	});

	it("qualifier: the pair becomes one word, keeping a capital", () => {
		const text = "Very cold air came in.";
		const hint = hintFor(text, "qualifier")!;
		expect(hint.query).toBe("very cold");
		expect(apply(text, hint, "freezing")).toBe("Freezing air came in.");
	});

	it("nominalisation: the phrase becomes a verb in the same tense", () => {
		const text = "She made a decision to leave.";
		const hint = hintFor(text, "nominalization")!;
		expect(hint.query).toBe("make decision");
		expect(apply(text, hint, "decide")).toBe("She decided to leave.");
	});

	it("no hint where one verb would strand a word", () => {
		expect(hintFor("He made use of the knife.", "nominalization")).toBeUndefined();
	});

	it("echo: synonyms of the lemma for that one word", () => {
		const text = "The dark room had a dark door.";
		const hint = hintFor(text, "echo")!;
		expect(hint).toMatchObject({ mode: "word", query: "dark" });
		expect(apply(text, hint, "dim")).toBe("The dim room had a dark door.");
	});

	it("refuses a stale edit", () => {
		const hint = hintFor("She walked slowly to the door.", "adverb")!;
		expect(pickEdits(hint, "stroll", (a, b) => "Mae walked slowly to the door.".slice(a, b))).not.toBeNull();
		expect(pickEdits(hint, "stroll", (a, b) => "She ran slowly to the door.".slice(a, b))).toBeNull();
	});
});

describe("inflected and defective suggestions", () => {
	it("drops already-inflected verbs but keeps base forms ending the same way", () => {
		expect(looksInflected("replied")).toBe(true);
		expect(looksInflected("murmuring")).toBe(true);
		expect(looksInflected("need")).toBe(false);
		expect(looksInflected("bring")).toBe(false);
		expect(looksInflected("shed")).toBe(false);
	});

	it("won't offer a past tense for beware", () => {
		expect(canInflect("beware", "past")).toBe(false);
		expect(canInflect("beware", "base")).toBe(true);
	});
});

describe("suggestForHint", () => {
	it("offers more specific verbs whose definition uses the verb", async () => {
		const hint = analyzeParagraph("She walked slowly to the door.", 25).highlights.find((h) => h.lookup?.kinds)!.lookup!;
		const service = new LookupService({ fetchJson: async (url) => (url.includes("rel_gen=walk") ? fixture("gen-walk") : []), apiKey: () => "" });
		const { kinds } = await suggestForHint(service, hint, false);
		const words = kinds.map((s) => s.word);
		expect(words).toContain("trudge");
		expect(words).not.toContain("exhibit");
		expect(words).not.toContain("process");
	});
});

describe("usual pairings", () => {
	const service = new LookupService({ fetchJson: async (url) => (url.includes("rel_jjb=silence") ? fixture("jjb-silence") : []), apiKey: () => "" });
	const pairingIn = (text: string) => analyzeParagraph(text, 25).highlights.find((h) => h.pairing)?.pairing;

	it("knows a usual pairing from a fresh one", async () => {
		expect(await usualPairings(service, pairingIn("A dead silence fell over the room.")!)).toMatchObject({ yours: ["dead"] });
		const fresh = await usualPairings(service, pairingIn("A velvet silence fell over the room.")!);
		expect(fresh.yours).toEqual([]);
		expect(fresh.usual).toContain("profound");
	});

	it("records the noun and every modifier on stacked modifiers", () => {
		expect(pairingIn("Mara felt a hot, sick anger.")).toEqual({ noun: "anger", modifiers: ["hot", "sick"] });
	});
});
