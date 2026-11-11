# ProsePrince

## Warning: This is a 100% LLM generated tool for personal use

Fiction-focused prose highlighting for Obsidian, offline by default: no server, and no network calls unless you switch on the optional [word lookups](#word-lookups-optional-online).

It is meant to sit **after** a grammar checker. Let [Harper](https://writewithharper.com/docs/integrations/obsidian) (offline) or a self-hosted LanguageTool handle spelling and grammar with underlines; ProsePrince uses text colour and background tints so the two layers don't clash. (Harper's own filler, hedge and "boring word" lints cover a handful of words; ProsePrince's lists are far larger and tuned for fiction.)

## What it highlights

**Craft checks** (background tint; hover for a note and a "Not … here" button):

| Group | Checks |
|---|---|
| Word choice | **Clichés** (about 1,600, matched in any tense: "bit / biting the bullet"), **redundancies** (only the words to cut are marked: *free* gift, shrugged *his shoulders*), **filler** (actually, just, literally), **qualifiers** (very, rather, a little), **weasel words** (a lot, various, somehow), **hedges** (perhaps, seemed, might have) |
| Viewpoint and voice | **Filter words** (she saw, he felt, could hear), **passive voice** (states like "was tired" are left alone), **manner adverbs**, **dialogue-tag adverbs** ("she said softly", "Lazily she replied") |
| Sentences | **Weak verbs** (long sentences carried only by "to be"), **nominalisations** (made a decision → decided), **repeated openers** |
| Modifiers | **Stacked modifiers** (the silky green liquid), **verb forms as adjectives** (his frayed mind) |
| Repetition and imagery | **Echoes** (same word, any form, within a window), **metaphor candidates** (dead metaphors; concrete words on abstract ones, e.g. "velvet silence") |
| Dialogue | **Tags that can't speak** ("Fine," she smiled), **showy tags** (hissed, scoffed: a hint), **inverted tags** ("said Linh", "replied his father"; a long subject may invert), **two speakers in a paragraph**, **long untagged runs** (every fifth line with no tag or beat), **thought conventions** (thought in quote marks, "thought to himself"). **Dialogue punctuation**: commas and full stops outside the quotes, mismatched quote marks ('What?"), and mechanical slips: a missing comma before a tag (`"…new" she mused`), a full stop or capital where a tag joins its line, `?".` endings, two-dot ellipses, a speech tag split from its line across paragraphs |

Filler, qualifiers, weasels, hedges, filter words, passives and adverbs are checked in narration only; dialogue is a character's voice.

**Parts of speech** (text colour, iA Writer style): adjectives, adverbs, nouns, proper nouns, pronouns, numerals, verbs, auxiliaries, conjunctions.

**Sentence rhythm**: each sentence tinted cool → warm by its felt length (words, plus commas, plus surplus syllables), in 4–6 bands, for the paragraph at the cursor or the whole screen.

**Readability** in the status bar: reading ease and sentence variety for the paragraph at the cursor; hover for the whole note, grade level and dialogue share.

**Lenses** stack: switch on as many as you like from the status-bar menu, the settings tab or the `Lens: toggle …` commands, and each adds its highlights. Settings lists exactly what each lens turns on.

| Lens | Turns on |
|---|---|
| **Style checks** | Every word-choice, voice, sentence and dialogue check |
| **King lens** (after *On Writing*) | Adverbs oozing red, dialogue-tag adverbs, passive voice, qualifiers, filler, tags that can't speak, showy tags |
| **Le Guin lens** (after *Steering the Craft*) | Sentence rhythm, adjectives, adverbs, qualifiers, stacked modifiers, verb forms as adjectives, echoes, repeated openers |
| **Parts of speech** | Every part of speech in its own colour |
| **Rhythm** | Sentence-length tints |
| **Dialogue** | Speakers in colour (underlines), narration faded, and every dialogue check |

Below the lenses, every part of speech and check has its own toggle showing the combined result and where it comes from ("On via King lens"). Flipping one overrides the lenses for that item only ("Your change", with a reset button); "Reset your changes" clears them all.

## Dialogue

**Highlights inside dialogue** are off by default: characters don't talk like Le Guin, so craft and part-of-speech highlights inside quoted speech and thought are hidden (dialogue punctuation and tag adverbs still show). Switch them on for an edit pass from the status-bar menu, the *Toggle highlights inside dialogue* command, or settings.

The **Dialogue lens** shows who is speaking. Each line is underlined in its speaker's colour, guesses dotted grey, thought dashed, and narration fades (toggle *Dim narration*). The speaker comes from, in order:

1. your pin: a hidden `%% speaker: Linh %%` comment in the paragraph;
2. a tag: "Linh said", "said Linh", "the inspector said", "replied his father" (described speakers count);
3. an action beat: the narration has exactly one person doing something ("Linh set down his cup.");
4. turn-taking: in a two-person exchange an untagged line goes to whoever spoke before the last line. This is a guess, so it's dotted; it reaches back two narration paragraphs and resets at headings and scene breaks (`***`).

Each line counts as its own turn, so a conversation written one speaker per line, without blank lines between, works too. "She said" is resolved from the scene: when the narration names one person and carries on with "she" ("Shaddid leaned back. She looked tired."), *she* means Shaddid until the next scene break or a long stretch of narration; and in a he/she exchange, once one pronoun is known the other is the other person. Otherwise it takes the turn-taking answer. With only one named speaker, untagged lines alternate between them and the unnamed other. A paragraph that tags two people leaves its untagged lines unattributed.

Hover a line for who and why, to pin a speaker, or to mark quotes as *Not speech*. Titles are dropped ("Captain Shaddid" is Shaddid). Aliases count as one speaker, described ones too: `- Eufemie | Effie` or `- Shaddid | the captain` in the World note, or a character note's `aliases`. Each speaker keeps the same colour as the cast grows (six colours, none of them red), and `colour: #hex` on a character note sets one by hand.

**Voices.** Hovering a line also shows that speaker in this note ("Linh in this note: 14 lines (3 guessed) · 6.2 words a line · 30% of the dialogue"). The *Dialogue: voices in this note* command opens a table per speaker: lines, words, words per line, how often they ask or exclaim, their share of the talk, and "their words": the words they lean on more than everyone else (a weighted log-odds comparison, common words left out; with a chapter's worth of lines it's a lean, not proof). Below it, the scene's **shape**: one mark per line, coloured by speaker, faint for narration, with the longest stretch of narration without dialogue (or dialogue without narration) when it runs to eight lines or more. Click a mark to go there. It all reads the note only.

## Outline sidebar

The ribbon's scroll icon (or *Open outline sidebar*) opens an outline for the note you're editing, in the right sidebar. It draws at once when you switch notes (issues, dialogue and rhythm fill in as the rest of the note is analysed) and updates as you pause typing. Each section folds away:

- **Scene**: `summary`, `status`, `pov`, `setting`, `day` and `characters` from the note's frontmatter.
- **This note**: words, characters (with spaces), paragraphs, sentences, reading time and dialogue share, counting prose only: no frontmatter, `%% … %%` comments or pins, code, headings or callouts. Below them, four style figures for narration: average words per sentence (hover for the median and the share over 25 words), the share of adjectives and of *-ly* adverbs, and the share of nouns that are concrete (things you could see or touch, from the bundled concreteness norms). They're descriptive, for comparing your own beats and drafts, not scores; beat hovers show the same figures per beat. Reading ease, grade and rhythm underneath. With `target: 2500` in the frontmatter, a progress bar; and the words added since you opened the note this session.
- **Beats**: a single `#` heading is the title and every other heading is a beat (indented by level). Each beat is a jump link with its word count, its issues, and a bar showing its length against the longest beat with the dialogue part darker. A beat can carry its own word target in a hidden comment under its heading:

  ```
  ## Breakfast Bar
  %%Beat.
  target: 450
  who: Linh, Ruoi
  change: Linh lets her in
  %%
  ```

  Its bar then shows progress towards the target (orange once past it), the count reads "312 / 450", and the `change:` note shows on hover. `who:` (everyone present, speaking or not) shows under the beat as a prompt, each name marked: ● speaks, ○ named but silent, dotted orange when listed but not named in the beat yet; descriptions ("Unnamed partner") aren't checked, and anyone who speaks without being listed shows as "+Name". The beat at the cursor is highlighted.

  `who:` helps the Dialogue lens too: names listed there count as names throughout the note, the speaker card offers them as pins first, and in a scene with exactly two people an untagged line that alternates away from one of them is attributed to the other (still a dotted guess).
- **Annotations**: your own marks in the note, counted by kind, each row walking through its places: notes to file (`> [!note]`), questions (`> [!question]` and `#openloop`), todos and claims to check (`> [!todo]`, `check:`), fix-later boxes (`- [ ]` in the prose), stumbles (`==highlight==` or `@@`) and placeholders left in the prose (`[FIX: …]`, `[world name]`). Below them, what has already been handled: `%% filed → [[note]] %%` and `%% checked → [[note]] %%`.
- **Sentence rhythm**: one bar per sentence (or per small group in a long chapter), by felt length, cool to warm; click to go there.
- **Issues**: counts per check, grouped as in settings, following your lenses (switch to *All checks* for an edit pass). Click a check to walk through its occurrences.
- **Dialogue**: speakers with their colour, lines and share (hover for more; click to walk through their lines), how many lines are certain, guessed or unclear, long untagged runs, and the voices window.
- **Repeated words**: the note's most used nouns, verbs, adjectives and adverbs (names and world terms left out), each a button that walks through its uses.

## Story view

*Open story view* (or the button at the foot of the outline) opens the whole book in the right sidebar. Everything in it is derived from your notes: nothing is detected, and nothing in a note is changed.

**What counts as the book.** A note in your prose folders named `chapter.scene` is a scene: `04.02 - Breakfast Bar` is scene 2 of chapter 4, and the numbers are the reading order. A note numbered `.00` is that chapter's outline: `04.00 - The Job`. Other notes in the prose folders are left out. (With no prose folders set, a note must also say `type: draft` or `type: chapter`.)

**A chapter outline** is a plan with no prose: a card, and one heading per beat, each with the same hidden card the sidebar already reads. A link under a beat attaches a scene to it:

```
# The Job
%%Card.
Chapter shape: Lie first, then stack.
%%

## Breakfast Bar
%%Beat.
target: 400
who: Linh, Ruoi, Chef
change: Ruoi talks of leaving
%%
[[04.02 - Breakfast Bar]]
```

With the cursor in a beat, **Create scene from beat** makes the next numbered scene file from your scene template (set in settings; a plain one is built in), fills `pov` from the chapter and `characters` from the beat's `who:` line, and adds the link under the beat. A beat with no link reads "not drafted"; a scene named after a beat attaches to it without a link; any other scene of the chapter is listed as not in the outline. In the chapter note itself, the outline's Beats section counts each beat's scenes instead of its own words.

**In a scene**, the outline's Scene section shows its beat from the chapter note (the card, and words against the beat's target), so the plan sits beside the prose instead of above it, along with the promises the scene makes, moves on or pays.

**Book.** Chapters in order; under each, its beats and their scenes. A scene row shows its words (against its `target`, or its beat's), the three passes (`dev`, `line`, `continuity` in the properties: filled once dated), and how many annotations are left to clear. Hover for the summary, who is in it and the breakdown; click to open it, Ctrl/Cmd-click for a new tab.

**Promises.** Name a promise under `promises:` in the scene that makes it, under `progresses:` where it moves on, and under `pays:` where it pays off. The view lists every name with where each happened and a status worked out from reading order: *open*, *progressing* or *paid*. Two warnings catch slips: *paid before it was made*, and *never made* (paid or progressed with no scene making it, usually a name spelt two ways). A promise repeated by several scenes of one chapter is shown once, for the chapter.

**Reveals: what the reader has been shown.** A fact is a line in a note about the story that ends with the scene it came from:

```
- The ferry runs only at slack water. ([[02.01 - Ferry]])
```

Any note outside the prose folders can hold them (folders starting with `_` or `.` are skipped), under any heading; a fact under `## Added 2026-11-09` carries that date. The view lists them by scene in reading order, by note, or by in-world `day` once scenes have one. **As of** rewinds to a scene: everything shown up to it, and how much is still to come. A `> [!note]` still sitting in a scene is listed as unfiled. Hover a fact for who was in its scene (its `pov` and `characters`): they were there, which is not the same as noticing. Click to open the note at that line. Where a scene's `%% filed → [[note]] %%` comment names a note that never cites the scene, the view says so; after a scene is split, citations keep the old scene's name.

**Cast.** A row for everyone a scene lists, a beat's `who:` plans, or a character note names: the scenes they are *in* (`pov` or `characters`), the scenes they *speak* in, the scenes that only *name* them in the prose, and first and last. Under a row, where the plan, the properties and the prose disagree: in a beat's `who:` but not in its scene's `characters`, the reverse, or listed in a scene whose prose never names them. Only a name is held to that last check: "The Inspector" and "Two guards" describe someone. Someone with both a name and a description is covered by either, so a scene that only ever says "the inspector" is not flagged. A name with no character note behind it says so; adding it to a note's `aliases` joins the two rows.

*Speaks* is the Dialogue lens's reading of every scene, without opening them: a line is someone's by a tag ("Mara said"), a pinned speaker, an action beat or a pronoun the scene settles. A guess from turn-taking never counts as speaking. Each scene is read when it is saved, in the background. Someone tagged by name in a scene that lists others, and not them, is flagged under their row; a tagged name nobody lists gets a row of its own, and a description ("the guard said") gets one only when a note answers to it. Part of a name, or "his father", is taken for someone the scene lists and for nobody else. Hover a row for the scenes they are in with no line found to be theirs, which is a fact and no fault. Hover a scene in the Book, or look under Scene in the outline, for who speaks in it and how many lines nobody could be given.

**How a note is found in the prose.** By its `aliases`, and for a `type: character` note also by its title ("10.2 Oskar (The Clerk)" is *Oskar* and *The Clerk*; a title that is a sentence is not a name). A name with a capital matches as written, so *Wren* is not "wren"; one written all in lower case matches any case, so the alias `salt pan` finds "Salt pan". A leading "The" is ignored. A name two notes both claim counts for neither, and the view lists it.

**In a scene**, the outline gains two sections. *Touches*: the notes the scene is connected to, by type, each with how (listed in its properties or its beat, holding a fact from it, or named in its prose) and the note's `status`, so a scene leaning on a note still open shows. *Reader*: how many facts the reader has by this scene; folded below, the facts recorded from later scenes, which this scene can't lean on, and the facts shown in scenes its point-of-view character wasn't in. **In a note about the story**, the outline lists the scenes that touch it.

**Needs a look.** Scenes whose last pass may no longer hold, one line per reason, with the dates behind it. A pass is a date in a scene's `dev`, `line` or `continuity`. The reasons:

- *canon changed since the continuity pass*, in a note the scene touches: facts under an `## Added` date later than the pass (the scene's own facts aside), or failing that, the note's body changed after it;
- *edited since its last pass*, and by about how many words;
- *an earlier scene changed* after this scene's `dev` or `continuity` pass, where this scene pays or progresses a promise that one makes;
- *the shape of the book changed* after a chapter outline's card was last changed (the shape note is one called "Shape of the book", or the one named in settings);
- *a promise paid before it is made*.

A scene with no pass date is never listed: it reads "no pass yet". The same reasons show in the outline's Scene section, and a click opens what the reason is about. They are reasons to look and no more; nothing is checked for sense and nothing is blocked.

To tell a real edit from a typo fix, ProsePrince remembers each scene as a tally of its words (how many times each is used, each word reduced to three characters, so no prose can be read back from it) and counts an edit once ten words and one in a hundred have changed. When you type a pass date, the scene as it stands is kept as what that pass read. Where it wasn't there to see a change (a pass dated before 0.22, or an edit made with Obsidian closed), the file's own date stands in, and the line says "file date". The tallies and dates are kept in `story-tracking.json` in the plugin's folder; delete it and everything falls back to file dates.

**Write story inventory** (command, and a button under Needs a look) writes `Inventory` in the read-through folder, stamped with the date and time: promises that aren't settled with their scenes, the needs-a-look reasons, what is left to clear in each chapter, and, for the scene that was open, its reading list (the notes it touches) and what the reader has been shown by then, with who was there. It is made for a reader that would otherwise scan the vault, such as an AI assistant working on the book: read the inventory, and check its stamp. It is replaced whole each time and nothing else is written.

**Reading a chapter, or the book.** *Read through this chapter* (also "read" beside a chapter in the story view, and a button at the foot of the outline) and *Read through the book* open the scenes as one continuous page in reading view. The page is a note in `_proseprince` that only embeds each scene, in reading order, so it holds no copy of your prose and always shows the scenes as they are now. Your properties, hidden comments and callouts don't show; a scene's own title becomes a small signpost, and the link icon beside it opens the scene for editing. Scenes with nothing written yet are left out. The note is rewritten when you run the command and its list of scenes has changed, so run it again after adding or renumbering scenes.

**Compiling a manuscript.** *Compile this chapter* and *Compile the book* (also a button at the top of the story view) copy the written scenes, in reading order, into one clean note for export: `Manuscript` or `Manuscript 04 The Job`, in the same folder. Each chapter gets a heading ("Chapter 4: The Job"), and scenes are divided by `***`. What goes in is what the word count counts, so the manuscript's words match the book's: no properties, comments, callouts, quotes or headings, and no fix-later lines (`- [ ]`, ticked or not). `==highlight==` and `@@` lose their marks and keep their words, a link reads as its text, tags go, and a break left dangling at the head or foot of a scene is dropped. Emphasis and your own scene breaks stay, and nothing is reworded: a `[placeholder]` is still there, exactly as written.

When the scenes still carry notes to file, questions, todos, stumbles or placeholders, they are listed first, scene by scene, each a click from its scene. It is a list and no gate: *Compile as it stands* writes the manuscript anyway. The note is a copy, replaced whole every time, so change the scenes and never the manuscript. It says so in its properties and nowhere in the page, where an export would carry it along. From there it goes to Pandoc or Obsidian's PDF export; ProsePrince doesn't make Word, EPUB or PDF itself.

## Exercises

Practise one skill at a time in separate notes, away from the story. *Start exercise…* (or *Start imitation exercise from selection*) creates a note in `_proseprince/Exercises/` (change it in settings) with the brief folded at the top, a heading for each part, and a **Look back** list of questions only you can answer. In an exercise note the usual lenses switch off: only what breaks the exercise's rules is marked, and the sidebar ticks each rule off as you write (click a failing one to walk through the places).

| Exercise | Trains | From |
|---|---|---|
| **Short and long** | Building sentences: a 100–150-word paragraph of sentences of seven words or fewer (no fragments), then one sentence of up to 350 words | *Steering the Craft*, ch. 3 |
| **Clean sequence** | Chaining sentences: physical action with no -ing or "as" clauses, no -ly adverbs, "then" at most once, varied openings; then the same as one long "and" sentence | ProsePrince, after *Self-Editing for Fiction Writers* chs. 11–12 |
| **Chastity** | Description: 200–350 words with no adjectives, adverbs or dialogue (a few time words allowed) | *Steering the Craft*, ch. 5 |
| **Feel it without naming it** | Moving the story through action: a strong feeling never named in the narration, then a place where something happened without naming the event (`subject:` in the frontmatter) | *Self-Editing*, ch. 1; *Steering the Craft*, ch. 9 |
| **Imitation** | Learning a writer's moves: your own scene in the sentence shapes of a passage you select, the model's lengths shown above yours in the sidebar | *Steering the Craft*, chs. 1 and 8 |

Le Guin's advice holds: when you're roughly done, put it away for a day or two and reread it aloud before ticking the boxes. The sidebar says when.

Two new checks came with the exercises and are also available for your own writing, off in every lens until you switch them on in settings: **Named emotions** (feelings stated in the narration: furious, relieved) and **Action clauses** ("Pulling off her gloves, she turned").

## Where it runs

Settings → **Where ProsePrince runs**: list the folders you write prose in (with autocomplete), and only notes inside them (and their subfolders) are highlighted. With no folders set it runs everywhere. A note's frontmatter always wins: `proseprince: true` switches it on outside those folders, `proseprince: false` switches it off inside them; the **Toggle ProsePrince for this note** command sets the flag for you. Outside the prose folders the status-bar icons dim.

## Your story world

A tagger reads one sentence at a time, so on its own it can't tell "White stood up" (a character) from "White flashed across his vision" (a colour). ProsePrince learns the story's names from three places:

- **The note itself**: a capitalised word mid-sentence ("she turned to White") is a name everywhere in that note.
- **Character notes**: notes with `type: character` (or a `#character` tag, or in a folder you choose) contribute their `aliases`, `name` or `names`, and their title if it looks like a name.
- **The World note** (default `_proseprince/World.md`, created from a template by *Open world note*): `## Names`, `## Places` and `## Terms`, one entry per line, aliases after `|`.

Names and places are tagged as proper nouns and never count as echoes. Terms (your invented vocabulary) never count as echoes or metaphors. Right-click a word for **ProsePrince: add "…" to world ▸ Name / Place / Term**, or use the *Add selection to world* commands. When a cast name is also an ordinary word at the start of a sentence, the name wins; lowercase "white" is always the colour. One vault per story keeps each world separate.

## How to approach this

Each hover card has a closed **How to approach this** drawer under the note. It holds hand-written guidance for that kind of finding: the principle, one or two invented before → after examples, and when to keep the original. Nothing is generated (it's all static text in the plugin, no AI, no network) and your own sentences are never rewritten. Hide the drawer entirely in settings if you prefer.

## Word lookups (optional, online)

Off unless you switch it on in Settings → **Word lookups (online)**. Then right-click a word for **ProsePrince: look up "…"** (or use the *Look up word at cursor* command) to open a small card with:

- its **meaning**, in the part of speech it has in your sentence first;
- **synonyms** and **more specific** words (walk → saunter, stride, trudge), filtered to the same part of speech; hover one for its definition;
- for a noun, the adjectives **usually** used with it (and for an adjective, the nouns it usually describes);
- a closed **Sound** drawer with rhymes and near rhymes, fetched only when you open it;
- **Open in OneLook ↗** for a deeper search.

**Words to try in hover cards**: once a card has stayed open a moment, adverbs, qualifiers, nominalisations and echoes get a short row of single words, each with its definition on hover:

| Finding | Row |
|---|---|
| "walked slowly" | *One verb instead:* strolled, sauntered, meandered; *Other ways to walk:* strode, trudged, plodded, paced… (kinds of the verb whose definition uses it) |
| "she said softly" | *One verb instead:* whispered, murmured, muttered, with King's reminder that "said" is nearly invisible |
| "very tired" | *One word instead:* exhausted, drained, spent, weary |
| "made a decision" | *As a verb:* decided, chose, concluded |
| an echoed "cold" | *Other words:* frigid, cool, crisp… |

Stacked modifiers and metaphor candidates show **usual words** for the noun instead, with yours marked: "dead silence" sits among the most common adjectives for *silence* (long, dead, complete, profound…), so readers glide past it; "velvet silence" doesn't, so it will be noticed. Nothing is suggested there: whether the pairing earns its place is your call.

Picking one replaces the pair: "walked slowly" → "strolled", "Slowly, she walked" → "She strolled", "very tired" → "exhausted". A short craft reminder sits under each row whichever lenses are on, because the list is a menu, not an instruction.

In the lookup card, click a word (or use the arrow keys and Enter) to replace the original. The replacement keeps its form and capitals ("Walked" + stride → "Strode", "doors" + gate → "gates", British spellings such as *travelled*), and one undo restores it. Select a short phrase to look up the phrase instead.

What goes online: only the word (or selected phrase) you look up, sent to [Datamuse](https://www.datamuse.com/api/), the engine behind OneLook's thesaurus. Your text never leaves the vault. Answers are saved in the plugin folder (`lookup-cache.json`) for six months, so repeat lookups stay offline; offline, the card says so and nothing else changes. Datamuse is free without a key until 1 February 2027, when it starts requiring one; there's a field for it in settings.

**Lookup history** (on by default, per vault) records which words you look up and what you replace them with, in `lookup-history.json`. It's never shown in the card. Settings shows it as **Your lookups**: the words you look up most, the words you replace most and what you chose instead, and which checks your replacements came from. Switch it off or clear it there.

## "Not here"

Hovering a highlight shows its note and a button such as *Not a cliché here*. It appends a hidden comment like `%% not cliche %%` to the paragraph, which switches that check off there. Obsidian doesn't render `%%` comments, and they're ignored by the tagger. Delete the comment to switch the check back on.

Some parts of a note are never checked: frontmatter, code, math, `%% … %%` comments, and quotes and callouts (any `>` line, including `> [!todo]`, `> [!note]-` and the like), since those are notes to yourself rather than the story. They're left out of the word counts too.

## Install for development

```bash
npm install
npm run build
```

Then copy (or symlink) `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/proseprince/` and enable **ProsePrince** under Settings → Community plugins.

`npm run dev` rebuilds on change. `npm test` runs the analysis tests. `npm run harness` builds a standalone CodeMirror test page (`harness/index.html`; serve the repo root over HTTP) that runs the real highlighter and worker outside Obsidian.

## How it works

```
editor change → wait for a pause → whole paragraphs around the viewport
  → mask Markdown (same length, so offsets stay exact) → cache lookup by paragraph text
  → Web Worker: wink-nlp tags → phrase lexicons + rules → highlights, sentence lengths, readability totals
  → cache → filter by your toggles and %% not … %% comments → CodeMirror decorations
idle → analyse the rest of the note (cached) → note-level readability
```

- **Tagger**: [wink-nlp](https://github.com/winkjs/wink-nlp) with `wink-eng-lite-web-model`, in a Web Worker inlined into `main.js` (about 3.9 MB; Obsidian installs only `main.js`, `manifest.json` and `styles.css`).
- **Phrase matching**: lexicon phrases are tokenised by the same tagger and stored in a trie keyed by word stems from lemmas, so one entry covers every tense and irregular form; any possessive matches any other ("ace up your/his sleeve"); leading articles are optional; longest match wins; matches never cross a sentence.
- **Whole paragraphs, cached**: unchanged paragraphs are never re-tagged, sentences at the screen edge keep their context, and toggles re-filter cached results instantly.

Source layout: `src/analysis` (masking, tagging, phrase matching, rules in `rules/`, lexicons in `lexicon/`, rhythm and readability; pure and unit-tested), `src/worker`, `src/editor` (paragraphs, cache, CodeMirror extension with hover cards), `src/lookup` (optional online lookups: Datamuse queries, ranking, re-inflection, cache, popover), `src/settings*.ts`, `src/main.ts`; the book is `src/analysis/story.ts` (pure), `src/story.ts` (the index) and `src/storyView.ts`.

## Known limits

- wink is a small, fast model (roughly mid-90s per-word tagging accuracy on news text, lower on fiction). Expect occasional mis-tags, e.g. *-ing* verbs tagged as nouns or nouns tagged as adjectives; the rules work around the common ones.
- Participles after the noun (*arms wrapped around him*) need a dependency parse; not detected yet.
- Echoes and repeated openers are found within a paragraph, not across paragraphs.
- Speaker attribution is heuristic. Back-to-back lines from the same speaker throw turn-taking out of step, "he" and "she" are only resolved from the narration of the current scene, and a scene that runs into the next without a break can carry a pronoun across. Guesses are drawn dotted and say so on hover.
- The note's own name finder sometimes takes a capitalised word at a sentence start ("The", "His", "Captain") for a name; the dialogue rules filter these out, but the parts-of-speech colours can still show them.
- Datamuse requires an API key from 1 February 2027; without one, online lookups will stop working from then.

## Roadmap

Done since the first release: optional online word lookups (0.7–0.9), the Dialogue lens with conventions checks and voices (0.10–0.13), the outline sidebar (0.14–0.17), exercise mode (0.18), the story view with chapter outlines, annotations and promises (0.19), reading a chapter or the book as one page (0.20), reveals, the cast and what a scene touches (0.21), scenes that need another look and the story inventory (0.22), who speaks in each scene (0.23), compiling a clean manuscript (0.24).

- Remaining Le Guin chapters: tense consistency (6), point of view and head-hopping (7–8; the frontmatter `pov` and the dialogue pronoun tracking are a start), telling markers (9), crowding map (10), sound (1; the lookup card's rhymes are a start).
- More exercises (see `docs/exercise-mode-plan.md`): pure A/B dialogue, person and tense, points of view, cut it to half, beats added to bare dialogue.
- Writer's own word lists (a Words lens), seeded from the sidebar's repeated words and the words you replace most in lookups; then Accents: words a character would or wouldn't say, building on the voices table.
- Smaller checks: dangling openers ("Wet and panting, anger surged"), a choppiness hint (high variety but nearly all short sentences), cross-paragraph echoes and openers, an ellipsis followed by narration as an interruption.
- A cleaner note name finder, so sentence-start capitals aren't taken for names.
- Dialogue options: single-quote and dash-style dialogue.
- An offline WordNet pack for lookups, as a separate download.
- Optional stronger tagger that refines paragraphs when you pause.

## Credits

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): wink-nlp; Creative Writer (lexicons and rule designs); no-cliches / write-good (clichés); Titus Wormer's fillers, weasels and hedges lists; Brysbaert, Warriner & Kuperman's concreteness norms (CC BY 4.0); Datamuse and Wiktionary (CC BY-SA) for the optional lookups.

## License

MIT
