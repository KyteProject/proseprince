// Adapted from Creative Writer by André Amancio (MIT License), https://github.com/amancioandre/creative-writer
// See THIRD_PARTY_NOTICES.md.
/**
 * Figures so conventional they no longer produce an image. Matched as
 * phrases; the concreteness rule handles the novel-but-maybe-tired cases.
 *
 * Anything that is also in cliches.ts lives only there — one finding per
 * span. Physical-object idioms that are as often literal as figurative
 * ("a dead end", "a long road", "a time bomb") are left out.
 */
export const DEAD_METAPHORS: readonly string[] = [
  "an iron grip", "an iron will", "an iron fist", "a heavy heart", "a warm welcome", "a cold shoulder",
  "a cold reception", "a sweet victory", "a burning desire", "a burning question", "a crushing blow",
  "a crushing defeat", "a shattered dream", "shattered dreams", "the winds of change", "the backbone of",
  "the lifeblood of", "the cornerstone of", "the bedrock of",
  "time flies", "time marches on", "time is money", "time ran out", "running out of time", "money talks",
  "the clock is ticking", "love is blind", "love is a battlefield", "life is a journey", "life is a highway",
  "life is a rollercoaster", "an emotional rollercoaster", "seething with", "simmering with",
  "fanned the flames of", "added fuel to the fire", "fuel to the fire",
  "a mountain to climb", "an uphill battle", "an uphill struggle", "a turning point", "a window of opportunity",
  "a golden opportunity", "a silver bullet", "a magic bullet", "a two-edged sword", "a house of cards",
  "a dream come true", "a living hell", "hell on earth", "heaven on earth", "a slice of heaven", "a ray of sunshine",
  "a thorn in the side", "an albatross around", "a millstone around", "an anchor around",
  "low-hanging fruit", "move the needle", "the bottom line", "a level playing field", "think outside the box",
  "on the same page", "a red flag", "a game changer", "a piece of cake", "the glass ceiling",
];

/**
 * Open-ended figures — "a flood of …", "steeped in …" — that are dead only
 * when the complement is abstract ("a flood of memories") and plainly
 * literal otherwise ("a flood of water"). The rule gates these on the
 * concreteness of the noun that follows.
 */
export const DEAD_METAPHORS_OPEN: readonly string[] = [
  "a flood of", "a wave of", "a sea of", "a mountain of", "a river of", "an ocean of", "a torrent of", "a storm of",
  "a blanket of", "a curtain of", "a wall of", "a web of", "a tangle of", "a cloud of", "a spark of",
  "a flame of", "a fire of", "a glimmer of", "a flicker of", "a flash of", "a ray of", "a beam of", "a shaft of",
  "the tide of", "the sands of", "the fabric of", "the seeds of", "the roots of", "the fruits of",
  "the pillar of", "the anchor of", "the machinery of", "the wheels of", "the gears of", "the gateway to",
  "the dawn of", "the twilight of", "the grave of", "the ghost of", "the teeth of", "the jaws of", "the clutches of",
  "the chains of", "the shackles of", "the prison of", "the cage of", "the trap of", "the net of", "the maze of",
  "the labyrinth of", "the armour of", "the armor of", "the shield of", "the sword of", "the blade of",
  "the knife of", "the poison of", "the cancer of", "the disease of", "the plague of", "the virus of",
  "the medicine of", "the balm of", "the salve of", "the hunger for", "the thirst for", "the appetite for",
  "the rhythm of", "the melody of", "the harmony of", "the whisper of", "the roar of", "the thunder of",
  "the calm of", "the stillness of", "a rollercoaster of",
  "cloaked in", "shrouded in", "steeped in", "soaked in", "dripping with", "oozing with", "bursting with",
  "brimming with", "overflowing with", "bubbling with", "boiling with", "crackling with", "humming with",
  "buzzing with", "laden with", "pregnant with", "ripe with", "riddled with",
];
