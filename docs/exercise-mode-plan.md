# Plan: exercise mode

Status: first set built in 0.18.0 (2026-10-25): strict lens, `_proseprince/Exercises`, clean sequence kept. Later sets not started.

## Goal

Practise one prose skill at a time, in **separate exercise notes** (not the story). You pick an exercise. ProsePrince creates a note with the brief, then, while you write, flags **only** what breaks that exercise's rule. The sidebar shows how you're doing against it.

The writer asked for practice in four areas, in this order:
1. constructing sentences;
2. chaining them together;
3. describing things in an interesting way;
4. moving the story through action.

They also asked for imitation of a passage they admire.

Sources:
- Ursula K. Le Guin, *Steering the Craft* (2015), referred to as **LG**.
- Renni Browne and Dave King, *Self-Editing for Fiction Writers* (2nd ed.), referred to as **SE**.

The briefs are written in our own words, with chapter and page references so the writer can read the original. The books stay local (`docs/*.pdf` is in `.git/info/exclude`) and are never committed.

## How it works

- **Starting an exercise.** The command *Start exercise…* opens a list. Each entry shows the exercise's name, the skill it trains and its source.
  - **The note:** picking one creates a note in the exercise folder (default `_proseprince/Exercises/`), named for example `2026-10-25 Short and long.md`.
  - **Frontmatter:** `proseprince-exercise: short-and-long`.
  - **The brief:** a folded callout (`> [!exercise]-`) holding the brief and the source.
  - **Multi-part exercises:** one heading per part (`## Part one: short`, `## Part two: long`), so each part's rules apply to its own section.
  - **Self-check:** a `## Look back` section of Obsidian task checkboxes covering the questions only you can judge, e.g. "- [ ] Read it aloud: does it flow?". These are native tasks, so nothing new is needed to tick them.
- **Exercise lens.** In a note with `proseprince-exercise`, the usual lenses switch off. Only the exercise's own flags show, in one distinct style, each with a hover note saying which rule it breaks. "Highlights inside dialogue" doesn't apply.
- **Sidebar.**
  - **Placement:** an *Exercise* section at the top, with one row per checkable rule.
  - **Live status:** each row updates as you type, e.g. "Words 112 / 100–150 ✓" or "Every sentence ≤ 7 words: 2 over ✗", and clicking a failing rule jumps to the next breach.
  - **Count:** the share of `Look back` boxes ticked.
- **Afterwards.** LG asks you to put a piece away for a day or two, then reread it aloud. The brief ends with that, and the note gets a `written:` date. The sidebar shows "Reread from <date>" once a day has passed. No reminders or notifications.

## First set (in the agreed order)

### 1. Short and long (LG ch. 3, Ex 3, pp. 32–34): sentence construction

**Part one.**
- **Brief:** one paragraph, 100–150 words, in which every sentence has seven words or fewer. These must be real sentences, with a subject and a verb, not fragments. Suggested subject: tense action, e.g. someone slipping into a room where someone else sleeps.
- **Checks:** word count; exactly one paragraph; longest sentence ≤ 7 words; every sentence has a verb (PoS).

**Part two.**
- **Brief:** up to 350 words, all one sentence. Suggested subject: gathering emotion, or many people, e.g. a family memory around a table.
- **Checks:** ≤ 350 words; exactly one sentence end.

**Look back:** does each part fit its subject? Is the long sentence clear enough that a reader never has to start it again?

**Later variants (LG):** switch register; write the long sentence as a simple chain of *and*s and then as nested clauses; tell the same story at both lengths.

### 2. Clean sequence: chaining sentences together

Our own exercise. Neither book has one dedicated to linking sentences. It combines SE ch. 11 (actions buried in "-ing" and "as" clauses; weak verbs propped up by *-ly* adverbs) with SE ch. 12 (runs of sentences with the same shape read flat), and uses LG's "and-chain" variant as part two.

**Part one.**
- **Brief:** 150–300 words of physical action, one thing after another (making a meal under pressure, climbing out of somewhere).
  - **What to avoid:** no action held in an "-ing" or "as" clause ("Pulling off her gloves, she…"), no *-ly* adverbs, and no more than one "then".
  - **Openings:** no two neighbouring sentences start with the same word.
  - **Linking:** join the steps with verbs, commas, *and*, and the logic of cause and effect.
- **Checks:**
  - word count;
  - "-ing"/"as" action clauses, i.e. a sentence-initial participle clause, or "as" plus subject plus verb (new detection);
  - *-ly* adverbs;
  - "then" count;
  - identical neighbouring openers (the existing opener check, made strict).

