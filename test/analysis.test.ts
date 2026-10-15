import { describe, expect, it } from "vitest";
import { analyzeParagraph } from "../src/analysis/analyze";
import { filterHighlights } from "../src/analysis/filter";
import { dialogueRanges, excludedBlocks, maskInline } from "../src/analysis/mask";
import { looksLikeNameTitle, namesIn, namesInText } from "../src/analysis/names";
import { tag } from "../src/analysis/tagger";
import { parseWorld, properNounWords } from "../src/analysis/world";
import type { CheckKind, Highlight } from "../src/analysis/types";

const texts = (text: string, highlights: Highlight[], check: CheckKind) =>
	highlights.filter((h) => "check" in h.kind && h.kind.check === check).map((h) => text.slice(h.from, h.to));

const run = (text: string, check: CheckKind, echoWindow = 25) => texts(text, analyzeParagraph(text, echoWindow).highlights, check);

describe("maskInline", () => {
	it("keeps length and blanks markup", () => {
		const input = "# Title with _emphasis_ and **bold**, a [[Note|alias]] and `code`.";
		const masked = maskInline(input);
		expect(masked).toHaveLength(input.length);
		expect(masked).not.toMatch(/[#_*`[\]|]/);
		expect(masked).toContain("emphasis");
		expect(masked).toContain("alias");
		expect(masked).not.toContain("Note");
		expect(masked).not.toContain("code");
	});

	it("leaves snake_case and apostrophes alone", () => {
		expect(maskInline("my_var isn't markup")).toBe("my_var isn't markup");
	});

	it("blanks suppression comments", () => {
		expect(maskInline("She smiled. %% not cliche %%").trim()).toBe("She smiled.");
	});
});

describe("excludedBlocks", () => {
	it("finds frontmatter and fenced code spanning blank lines", () => {
		const doc = "---\ntitle: x\n---\nProse.\n\n```\ncode\n\nmore code\n```\nMore prose.";
		const blocks = excludedBlocks(doc).map((r) => doc.slice(r.from, r.to));
		expect(blocks).toEqual(["---\ntitle: x\n---", "```\ncode\n\nmore code\n```"]);
	});
});

describe("dialogueRanges", () => {
	it("handles straight and curly quotes", () => {
		const text = `"Hi," she said. “Bye.”`;
		expect(dialogueRanges(text).map((r) => text.slice(r.from, r.to))).toEqual([`"Hi,"`, "“Bye.”"]);
	});
});

describe("clichés", () => {
	it("matches phrases, including inflected verbs", () => {
		expect(run("At the end of the day, he bit the bullet.", "cliche")).toEqual(["At the end of the day", "bit the bullet"]);
		expect(run("She was biting the bullet again.", "cliche")).toEqual(["biting the bullet"]);
	});
	it("matches across punctuation and possessive splits", () => {
		expect(run("It was all in a day's work.", "cliche")).toEqual(["all in a day's work"]);
	});
	it("leaves literal text alone", () => {
		expect(run("He bit into the apple.", "cliche")).toEqual([]);
	});
});

describe("redundancies", () => {
	it("highlights only the words to cut", () => {
		expect(run("They got a free gift and an added bonus.", "redundancy")).toEqual(["free", "added"]);
		expect(run("Enter your PIN number at the ATM machine.", "redundancy")).toEqual(["number", "machine"]);
	});
	it("matches inflected verbs and possessives", () => {
		expect(run("He shrugged his shoulders and the pieces were attached together.", "redundancy")).toEqual(["his shoulders", "together"]);
		expect(run('"Go," she whispered softly.', "redundancy")).toEqual(["softly"]);
	});
});

describe("filler, qualifiers, weasels, hedges", () => {
	it("catches back-to-back words that iwl.me's regex missed", () => {
		const text = "It was really just very good.";
		expect(run(text, "filler")).toEqual(["really", "just"]);
		expect(run(text, "qualifier")).toEqual(["very"]);
	});
	it("handles multi-word qualifiers but not literal uses", () => {
		expect(run("She was kind of tired and a little cold.", "qualifier")).toEqual(["kind of", "a little"]);
		expect(run("He was the kind of man who kept a little dog.", "qualifier")).toEqual([]);
	});
	it("flags weasel words and hedges in narration", () => {
		expect(run("A lot of people came, for some reason.", "weasel")).toEqual(["A lot", "for some reason"]);
		expect(run("Perhaps she seemed tired.", "hedge")).toEqual(["Perhaps", "seemed"]);
	});
	it("leaves dialogue alone", () => {
		const text = `"I think it's really, kind of, perhaps fine," she said.`;
		for (const kind of ["filler", "qualifier", "hedge"] as const) expect(run(text, kind)).toEqual([]);
	});
});

describe("filter words", () => {
	it("flags perception verbs in narration", () => {
		expect(run("Mara felt a hot anger. She saw the door open and heard it slam.", "filterWord")).toEqual(["felt", "saw", "heard"]);
		expect(run("She could see the road.", "filterWord")).toEqual(["could see"]);
	});
	it("applies Creative Writer's guards", () => {
		expect(run(`"I think we should go," she said. The thought passed.`, "filterWord")).toEqual([]);
		expect(run("He knew the town. The soup smelled of garlic.", "filterWord")).toEqual([]);
		expect(run("He turned to take a final look at the body.", "filterWord")).toEqual([]);
		expect(run("He knew that it was over.", "filterWord")).toEqual(["knew"]);
	});
});

describe("passive voice", () => {
	it("flags passives, with or without an agent", () => {
		expect(run("The letter was sent by the clerk.", "passive")).toEqual(["was sent"]);
		expect(run("The window had been smashed.", "passive")).toEqual(["had been smashed"]);
		expect(run("The door had been closed.", "passive")).toEqual([]); // stative: "the door was closed"
		expect(run("Her thoughts were interrupted.", "passive")).toEqual(["were interrupted"]);
	});
	it("ignores states and names", () => {
		expect(run("She was tired. He was Helen's brother. It wasn't open.", "passive")).toEqual([]);
	});
	it("allows a negation between the parts", () => {
		expect(run("The bill wasn't paid.", "passive")).toEqual(["wasn't paid"]);
	});
});

describe("adverbs", () => {
	it("flags -ly manner adverbs but not stance adverbs", () => {
		expect(run("She walked slowly. Suddenly it rained.", "adverb")).toEqual(["slowly"]);
	});
	it("gives dialogue-tag adverbs their own kind", () => {
		const text = `"Leave," she said angrily.`;
		expect(run(text, "tagAdverb")).toEqual(["angrily"]);
		expect(run(text, "adverb")).toEqual([]);
		expect(run(`Lazily she replied, "Oh, he..."`, "tagAdverb")).toEqual(["Lazily"]);
	});
});

describe("sentence checks", () => {
	it("flags runs of identical openers", () => {
		expect(run("She ran. She hid. She waited. She slept.", "opener")).toEqual(["She", "She"]);
	});
	it("flags long sentences carried only by 'to be'", () => {
		expect(run("The house at the end of the long and winding lane by the river was old and grey and empty.", "weakVerb")).toEqual(["was"]);
		expect(run("The sky was red.", "weakVerb")).toEqual([]);
	});
	it("flags nominalisations", () => {
		expect(run("She made a decision to leave.", "nominalization")).toEqual(["made a decision"]);
		expect(run("He had a mission.", "nominalization")).toEqual([]);
	});
});

describe("stacked modifiers", () => {
	it("flags two or more adjectives on one noun", () => {
		expect(run("She wiped the silky green liquid from the old, cracked step.", "stackedModifier")).toEqual(["silky green", "old, cracked"]);
	});
	it("counts participles wink tags as verbs", () => {
		expect(run("He wore a battered brown hat.", "stackedModifier")).toEqual(["battered brown"]);
	});
	it("leaves single and predicate adjectives alone", () => {
		expect(run("The green door opened.", "stackedModifier")).toEqual([]);
		expect(run("She was cold, wet and tired.", "stackedModifier")).toEqual([]);
	});
});

describe("participles", () => {
	it("flags -ed/-ing forms before a noun", () => {
		expect(run("A hot anger stabbed at his frayed mind and disjointed thoughts.", "participle")).toEqual(["frayed", "disjointed"]);
	});
	it("ignores ordinary verbs and lexicalised adjectives", () => {
		expect(run("She walked home. The naked tree swayed.", "participle")).toEqual([]);
	});
	it("catches hyphenated, trailing, fronted and listed forms", () => {
		expect(run("Disjointed thoughts and half-formed questions came.", "participle")).toEqual(["Disjointed", "half-formed"]);
		expect(run("Steam hid the fog swirling in his head.", "participle")).toEqual(["swirling"]);
		expect(run("Shin felt hatred lapping at his mind.", "participle")).toEqual(["lapping"]);
		expect(run("Repulsed, he toppled out.", "participle")).toEqual(["Repulsed"]);
		expect(run("Wet, naked and panting, she stood.", "participle")).toEqual(["panting"]);
	});
	it("names its shape so the right guide opens", () => {
		const text = "He looked away, eyes descending in an elevator to hell.";
		const h = analyzeParagraph(text, 25).highlights.find((x) => "check" in x.kind && x.kind.check === "participle")!;
		expect(text.slice(h.from, h.to)).toBe("descending");
		expect(h.guide).toBe("participle.after");
		expect(h.note).toContain("Any verb in this slot has the same shape");
	});
	it("leaves -ing forms that take an object alone", () => {
		expect(run("He fell from the cask letting out a scream.", "participle")).toEqual([]);
		expect(run("Steam engulfed everything, mimicking the fog.", "participle")).toEqual([]);
	});
});

describe("echoes", () => {
	it("flags a word repeated within the window, by lemma", () => {
		expect(run("The cask hissed. He fell from the cask and saw casks everywhere.", "echo")).toEqual(["cask", "cask", "casks"]);
	});
	it("respects the window size", () => {
		expect(run("The cask hissed. Steam rose, thick and grey, over stones and puddles. He left the cask.", "echo", 3)).toEqual([]);
	});
});

describe("metaphors", () => {
	it("flags dead metaphors and concrete-on-abstract pairings", () => {
		expect(run("He had a heavy heart.", "metaphor")).toEqual(["a heavy heart"]);
		expect(run("A torrent of grief followed.", "metaphor")).toEqual(["A torrent of grief"]);
		expect(run("A velvet silence settled.", "metaphor")).toEqual(["velvet silence"]);
	});
	it("leaves literal phrases alone", () => {
		expect(run("A flood of water filled the cellar.", "metaphor")).toEqual([]);
	});
	it("never pairs across punctuation or past a pronoun subject", () => {
		expect(run("He half cried, half moaned.", "metaphor")).toEqual([]);
		expect(run("Numb to his exposure he walked past.", "metaphor")).toEqual([]);
	});
	it("flags 'a concrete of abstract' figures and ignores measures", () => {
		const text = "A lance of panic signalled the return of sensation, a gust of clarity cleared his mind.";
		expect(run(text, "metaphor")).toEqual(["A lance of panic", "a gust of clarity", "cleared his mind"]);
		expect(run("She gave him a piece of advice and a cup of tea, a sign of hope.", "metaphor")).toEqual([]);
	});
	it("defers to the cliché check on the same span", () => {
		const text = "A flood of memories came back.";
		expect(run(text, "cliche")).toEqual(["A flood of memories"]);
		expect(run(text, "metaphor")).toEqual([]);
	});
});

describe("dialogue punctuation", () => {
	const notes = (text: string) => analyzeParagraph(text, 25).highlights.filter((h) => "check" in h.kind && h.kind.check === "dialoguePunct").map((h) => `${text.slice(h.from, h.to)}: ${h.note!.split(":")[0]}`);
	it("flags a missing comma before a tag", () => {
		expect(notes(`"Well... that's new" she mused, eyebrow cocked.`)).toEqual([`": Missing comma inside the closing quote before the speech tag`]);
	});
	it("flags a full stop or capital where a tag joins its line", () => {
		expect(notes(`"Go." she said.`)).toEqual([`.: A speech tag joins its line with a comma, not a full stop`]);
		expect(notes(`"Go," She said.`)).toEqual([`She: The speech tag continues the sentence, so it starts lowercase`]);
	});
	it("flags ?\". endings, lowercase lines after a tag and two-dot ellipses", () => {
		expect(notes(`His father called out, "what about the boy?".`)).toEqual([`.: Drop the full stop`, `w: Dialogue after a speech tag starts with a capital`]);
		expect(notes(`_What..? Where..?_ he thought.`)).toEqual(["..: An ellipsis has three dots (or the … character)", "..: An ellipsis has three dots (or the … character)"]);
	});
	it("flags a tag split from its line", () => {
		expect(notes("As she reached the threshold his father called out")).toEqual(["called out: This paragraph ends on a speech tag"]);
	});
	it("stays quiet on correct dialogue, beats, interrupted lines and scare quotes", () => {
		for (const ok of [
			`"Go," she said. "Now."`,
			`"We're done here." She flicked the fluid from her feet.`,
			`"I was," she said, "going to."`,
			`She had a "friend" she trusted.`,
			`"What about the boy?" he called.`,
			`"I-I can't," he said. "The man who forced—"`,
			`"...we're done here," she cut.`,
		]) expect(notes(ok)).toEqual([]);
	});
});

describe("sentence-initial tagging", () => {
	it("does not read capitalised openers as names", async () => {
		const { highlights } = analyzeParagraph("Slender arms held him. Wet, he shivered. Shin felt it. White flashed.", 25);
		const tagged = (pos: string) => highlights.filter((h) => "pos" in h.kind && h.kind.pos === pos).map((h) => h.from);
		const text = "Slender arms held him. Wet, he shivered. Shin felt it. White flashed.";
		expect(tagged("ADJ").map((f) => text.slice(f, text.indexOf(" ", f)))).toEqual(["Slender", "Wet,"]);
		expect(tagged("PROPN").map((f) => text.slice(f, f + 4))).toEqual(["Shin"]);
	});
});

describe("names", () => {
	const posOf = (text: string, names: string[] = []) => tag(text, new Set(names)).filter((t) => t.isWord).map((t) => `${t.text}/${t.pos}`).join(" ");
	it("finds names evidenced mid-sentence", () => {
		expect([...namesInText("White stood up. The inspector turned to White, then Hope. I nodded. \"Go,\" She said.")]).toEqual(["White", "Hope"]);
	});
	it("tags known names as proper nouns wherever they appear capitalised", () => {
		expect(posOf("White stood up.", ["White"])).toBe("White/PROPN stood/VERB up/ADP");
		expect(posOf("She smiled at Hope.", ["Hope"])).toContain("Hope/PROPN");
		expect(posOf("The wall was white.", ["White"])).toContain("white/ADJ");
	});
	it("keeps names out of the echo check", () => {
		const text = "White stood up. The inspector turned to White. White said nothing.";
		expect(texts(text, analyzeParagraph(text, 25, ["White"]).highlights, "echo")).toEqual([]);
		expect(texts(text, analyzeParagraph(text, 25).highlights, "echo")).toEqual(["White", "White"]);
	});
	it("matches names as whole words", () => {
		expect(namesIn("Whitecliff and White.", ["White", "Grey"])).toEqual(["White"]);
		expect(namesIn("Whitecliff only.", ["White"])).toEqual([]);
	});
	it("only treats name-like note titles as names", () => {
		expect(looksLikeNameTitle("Eufemie Kanda")).toBe(true);
		expect(looksLikeNameTitle("20.16 The Mother is called Eufemie or Effie")).toBe(false);
	});
});

describe("world note", () => {
	const world = parseWorld(`---
tags: [world]
---
# World

Some intro text that is not an entry.

## Names
- Eufemie | Effie: Shin's mother
- [[20.1 The Survivor|Shin]]
- White

## Places
- the Farm — where the processing happens

## Terms
- crop, precursor
- the processing

## Other notes
- ignored
`);
	it("reads entries, aliases, links and notes", () => {
		expect([...world.names]).toEqual(["Eufemie", "Effie", "Shin", "White"]);
		expect([...world.places]).toEqual(["the Farm"]);
		expect([...world.terms]).toEqual(["crop", "precursor", "the processing"]);
	});
	it("splits multi-word entries into proper-noun words", () => {
		expect([...properNounWords(["the Farm", "Effie Kanda", "The Mother"])]).toEqual(["Farm", "Effie", "Kanda", "Mother"]);
	});
});

describe("rhythm and stats", () => {
	it("measures sentences and dialogue", () => {
		const text = `She ran. "Wait for me, please," he called, but the long road had already swallowed her.`;
		const { sentences, stats } = analyzeParagraph(text, 25);
		expect(sentences.map((s) => s.words)).toEqual([2, 14]);
		expect(sentences[1]!.effectiveLength).toBeGreaterThan(sentences[0]!.effectiveLength);
		expect(stats.words).toBe(16);
		expect(stats.dialogueWords).toBe(4);
	});
});

describe("offsets", () => {
	it("map back onto the original Markdown", () => {
		const text = "_Don't look_, Mara **thought**, and she felt sick.";
		const { highlights } = analyzeParagraph(text, 25);
		for (const h of highlights) expect(text.slice(h.from, h.to)).toMatch(/^[\p{L}\p{N}'’ ,]+$/u);
		expect(texts(text, highlights, "filterWord")).toEqual(["thought", "felt"]);
	});
});

describe("filterHighlights", () => {
	it("applies toggles without re-analysis", () => {
		const text = "She felt very cold.";
		const all = analyzeParagraph(text, 25).highlights;
		const onlyQualifiers = filterHighlights(all, { pos: {}, checks: { qualifier: true }, echoWindow: 25 });
		expect(onlyQualifiers.map((h) => text.slice(h.from, h.to))).toEqual(["very"]);
	});
});
