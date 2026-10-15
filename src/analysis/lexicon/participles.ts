// Adapted from Creative Writer by André Amancio (MIT License), https://github.com/amancioandre/creative-writer
// See THIRD_PARTY_NOTICES.md.
/** Irregular past participles that do not end in -ed/-en/-t patterns we can guess. */
export const IRREGULAR_PARTICIPLES: ReadonlySet<string> = new Set([
  "been", "begun", "bitten", "blown", "broken", "brought", "built", "bought", "caught", "chosen", "come", "cut",
  "done", "drawn", "driven", "drunk", "eaten", "fallen", "fed", "felt", "fought", "found", "flown", "forgiven",
  "forgotten", "frozen", "given", "gone", "grown", "had", "heard", "held", "hidden", "hit", "hurt", "kept",
  "known", "laid", "led", "left", "lent", "let", "lost", "made", "meant", "met", "paid", "put", "read", "ridden",
  "risen", "run", "said", "seen", "sent", "set", "shaken", "shot", "shown", "shut", "sung", "sunk", "sat", "slept",
  "spoken", "spent", "spun", "stolen", "struck", "stuck", "sworn", "swept", "swum", "taken", "taught",
  "told", "thought", "thrown", "torn", "understood", "woken", "worn", "won", "written", "bound", "bred", "cast",
  "clung", "dealt", "dug", "fled", "flung", "ground", "hung", "knelt", "lit", "slain", "slid", "sold", "sought",
  "sown", "spat", "split", "spread", "sprung", "stood", "strung", "stung", "stunk", "swung", "trodden", "wound",
  "wrung", "beaten", "bent", "bled", "burnt", "dreamt", "learnt", "leapt", "spelt", "spilt", "spoilt", "smelt",
]);

/**
 * Words ending in -ed/-en that are never participles: numbers, adverbs,
 * plain adjectives and nouns. Keeps the no-tagger shape guess honest.
 */
export const NOT_PARTICIPLES: ReadonlySet<string> = new Set([
  "seven", "eleven", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "hundred",
  "then", "even", "often", "open", "golden", "sudden", "olden", "rotten", "linen", "ashen", "sullen", "molten",
  "wooden", "woolen", "woollen", "silken", "leaden", "oaken", "earthen", "brazen", "barren", "heathen", "kitchen",
  "garden", "women", "children", "chicken", "oxygen", "heaven", "burden", "warden", "maiden", "raven", "haven",
  "oven", "token", "omen", "amen", "siren", "lichen", "hyphen", "dozen", "frozen", "listen", "happen", "open",
  "wicked", "naked", "rugged", "ragged", "crooked", "wretched", "talented", "bearded", "jagged", "sacred",
  "hundred", "hatred", "kindred", "shred", "sled", "bed", "red", "shed", "wed", "ahead", "instead", "indeed",
  "need", "seed", "weed", "speed", "creed", "greed", "reed", "feed", "bleed", "breed", "deed", "heed",
]);

/**
 * be + participle that is almost always a state adjective, not a passive.
 * "I am interested" is not "someone interests me".
 */
export const STATIVE_PARTICIPLES: ReadonlySet<string> = new Set([
  "interested", "excited", "bored", "tired", "worried", "surprised", "pleased", "satisfied", "disappointed",
  "frightened", "scared", "confused", "embarrassed", "exhausted", "relieved", "annoyed", "amused", "ashamed",
  "delighted", "devoted", "determined", "married", "engaged", "related", "involved", "concerned", "convinced",
  "prepared", "qualified", "experienced", "educated", "accustomed", "used", "supposed", "gone", "done", "finished",
  "lost", "stuck", "drunk", "dressed", "seated", "retired", "located", "situated", "crowded", "closed", "open",
  "broken", "torn", "worn", "hidden", "known", "unknown", "aged", "advanced", "armed", "blessed", "cursed",
  "damned", "beloved", "alone", "asleep", "awake", "alive", "afraid", "aware", "allowed", "obliged",
  "crooked", "rugged", "wretched", "bearded", "molten", "smitten", "shaken", "drunken", "mistaken", "forbidden",
  "unmade", "talented", "fed", "left", "set", "cut", "shut", "sunken", "swollen", "sworn", "spent", "bound",
  "pleased", "content", "settled", "fixed", "gifted", "learned", "wounded", "haunted", "deserted", "abandoned",
]);
