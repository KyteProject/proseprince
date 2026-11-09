/**
 * Practice exercises, one skill at a time, written in our own words. The sources are named so the
 * writer can read the original: Ursula K. Le Guin, *Steering the Craft* (2015), and Renni Browne
 * & Dave King, *Self-Editing for Fiction Writers* (2nd ed.). No text from either book is included.
 */

export type Rule =
	| { kind: "words"; min?: number; max?: number }
	| { kind: "paragraphs"; max: number }
	| { kind: "sentences"; exactly: number }
	| { kind: "maxSentenceWords"; max: number }
	| { kind: "noFragments" }
	| { kind: "noModifiers"; allow: string[]; allowMax: number }
	| { kind: "noDialogue" }
	| { kind: "noLyAdverbs" }
	| { kind: "noActionClauses" }
	| { kind: "maxWord"; word: string; max: number }
	| { kind: "noSameOpeners" }
	| { kind: "noNamedEmotions" }
	| { kind: "noFilterWords" }
	| { kind: "noFirstPerson" }
	| { kind: "subjectUnnamed" }
	| { kind: "matchModel" };

export interface ExercisePart {
	/** The heading this part's writing goes under, e.g. "Part one: short". */
	heading: string;
	/** What to write, in a sentence or two. */
	brief: string;
	rules: Rule[];
}

export interface Exercise {
	id: string;
	title: string;
	/** The skill it trains, in a line: shown in the picker. */
	skill: string;
	source: string;
	/** Before the parts: what the exercise is for. */
	intro: string;
	parts: ExercisePart[];
	/** Questions only the writer can answer, as checkboxes under "Look back". */
	lookBack: string[];
	/** Needs a passage to imitate (started from a selection). */
	needsModel?: boolean;
	/** Asks for a `subject:` in the frontmatter (the thing never to name). */
	needsSubject?: boolean;
}

/** Time adverbs Le Guin allows in Chastity, sparingly. */
export const TIME_ADVERBS = ["then", "next", "later", "now", "soon", "afterwards", "afterward", "again", "once", "today", "tomorrow", "yesterday", "already", "still", "before", "after", "meanwhile"];

