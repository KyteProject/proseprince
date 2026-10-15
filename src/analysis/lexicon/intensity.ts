/**
 * Filler, qualifier, weasel and hedge words, curated for fiction.
 *
 * Seeded from the `fillers`, `weasels` and `hedges` lists by Titus Wormer (MIT,
 * https://github.com/words), then cut down: those lists target expository writing and
 * include words that are ordinary in narration ("again", "also", "back", "felt", "saw").
 * Perception verbs live in the filter-word check; each word here belongs to one category only.
 * See THIRD_PARTY_NOTICES.md.
 *
 * Syntax: a single word may carry a part-of-speech guard after "@" ("just@ADV" only
 * matches when tagged as an adverb). Multi-word entries match on word forms or lemmas.
 */

/** Discourse filler and empty emphasis: delete it and nothing is lost. */
export const FILLERS: readonly string[] = [
	"actually@ADV", "basically@ADV", "certainly@ADV", "clearly@ADV", "definitely@ADV", "essentially@ADV",
	"frankly@ADV", "honestly@ADV", "hopefully@ADV", "just@ADV", "literally@ADV", "obviously@ADV", "really@ADV",
	"seriously@ADV", "simply@ADV", "truly@ADV", "virtually@ADV", "practically@ADV", "absolutely@ADV",
	"ultimately@ADV", "undoubtedly@ADV", "anyway@ADV", "anyhow@ADV",
	"of course", "in fact", "needless to say", "to be honest", "as a matter of fact", "pretty much",
	"for all intents and purposes", "in actual fact", "it goes without saying",
];

/** Degree words that soften or prop up the word beside them. */
export const QUALIFIERS: readonly string[] = [
	"very@ADV", "quite@ADV", "rather@ADV", "somewhat@ADV", "slightly@ADV", "fairly@ADV", "pretty@ADV",
	"extremely@ADV", "incredibly@ADV", "awfully@ADV", "terribly@ADV", "utterly@ADV", "completely@ADV",
	"entirely@ADV", "totally@ADV", "highly@ADV", "exceedingly@ADV", "particularly@ADV", "too@ADV",
	"kind of", "sort of", "a bit", "a little", "a tad", "a touch", "more or less",
];

/** Vague quantities and unattributed claims that dodge the specific. */
export const WEASELS: readonly string[] = [
	"a lot", "lots of", "a number of", "a great deal", "a good deal", "plenty of", "the vast majority",
	"numerous@ADJ", "various@ADJ", "countless@ADJ", "several@ADJ", "many@ADJ",
	"somehow@ADV", "arguably@ADV", "reportedly@ADV", "relatively@ADV", "comparatively@ADV", "largely@ADV",
	"mostly@ADV", "mainly@ADV", "significantly@ADV", "substantially@ADV", "considerably@ADV",
	"surprisingly@ADV", "interestingly@ADV", "remarkably@ADV", "generally@ADV",
	"some kind of", "some sort of", "something like", "for some reason", "in a way", "in some ways",
	"to some extent", "to a certain extent", "to some degree", "strangely enough", "oddly enough",
	"it is said", "people say", "they say", "some say", "many believe", "experts say",
];

/** Uncertainty in the narration: commit, or make the doubt the point. */
export const HEDGES: readonly string[] = [
	"perhaps@ADV", "maybe@ADV", "possibly@ADV", "probably@ADV", "presumably@ADV", "apparently@ADV",
	"seemingly@ADV", "supposedly@ADV", "allegedly@ADV", "conceivably@ADV", "likely@ADV",
	"seem@VERB", "appear to", "appear as if", "appear as though", "appear like", "it appeared",
	"might have", "may have", "could have been", "must have been", "tend to",
	"a kind of", "a sort of", "of sorts", "in a sense", "almost as if", "as if to",
	"i think", "i guess", "i suppose", "i imagine", "i believe",
];
