/**
 * Small word lists used by the original ProsePrince checks. Larger lexicons live in ./lexicon.
 */

/** Lexicalised -ed/-ing words that are not participles. */
export const NOT_PARTICIPLES = new Set([
	"naked", "wicked", "sacred", "rugged", "ragged", "crooked", "jagged", "wretched",
	"kindred", "hundred", "beloved", "dogged", "learned", "aged", "blessed", "cursed",
	"something", "nothing", "anything", "everything", "morning", "evening", "during",
]);

/** Possessive determiners, which wink tags as PRON. */
export const POSSESSIVES = new Set(["my", "your", "his", "her", "its", "our", "their", "whose"]);

/** Lemmas too common to count as echoes. */
export const ECHO_STOP_LEMMAS = new Set([
	"be", "have", "do", "say", "get", "go", "make", "can", "will", "would", "could",
	"should", "may", "might", "must", "shall", "not", "there", "then", "than", "so",
	"also", "just", "very", "now", "only", "even", "back", "out", "up", "down", "one",
]);