export const EXERCISES: Exercise[] = [
	{
		id: "short-and-long",
		title: "Short and long",
		skill: "Building sentences: control length and syntax",
		source: "Le Guin, Steering the Craft, ch. 3, exercise 3 (pp. 32–34)",
		intro: "Two pieces at opposite extremes, to feel what sentence length does to pace and feeling.",
		parts: [
			{
				heading: "Part one: short",
				brief: "One paragraph of 100 to 150 words in which no sentence is longer than seven words. Each must be a real sentence with a subject and a verb, not a fragment. Short sentences can still use long words. Try something tense: someone slipping into a room where another person sleeps.",
				rules: [{ kind: "words", min: 100, max: 150 }, { kind: "paragraphs", max: 1 }, { kind: "maxSentenceWords", max: 7 }, { kind: "noFragments" }],
			},
			{
				heading: "Part two: long",
				brief: "Up to 350 words, all in one sentence. Keep it clear enough that a reader never has to start again. Try something that gathers: many people, or a feeling building, such as a family memory around a table.",
				rules: [{ kind: "words", max: 350 }, { kind: "sentences", exactly: 1 }],
			},
		],
		lookBack: [
			"Does each part's sentence length suit what's happening in it?",
			"Read the long sentence aloud: did you ever lose the thread?",
			"Was the constraint enjoyable, maddening, or eye-opening? What did it make you do that you wouldn't normally?",
		],
	},
	{
		id: "clean-sequence",
		title: "Clean sequence",
		skill: "Chaining sentences: one action leading into the next",
		source: "ProsePrince, after Self-Editing for Fiction Writers chs. 11–12 and Le Guin's long-sentence variant (Steering the Craft, ch. 3)",
		intro: "A run of physical actions, each with its own verb, each handing on to the next. No props: no -ing or \"as\" clauses, no -ly adverbs, no \"then\" doing the linking.",
		parts: [
			{
				heading: "Part one: step by step",
				brief: "150 to 300 words of one thing after another: making a meal under pressure, climbing out of somewhere, getting a door open in the dark. Give every action its own verb. No action tucked into an -ing or \"as\" clause, no -ly adverbs, \"then\" at most once, and no two sentences in a row starting with the same word. Link the steps with verbs, commas, \"and\", and cause and effect.",
				rules: [{ kind: "words", min: 150, max: 300 }, { kind: "noActionClauses" }, { kind: "noLyAdverbs" }, { kind: "maxWord", word: "then", max: 1 }, { kind: "noSameOpeners" }],
			},
			{
				heading: "Part two: one breath",
				brief: "The same sequence again as one long sentence, joined mostly by \"and\", so it runs like a single breath.",
				rules: [{ kind: "sentences", exactly: 1 }, { kind: "noActionClauses" }],
			},
		],
		lookBack: [
			"Does each sentence lead into the next, or do some just sit beside each other?",
			"Read part one aloud: where does the speed drop, and why?",
			"Which version suits the action better, the steps or the single breath?",
		],
	},
	{
		id: "chastity",
		title: "Chastity",
		skill: "Description: let nouns and verbs do the work",
		source: "Le Guin, Steering the Craft, ch. 5, exercise 5 (pp. 45–46)",
		intro: "Le Guin's favourite: a vivid scene with no adjectives or adverbs at all, so every noun and verb has to earn its place.",
		parts: [
			{
				heading: "Your scene",
				brief: "200 to 350 words of narrative description with no adjectives, no adverbs and no dialogue. Adverbs of time (then, next, later) are allowed, sparingly. Make it vivid with nouns and verbs alone.",
				rules: [{ kind: "words", min: 200, max: 350 }, { kind: "noModifiers", allow: TIME_ADVERBS, allowMax: 3 }, { kind: "noDialogue" }],
			},
		],
		lookBack: [
			"What did the constraint push you towards: stronger verbs, more exact nouns, comparisons?",
			"Is there one place where a single adjective would genuinely help? Which, and why?",
		],
	},
	{
		id: "feel-without-naming",
		title: "Feel it without naming it",
		skill: "Moving the story through action, not explanation",
		source: "Self-Editing for Fiction Writers, ch. 1 (show and tell), and Le Guin, Steering the Craft, ch. 9, exercise 9 part three (pp. 111–113)",
		intro: "The reader should know what's felt, and what happened, without the narration ever saying so.",
		needsSubject: true,
		parts: [
			{
				heading: "Part one: the feeling",
				brief: "200 to 400 words in which a character feels something strong, and a reader would know exactly what, but the narration never names the feeling. Use what they do, what they handle, what they say. No filter words (she felt, she saw).",
				rules: [{ kind: "words", min: 200, max: 400 }, { kind: "noNamedEmotions" }, { kind: "noFilterWords" }],
			},
			{
				heading: "Part two: the place",
				brief: "200 to 600 words describing the place where something happened, or is about to, without the event appearing and without naming it. Every detail should point at it. Put the event in the frontmatter's subject: field (one or two words), and it must never appear in the text. No narrator saying \"I\", no dialogue.",
				rules: [{ kind: "words", min: 200, max: 600 }, { kind: "subjectUnnamed" }, { kind: "noFirstPerson" }, { kind: "noDialogue" }],
			},
		],
		lookBack: [
			"Ask someone (or yourself, tomorrow): what does the character feel? Did they get it?",
			"What did the place in part two tell a reader without saying it?",
			"Which detail did the most work?",
		],
	},
	{
		id: "imitation",
		title: "Imitation",
		skill: "Learning a writer's moves by copying their shapes",
		source: "Le Guin endorses deliberate imitation as practice (Steering the Craft, chs. 1 and 8)",
		intro: "Write your own scene, about anything, in the shape of a passage you admire: the same number of sentences, close to the same lengths in the same order, the same paragraph breaks.",
		needsModel: true,
		parts: [
			{
				heading: "Your version",
				brief: "Your own subject, the model's shape. Match its sentences one by one: a short one where it's short, a long one where it runs.",
				rules: [{ kind: "matchModel" }],
			},
		],
		lookBack: [
			"Which of the writer's moves did you only notice by copying them?",
			"Where did their shape fight your material, and what did you do?",
		],
	},
];

export const exerciseById = (id: string) => EXERCISES.find((e) => e.id === id);

/** The note a new exercise starts as: frontmatter, the brief folded away, a heading per part, Look back. */
export function exerciseNote(e: Exercise, today: string, model?: string): string {
	const fm = ["---", `proseprince-exercise: ${e.id}`, `written: ${today}`, ...(e.needsSubject ? ["subject: "] : []), "---", ""];
	const brief = [`> [!exercise]- ${e.title}: ${e.skill}`, `> ${e.intro}`, ">", ...e.parts.flatMap((p) => [`> **${p.heading}.** ${p.brief}`, ">"]), `> *Source: ${e.source}.*`, ">", "> When you're roughly done, put it away for a day or two, then reread it aloud before you tick the boxes at the end.", ""];
	const modelBlock = model ? ["> [!model]- The passage to imitate", ...model.trim().split("\n").map((l) => `> ${l}`), ""] : [];
	const parts = e.parts.flatMap((p) => [`## ${p.heading}`, "", "", ""]);
	const look = ["## Look back", "", ...e.lookBack.map((q) => `- [ ] ${q}`), ""];
	return [...fm, ...brief, ...modelBlock, ...parts, ...look].join("\n");
}