**Part two.** The same sequence as one long sentence linked mainly by *and* (LG's "torrential" variant).
- **Checks:** one sentence end.

**Look back:** does each step lead into the next? Would a reader feel the speed?

### 3. Chastity (LG ch. 5, Ex 5, pp. 45–46): interesting description

LG calls this the one exercise she has used in every workshop.

- **Brief:** 200–350 words of descriptive narrative with no adjectives, no adverbs and no dialogue. Nouns and verbs have to do all the work. Adverbs of time (*then*, *later*, *next*) are allowed, sparingly.
- **Checks:**
  - word count;
  - every adjective and adverb flagged, except a short list of time adverbs, which are counted (a warning when there are more than three);
  - no quotation marks.
- **Known tagger limits:** participles and nouns used as modifiers are sometimes tagged as adjectives. The hover note on those says "tagged as an adjective; if it's a verb form or a noun here, ignore it".
- **Look back:** what did the constraint push you towards (stronger verbs, comparisons)? Would one modifier here or there help?
- **Later variant (LG):** write the next page of the story this way, but in an exercise note.

### 4. Feel it without naming it: moving the story through action

From SE ch. 1 (scenes over summary, and "resist the urge to explain") and LG ch. 9, part three (implication).

**Part one.**
- **Brief:** 200–400 words in which a character feels something strong, and the reader must know what without the narration ever naming the feeling. Use action, objects and dialogue.
- **Checks:**
  - word count;
  - emotion words in narration (a new hand-written list: *angry*, *afraid*, *relieved*, *ashamed*… and their forms);
  - filter words (*felt*, *saw*, *knew*…);
  - "was + feeling" states.
- **Look back:** what would a reader say the character feels? Ask someone, or come back in a day and check.

**Part two.**
- **Brief (LG):** 200–600 words describing the place where something happened, or will happen, without the event occurring and without naming it. Every detail should point at it.
- **Checks:** word count; no first-person narration; no quotation marks; the event's name, which you type into the frontmatter (`subject:`), never appears in the text.

### 5. Imitation: learning from a passage you admire

LG endorses deliberate imitation as practice (chs. 1 and 8).

- **Starting it:** select a passage, e.g. in the Leviathan Wakes note, and run *Start imitation exercise from selection*. The model is copied into the exercise note in a folded callout, so it stays local.
- **Brief:** write your own scene, on your own subject, with the same shape: the same number of sentences, close to the same lengths in the same order, and the same paragraph breaks.
- **Checks:** sentence count; the sidebar shows the model's sentence-length bars and yours side by side, and how closely they match; paragraph count.
- **Look back:** which of the model's moves did you notice only by copying them?

## Later sets, from the same books

- **LG Ex 9, A & B (pure dialogue):** every line starts `A:` or `B:`, with no narration.
- **LG Ex 1 (Being gorgeous):** writing for sound.
- **LG Ex 2 (Saramago):** no punctuation, 150–350 words.
- **LG Ex 4 (repetition):** at least three uses of one noticeable word.
- **LG Ex 6 (person and tense):** the same story twice, comparing pronouns and tense.
- **LG Ex 7–8 (points of view):** POV shifts.
- **LG Ex 10 (cut to half):** compares the word count against an original.
- **SE ch. 3 (one moment three ways):** first person, third person, omniscient.
- **SE ch. 8 (beats):** bare dialogue, then add at most three beats.
- **SE ch. 6 (misdirection):** a dialogue where one person never answers directly.

## Building blocks

- **`src/exercises/`** (pure, tested):
  - exercise definitions: id, title, source, skill, the brief in our own words, parts with word ranges and rules, and look-back prompts;
  - a rule engine over the cached `ParagraphResult` and tokens.
- **New detection, which also benefits the normal checks later:**
  - "-ing"/"as" action clauses;
  - emotion words in narration;
  - sentence fragments (no verb);
  - a sentence-length profile comparison.
- **The editor:** the exercise lens replaces the normal highlights in exercise notes, and violations use a new highlight style.
- **The sidebar:** the Exercise section.
- **The plugin:** the *Start exercise…* command and its picker, plus the start-from-selection command.

## Open questions

1. **Strict lens:** exercise notes show only the exercise's flags. Should the normal lenses be available behind a toggle?
2. **Folder:** `_proseprince/Exercises/` (alongside the World note), or a top-level `Exercises/` folder of your own?
3. **Exercise 2** is ours, not from the books. Is a combined "clean sequence" right, or should exercise 2 simply be LG's long-sentence variants?
