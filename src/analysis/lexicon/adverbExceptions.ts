// Adapted from Creative Writer by André Amancio (MIT License), https://github.com/amancioandre/creative-writer
// See THIRD_PARTY_NOTICES.md.
/** Words ending in -ly that are not adverbs (or are adverbs worth leaving alone). */
export const LY_NOT_ADVERB: ReadonlySet<string> = new Set([
  // adjectives / nouns
  "family", "italy", "july", "ally", "belly", "bully", "jelly", "lily", "rally", "tally", "folly", "holly", "jolly",
  "silly", "ugly", "friendly", "unfriendly", "lonely", "lovely", "deadly", "lively", "elderly", "orderly", "disorderly",
  "daily", "weekly", "monthly", "yearly", "nightly", "hourly", "early", "butterfly", "dragonfly", "firefly", "assembly",
  "anomaly", "melancholy", "monopoly", "supply", "reply", "apply", "imply", "comply", "multiply", "rely", "bodily",
  "burly", "curly", "surly", "wily", "oily", "holy", "unholy", "ghastly", "ghostly", "goodly", "godly",
  "heavenly", "earthly", "worldly", "otherworldly", "manly", "womanly", "motherly", "fatherly", "brotherly", "sisterly",
  "kingly", "queenly", "princely", "knightly", "beastly", "cowardly", "miserly", "scholarly", "leisurely", "timely",
  "untimely", "costly", "homely", "comely", "seemly", "unseemly", "sickly", "prickly", "crinkly", "wrinkly", "sparkly",
  "bubbly", "cuddly", "giggly", "wobbly", "woolly", "chilly", "hilly", "frilly", "smelly", "shapely", "stately",
  "likely", "unlikely", "only", "lowly", "measly", "grisly", "gnarly", "pearly", "portly", "steely", "unruly",
  "fly", "sly", "ply", "gully", "sully", "dolly", "molly", "polly", "sally", "dally",
  "bristly", "deathly", "grizzly", "kindly", "gentlemanly", "neighbourly", "neighborly", "masterly", "saintly", "priestly",
  "courtly", "sprightly", "sightly", "unsightly", "ungainly", "crumbly", "pebbly", "straggly", "doily", "telly",
  "emily", "billy", "kelly", "willy", "nelly", "lilly", "dilly", "filly", "tilly", "wally", "golly", "trolly",
]);

/** Adverbs that are structural (degree, frequency, stance) rather than manner — not style problems. */
export const STRUCTURAL_ADVERBS: ReadonlySet<string> = new Set([
  "only", "really", "early", "likely", "unlikely", "namely", "merely", "barely", "hardly", "nearly", "mostly",
  "partly", "mainly", "largely", "usually", "finally", "especially", "particularly", "generally", "possibly",
  "probably", "exactly", "recently", "currently", "previously", "eventually", "immediately", "originally",
  "ultimately", "apparently", "presumably", "supposedly", "formerly", "lately", "firstly", "secondly", "thirdly",
  "lastly", "hopefully", "thankfully", "admittedly", "reportedly", "allegedly",
  // stance, degree, frequency, sequence — no verb replaces these; the filler ones are Harper's job
  "suddenly", "basically", "honestly", "frankly", "obviously", "certainly", "clearly", "surely", "fortunately",
  "unfortunately", "luckily", "sadly", "surprisingly", "interestingly", "ironically", "naturally", "actually",
  "seriously", "literally", "similarly", "consequently", "accordingly", "additionally", "alternatively",
  "incidentally", "specifically", "essentially", "absolutely", "totally", "completely", "entirely", "extremely",
  "fairly", "relatively", "simply", "truly", "definitely", "undoubtedly", "roughly", "approximately", "fully",
  "rarely", "occasionally", "frequently", "constantly", "normally", "typically", "initially", "subsequently",
  "highly", "deeply", "directly", "overly", "utterly", "wholly", "scarcely", "terribly", "awfully", "horribly",
  "dreadfully", "incredibly", "virtually", "practically", "technically", "officially", "personally", "arguably",
  "evidently", "notably", "ideally", "theoretically", "strictly", "purely",
]);

/** Dialogue tags: an adverb immediately after one of these is the Tom Swifty pattern. */
export const DIALOGUE_TAGS: ReadonlySet<string> = new Set([
  "said", "says", "asked", "asks", "replied", "replies", "answered", "whispered", "shouted", "muttered", "murmured",
  "cried", "called", "yelled", "screamed", "hissed", "growled", "snapped", "sighed", "laughed", "added", "continued",
  "repeated", "demanded", "insisted", "admitted", "agreed", "argued", "begged", "breathed", "declared", "exclaimed",
  "explained", "grumbled", "mumbled", "noted", "observed", "offered", "ordered", "pleaded", "prompted", "protested",
  "remarked", "responded", "retorted", "snarled", "sobbed", "spat", "stammered", "stated", "suggested", "told",
  "urged", "warned", "wondered", "countered", "conceded", "croaked", "drawled", "gasped", "groaned", "moaned",
  "purred", "rasped", "scoffed", "sneered", "snorted", "squeaked", "wailed", "whined", "whimpered",
  "spoke", "barked", "uttered", "announced", "commented", "questioned", "interrupted", "confessed", "promised",
  "teased", "chuckled", "giggled", "shrieked", "bellowed", "blurted", "hollered", "quipped", "ventured", "lied",
  "chided", "intoned", "echoed", "finished", "began",
]);
