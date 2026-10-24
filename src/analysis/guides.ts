import type { CheckKind } from "./types";

/**
 * Teaching notes for the hover card's "How to approach this" drawer. Hand-written and static:
 * nothing here is generated, and the examples are invented sentences, never the writer's own.
 * Each guide gives the principle, one or two before → after illustrations, and when to keep it.
 */
export interface Guide {
	principle: string;
	examples: [before: string, after: string][];
	keep: string;
}

/** Keys are a check kind, or "kind.shape" for checks whose fix depends on the shape found. */
export type GuideKey = CheckKind | `participle.${"before" | "after" | "fronted" | "listed"}` | `dialoguePunct.${"outside" | "mismatch"}`;

export const GUIDES: Record<GuideKey, Guide> = {
	cliche: {
		principle: "Readers have met this phrase so often that it no longer makes a picture. Say what this moment actually looked, sounded or felt like, or cut it.",
		examples: [["Her heart skipped a beat.", "Her pulse stumbled against her collar."], ["It was the calm before the storm.", "The gulls had gone quiet."]],
		keep: "In dialogue, when it's how the character talks; or when you're using it knowingly.",
	},
	redundancy: {
		principle: "Part of the phrase says again what the rest already says. Cut the marked words and reread.",
		examples: [["She shrugged her shoulders.", "She shrugged."], ["a free gift", "a gift"]],
		keep: "When the extra words are there for rhythm, or in a character's voice.",
	},
	filler: {
		principle: "Delete the word and reread. If nothing is lost, leave it out; if something is, find the exact word for it.",
		examples: [["It was really just very cold.", "It was cold."], ["She actually smiled.", "She smiled."]],
		keep: "In dialogue and close first person, where filler is part of a voice.",
	},
	qualifier: {
		principle: "A qualifier props up or softens the word beside it. Commit to the word, or replace the pair with one stronger word.",
		examples: [["a little afraid", "uneasy"], ["very tired", "spent"]],
		keep: "When the qualification is the point: a character measuring their words.",
	},
	weasel: {
		principle: "A vague amount or an unattributed claim. Replace it with the specific: a number, a name, a detail the reader can see.",
		examples: [["A lot of people came.", "The hall filled to the doors."], ["For some reason, he stayed.", "He stayed; the rain hadn't let up."]],
		keep: "When the vagueness belongs to the character, who doesn't know either.",
	},
	hedge: {
		principle: "Hedged narration tells the reader the narrator is unsure. Commit, or make the uncertainty belong to the character.",
		examples: [["Perhaps she seemed tired.", "She was tired."], ["It might have been midnight.", "He'd lost track of the hour."]],
		keep: "With an unreliable or uncertain narrator, where doubt is the texture of the voice.",
	},
	filterWord: {
		principle: "The verb puts the character between the reader and the thing. Remove the perceiver and give the reader what was perceived.",
		examples: [["She heard the door slam.", "The door slammed."], ["He felt the cold seep in.", "The cold seeped in."]],
		keep: "When the act of perceiving matters: noticing late, mishearing, straining to see.",
	},
	passive: {
		principle: "Ask who did it and put them first. The active version is usually shorter and closer.",
		examples: [["The letter was sent.", "The clerk sent the letter."], ["The door had been smashed.", "Someone had smashed the door."]],
		keep: "When the doer is unknown or unimportant, or the focus belongs on what was done to someone.",
	},
	weakVerb: {
		principle: "A long sentence held up only by \"to be\" has no engine. Find the action hiding in it and make that the verb.",
		examples: [["The house at the end of the lane was old and grey.", "The old house sagged at the end of the lane."]],
		keep: "For deliberate stillness: a sentence that should sit, not move.",
	},
	nominalization: {
		principle: "The action has been turned into a noun. Turn it back into the verb it came from.",
		examples: [["She made a decision to leave.", "She decided to leave."], ["He gave an explanation.", "He explained."]],
		keep: "When the noun is the thing being talked about (\"the decision haunted her\").",
	},
	opener: {
		principle: "Several sentences start the same way. Begin one with the action, a detail, or a clause instead.",
		examples: [["She ran. She hid. She waited.", "She ran. Behind the shed, she hid and waited."]],
		keep: "For deliberate repetition (anaphora), when the drumbeat is the effect.",
	},
	adverb: {
		principle: "Look for a verb that already contains the manner, so the adverb has nothing left to do.",
		examples: [["walked slowly", "trudged"], ["closed the door firmly", "shut the door"]],
		keep: "When no verb carries it, or the adverb is surprising (\"she smiled cruelly\").",
	},
	tagAdverb: {
		principle: "Let the line itself carry the tone, or show it in an action beat beside the line.",
		examples: [["\"Leave,\" she said angrily.", "\"Leave.\" She threw his coat at the door."]],
		keep: "When the line could be read either way and the tag settles it.",
	},
	stackedModifier: {
		principle: "Several adjectives compete for one noun. Keep the one that does the most work, or find a noun that needs none.",
		examples: [["the old, cracked, wooden door", "the cracked door"], ["a tall, thin, pale man", "a heron of a man"]],
		keep: "When each modifier adds something the others don't, and the rhythm wants all three.",
	},
	participle: {
		principle: "A verb form is describing a noun. Give the noun its own verb, choose a more exact noun, or keep the motion if it matters.",
		examples: [["the swirling fog", "the fog swirled"]],
		keep: "When the movement is the point; participles are verbs, so they keep a sentence moving.",
	},
	"participle.before": {
		principle: "A verb form sits before the noun like an adjective. Ask whether a more exact noun would carry it, or give the verb a clause of its own.",
		examples: [["the swirling fog", "the fog swirled"], ["his tired eyes", "his eyes had stopped focusing"]],
		keep: "When it's the most exact word for the thing.",
	},
	"participle.after": {
		principle: "A verb form hangs off the noun (an absolute phrase). Swapping the verb won't change the shape. Give the noun a real verb of its own, or drop the verb and let the image carry it.",
		examples: [["the fog swirling in the yard", "fog swirled in the yard"], ["the fog swirling in the yard", "fog, a grey tide in the yard"]],
		keep: "Often. Absolute phrases are a fiction staple and keep a sentence in motion.",
	},
	"participle.fronted": {
		principle: "The sentence opens with a verb form before its subject. Make that the subject's own action, or keep it as a deliberate opening.",
		examples: [["Exhausted, she sat down.", "She sank into the chair."]],
		keep: "When the state comes first in the character's experience.",
	},
	"participle.listed": {
		principle: "A verb form is listed among adjectives. Turn the list into actions, or let one detail stand.",
		examples: [["Cold, wet and shivering, she waited.", "She waited in the doorway, shivering."]],
		keep: "When the list's rhythm is the effect.",
	},
	echo: {
		principle: "The same word close by draws the ear. Keep it if it's deliberate; otherwise change one, or restructure so you need it once.",
		examples: [["The cask hissed. He fell from the cask.", "The cask hissed. He fell from it."]],
		keep: "For deliberate repetition, or when the word has no good substitute.",
	},
	metaphor: {
		principle: "A concrete word is attached to an abstract one, so this is probably a figure of speech. A fresh image can stay; a familiar one gets sharpened or becomes plain statement.",
		examples: [["a heavy heart", "grief sat on him like wet wool"], ["a heavy heart", "he was sad, and tired of it"]],
		keep: "When the image is yours and alive.",
	},
	dialoguePunct: {
		principle: "Dialogue punctuation follows fixed conventions: a comma joins a line to its speech tag, the tag stays lowercase, an action beat is its own sentence.",
		examples: [["\"Go\" she said.", "\"Go,\" she said."], ["\"Go,\" she shrugged.", "\"Go.\" She shrugged."]],
		keep: "In a deliberate house style; otherwise these are mechanical fixes.",
	},
	"dialoguePunct.outside": {
		principle: "In fiction, the comma or full stop that ends a line of dialogue sits inside the closing quote, in British and American publishing alike. Only a question or exclamation mark that belongs to the narration goes outside.",
		examples: [["\"Wait\", Mara said.", "\"Wait,\" Mara said."], ["\"It's late\".", "\"It's late.\""]],
		keep: "Quoting a word or title inside narration (She called it \"home\".) follows different rules; dialogue doesn't.",
	},
	"dialoguePunct.mismatch": {
		principle: "A line of speech opens and closes with the same mark. Pick double or single quotes for the whole book and keep to it; mixed marks make the reader stumble over where the speech ends.",
		examples: [["'Who's there?\" she called.", "\"Who's there?\" she called."]],
		keep: "A quotation inside dialogue takes the other mark: \"He said 'never', and meant it.\"",
	},
	nonSpeechTag: {
		principle: "A speech tag says how the words came out, and some verbs can't do that: nobody smiles, shrugs or nods a sentence. Make the gesture its own sentence (an action beat), or tag with \"said\" and keep the gesture.",
		examples: [["\"Fine,\" she smiled.", "\"Fine.\" She smiled."], ["\"Maybe,\" he shrugged.", "He shrugged. \"Maybe.\""]],
		keep: "Laughing or sighing a word can happen (\"Oh,\" she sighed): keep it when the sound really is the delivery.",
	},
	showyTag: {
		principle: "\"Said\" is nearly invisible, so the reader stays with the words. A showy tag points at itself, and often tells what the line should already show. Used rarely, one lands; used often, they wear thin.",
		examples: [["\"Get out,\" she hissed.", "\"Get out.\" She didn't raise her voice."], ["\"Never,\" he retorted.", "\"Never,\" he said."]],
		keep: "When the verb is literally how it sounds and nothing in the line could carry it.",
	},
	invertedTag: {
		principle: "Modern fiction usually puts the speaker before the verb: \"Mara said\", \"her father replied\". The inverted order (\"said Mara\") reads older or more formal, and with a pronoun (\"said he\") it's archaic.",
		examples: [["\"Come in,\" said Mara.", "\"Come in,\" Mara said."], ["\"No,\" replied her father.", "\"No,\" her father replied."]],
		keep: "With a long subject (\"said the man by the door\") inverting reads better; and in a period voice that wants it.",
	},
	twoSpeakers: {
		principle: "Each new speaker gets a new paragraph. It's how readers track who is talking without counting, and it lets every line land on its own.",
		examples: [["\"Ready?\" Mara asked. \"No,\" Tomas said.", "\"Ready?\" Mara asked.\n\n\"No,\" Tomas said."]],
		keep: "When one character reports what another said, within their own line.",
	},
	untaggedRun: {
		principle: "Untagged lines are fine in a quick two-person exchange, but after four or five the reader starts counting back to find out who is speaking. A tag or a small action beat every few lines keeps them anchored.",
		examples: [["(six lines of back and forth, no tags)", "(the fourth line gets a beat: Mara set her cup down. \"Then why?\")"]],
		keep: "When the voices are so distinct that nobody could lose track, or when the speed is the point.",
	},
	quotedThought: {
		principle: "Direct thought is usually set in italics without quote marks, so it can't be mistaken for speech. \"Thought to himself\" says the same thing twice: thinking is always to oneself.",
		examples: [["\"Strange,\" she thought.", "*Strange*, she thought."], ["he thought to himself", "he thought"]],
		keep: "In a house style that quotes thought, keep it consistent across the book.",
	},
};

/**
 * The online "words to try" row in a hover card: its label, and a short craft reminder shown with it
 * whichever lenses are on, so a list of alternatives never reads as an instruction to swap.
 */
export const SUGGESTION_ROWS: Partial<Record<CheckKind, { label: string; reminder: string }>> = {
	adverb: {
		label: "One verb instead",
		reminder: "Pick the verb that already moves the way the adverb says, or keep the pair if none does. The second row is every kind of the verb, so read for the one that fits.",
	},
	tagAdverb: {
		label: "One verb instead",
		reminder: "King: \"said\" is nearly invisible, and a vivid tag pulls the eye off the dialogue. Use these sparingly; often the best fix is \"said\" and a line that carries the tone.",
	},
	qualifier: {
		label: "One word instead",
		reminder: "One exact word beats an intensifier and a vague one.",
	},
	nominalization: {
		label: "As a verb",
		reminder: "Let the verb carry the action instead of a noun built from it.",
	},
	echo: {
		label: "Other words",
		reminder: "Sometimes the repeat is the point. Change one only if the echo is an accident.",
	},
};
