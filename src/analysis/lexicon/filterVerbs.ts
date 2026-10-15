// Adapted from Creative Writer by André Amancio (MIT License), https://github.com/amancioandre/creative-writer
// See THIRD_PARTY_NOTICES.md.
/**
 * POV filter verbs — perception/cognition verbs that put the narrator
 * between the reader and the experience ("she saw the door open" → "the
 * door opened"). Each entry has a note the tooltip will display.
 *
 * "seemed"/"seems" are handled by the hedge check in ProsePrince.
 */
export interface FilterEntry {
  readonly phrase: string;
  readonly note: string;
}

const f = (phrase: string, note: string): FilterEntry => ({ phrase, note });
const each = (phrases: string[], note: string): FilterEntry[] => phrases.map((p) => f(p, note));

export const FILTER_VERBS: readonly FilterEntry[] = [
  // sight
  f("saw", "Filter verb. Render what was seen, not the seeing: \"she saw the door open\" → \"the door opened\"."),
  ...each(["see", "sees", "seeing"], "Filter verb. Render what is seen directly."),
  ...each(["could see", "can see"], "Filter verb. \"She could see the road\" → \"The road ran on ahead.\""),
  ...each(["watched", "watches", "watching"], "Filter verb. Render what was watched directly."),
  ...each(["noticed", "notices", "noticing"], "Filter verb. Render what was noticed directly."),
  f("observed", "Filter verb. Render what was observed directly."),
  f("spotted", "Filter verb. Render what was spotted directly."),
  ...each(["looked at", "glanced at", "stared at", "gazed at"], "Filter verb. What did the eyes find? Give the reader that instead of the looking."),
  ...each(["caught sight of", "caught a glimpse of"], "Filter verb. Show the thing, not the glimpse."),
  // sound
  ...each(["heard", "hears", "hearing"], "Filter verb. Render the sound: \"she heard a crash\" → \"something crashed\"."),
  f("hear", "Filter verb. Render the sound directly."),
  ...each(["could hear", "can hear"], "Filter verb. \"He could hear rain\" → \"Rain ticked on the glass.\""),
  f("listened", "Filter verb. Render the sound directly."),
  // touch, smell, taste
  ...each(["felt", "feels", "feeling"], "Filter verb. Render the sensation: \"she felt cold\" → \"the cold got into her bones\"."),
  f("feel", "Filter verb. Render the sensation directly."),
  ...each(["could feel", "can feel", "could smell", "could taste"], "Filter verb. Render the sensation directly."),
  f("smelled", "Filter verb. Render the smell directly."),
  f("tasted", "Filter verb. Render the taste directly."),
  f("sensed", "Filter verb. Render it — or show what was sensed through a concrete detail."),
  ...each(["was aware of", "became aware of"], "Filter verb. Give the reader the thing itself, not the awareness of it."),
  // cognition
  ...each(["realized", "realised", "realizes", "realises", "realizing", "realising"], "Filter verb. Render the realisation's content, not the act of realising."),
  ...each(["knew", "knows", "knowing"], "Filter verb. State the fact in the narrator's voice."),
  ...each(["thought", "thinks", "thinking"], "Filter verb. In close POV the narration already is thought."),
  ...each(["wondered", "wonders", "wondering"], "Filter verb. Ask the question directly in free indirect style."),
  ...each(["decided", "decides"], "Filter verb. Show the action that follows the decision."),
  ...each(["remembered", "remembers", "remembering", "recalled", "recalls"], "Filter verb. Drop into the memory directly."),
  f("experienced", "Filter verb. Render the experience."),
  ...each(["understood", "believed", "hoped", "feared", "imagined", "perceived", "supposed", "figured", "guessed"], "Filter verb. In close POV, say the thing the character believes as narration."),
  ...each(["found herself", "found himself", "found myself", "found themselves"], "Crutch. \"She found herself walking\" → \"She walked\"."),
];
