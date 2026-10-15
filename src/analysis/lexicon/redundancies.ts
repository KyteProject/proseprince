/**
 * Redundant phrases, written for ProsePrince. Square brackets mark the words to cut;
 * "<poss>" stands for any possessive (his, her, their, my, your, its, our). Matching is on
 * word forms or lemmas, so "attached together" matches "attach [together]".
 */
export const REDUNDANCIES: readonly string[] = [
	// modifier already implied by the noun
	"[absolutely] essential", "[absolutely] certain", "[actual] facts", "[added] bonus", "[extra] bonus",
	"[advance] planning", "[advance] warning", "[basic] fundamentals", "[basic] essentials", "[brief] moment",
	"[brief] summary", "[close] proximity", "[current] trend", "[end] result", "[false] pretense",
	"[false] pretence", "[final] outcome", "[final] conclusion", "[foreign] import", "[free] gift",
	"[frozen] ice", "[future] plans", "[joint] collaboration", "[mutual] cooperation", "[new] innovation",
	"[natural] instinct", "[old] adage", "[old] cliché", "[past] history", "[past] experience",
	"[past] memories", "[personal] opinion", "[safe] haven", "[sudden] impulse", "[sum] total",
	"[true] facts", "[unexpected] surprise", "[unintended] mistake", "[usual] custom", "[very] unique",
	"[necessary] requirement", "[necessary] prerequisite", "[hollow] tube", "[dead] corpse",
	"[lonely] hermit", "[each and] every", "[first and] foremost", "[true and] accurate",
	"[twelve] noon", "[twelve] midnight", "[completely] destroyed", "[completely] finished",
	"[completely] surrounded", "[completely] unanimous", "[exact] same", "same [exact]",
	// verb already contains the direction or the togetherness
	"ascend [up]", "advance [forward]", "collect [together]", "descend [down]", "rise [up]", "lift [up]", "raise [up]", "fall [down]", "kneel [down]",
	"plummet [down]", "attach [together]", "blend [together]", "collaborate [together]",
	"combine [together]", "connect [together]", "cooperate [together]", "gather [together]",
	"huddle [together]", "join [together]", "meet [together]", "merge [together]", "mix [together]",
	"unite [together]", "share [together]", "follow [after]", "enter [in]", "circle [around]",
	"orbit [around]", "reflect [back]", "refer [back]", "retreat [back]", "return [back]", "revert [back]",
	"reply [back]", "respond [back]", "regress [back]", "recur [again]", "reiterate [again]",
	"repeat [again]", "restate [again]", "resume [again]", "proceed [ahead]", "plan [ahead]",
	"plan [in advance]", "warn [in advance]", "postpone [until later]", "may [possibly]", "might [possibly]",
	"[still] persists", "[still] remains", "surround [on all sides]", "visible [to the eye]",
	// the body part is already in the verb
	"shrug [<poss> shoulders]", "nod [<poss> head]", "blink [<poss> eyes]", "clap [<poss> hands]",
	"wink [<poss> eye]", "nape [of <poss> neck]", "nape [of the neck]",
	// the manner is already in the verb (a classic of dialogue tags)
	"whisper [quietly]", "whisper [softly]", "shout [loudly]", "yell [loudly]", "scream [loudly]",
	"murmur [softly]", "tiptoe [quietly]", "sprint [quickly]", "rush [quickly]", "hurry [quickly]",
	"stride [purposefully]", "gulp [down]", "glare [angrily]", "grin [happily]", "smile [happily]",
	"sob [sadly]", "beg [pleadingly]",
	// measure words that restate the adjective
	"few [in number]", "round [in shape]", "square [in shape]", "large [in size]", "small [in size]",
	"red [in color]", "red [in colour]", "heavy [in weight]", "a [period of] time", "[time] period",
	"reason [why]", "the reason is [because]", "at this [point in] time", "[from] whence",
	"cash [money]", "tuna [fish]", "ATM [machine]", "PIN [number]", "LCD [display]", "HIV [virus]",
	"[please] RSVP", "and so on [and so forth]",
];
