# ProsePrince

Fiction-focused prose highlighting for Obsidian, entirely offline: no server, no network calls.

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
| Dialogue | **Dialogue punctuation**, mechanical slips only: a missing comma before a tag (`"…new" she mused`), a full stop or capital where a tag joins its line, `?".` endings, two-dot ellipses, a speech tag split from its line across paragraphs |

Filler, qualifiers, weasels, hedges, filter words, passives and adverbs are checked in narration only; dialogue is a character's voice.

**Parts of speech** (text colour, iA Writer style): adjectives, adverbs, nouns, proper nouns, pronouns, numerals, verbs, auxiliaries, conjunctions.

**Sentence rhythm**: each sentence tinted cool → warm by its felt length (words, plus commas, plus surplus syllables), in 4–6 bands, for the paragraph at the cursor or the whole screen.

**Readability** in the status bar: reading ease and sentence variety for the paragraph at the cursor; hover for the whole note, grade level and dialogue share.

**Lenses** stack: switch on as many as you like from the status-bar menu, the settings tab or the `Lens: toggle …` commands, and each adds its highlights. Settings lists exactly what each lens turns on.

| Lens | Turns on |
|---|---|
| **Style checks** | Every word-choice, voice, sentence and dialogue check |
| **King lens** (after *On Writing*) | Adverbs oozing red, dialogue-tag adverbs, passive voice, qualifiers, filler |
| **Le Guin lens** (after *Steering the Craft*) | Sentence rhythm, adjectives, adverbs, qualifiers, stacked modifiers, verb forms as adjectives, echoes, repeated openers |
| **Parts of speech** | Every part of speech in its own colour |
| **Rhythm** | Sentence-length tints |

Below the lenses, every part of speech and check has its own toggle showing the combined result and where it comes from ("On via King lens"). Flipping one overrides the lenses for that item only ("Your change", with a reset button); "Reset your changes" clears them all.

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

## "Not here"

Hovering a highlight shows its note and a button such as *Not a cliché here*. It appends a hidden comment like `%% not cliche %%` to the paragraph, which switches that check off there. Obsidian doesn't render `%%` comments, and they're ignored by the tagger. Delete the comment to switch the check back on.

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

Source layout: `src/analysis` (masking, tagging, phrase matching, rules in `rules/`, lexicons in `lexicon/`, rhythm and readability; pure and unit-tested), `src/worker`, `src/editor` (paragraphs, cache, CodeMirror extension with hover cards), `src/settings*.ts`, `src/main.ts`.

## Known limits

- wink is a small, fast model (roughly mid-90s per-word tagging accuracy on news text, lower on fiction). Expect occasional mis-tags, e.g. *-ing* verbs tagged as nouns or nouns tagged as adjectives; the rules work around the common ones.
- Participles after the noun (*arms wrapped around him*) need a dependency parse; not detected yet.
- Echoes and repeated openers are found within a paragraph, not across paragraphs.

## Roadmap

- Remaining Le Guin chapters: tense consistency (6), point of view and head-hopping (7–8), telling markers (9), crowding map (10), sound (1).
- Exercise mode: pick one of *Steering the Craft*'s exercises and flag only what breaks its constraint.
- Dialogue lens (speakers, narration dimmed); writer's own word lists.
- Optional stronger tagger that refines paragraphs when you pause.

## Credits

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): wink-nlp; Creative Writer (lexicons and rule designs); no-cliches / write-good (clichés); Titus Wormer's fillers, weasels and hedges lists; Brysbaert, Warriner & Kuperman's concreteness norms (CC BY 4.0).

## License

MIT
