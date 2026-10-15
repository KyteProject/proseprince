import { echoes, participles, partOfSpeech, stackedModifiers } from "./checks";
import { maskInline } from "./mask";
import { measure } from "./rhythm";
import { mannerAdverbs } from "./rules/adverbs";
import { filterWords } from "./rules/filterWords";
import { metaphors } from "./rules/metaphor";
import { passive } from "./rules/passive";
import { nominalizations, openers, weakVerbs } from "./rules/sentences";
import { dialoguePunctuation } from "./rules/dialogue";
import { cliches, intensity, redundancies } from "./rules/wordChoice";
import { tag } from "./tagger";
import type { ParagraphResult } from "./types";

/**
 * Analyse one paragraph. Returns every highlight regardless of the user's toggles, plus
 * per-sentence rhythm data and readability totals, so results can be cached and toggles
 * applied instantly with `filterHighlights`.
 */
export function analyzeParagraph(text: string, echoWindow: number, names: readonly string[] = []): ParagraphResult {
	const masked = maskInline(text);
	const tokens = tag(masked, new Set(names));
	const words = tokens.filter((t) => t.isWord);
	const { sentences, stats } = measure(tokens);
	const clicheHits = cliches(words);
	// One finding per span: a phrase that is a cliché is not also reported as a metaphor.
	const metaphorHits = metaphors(words, tokens).filter((m) => !clicheHits.some((c) => m.from < c.to && m.to > c.from));
	return {
		highlights: [
			...partOfSpeech(tokens),
			...clicheHits,
			...redundancies(words),
			...intensity(words),
			...filterWords(words),
			...passive(words, tokens),
			...weakVerbs(words),
			...nominalizations(words),
			...openers(words),
			...mannerAdverbs(words),
			...stackedModifiers(tokens),
			...participles(tokens),
			...echoes(tokens, echoWindow),
			...metaphorHits,
			...dialoguePunctuation(masked),
		],
		sentences,
		stats,
	};
}
