# Plan: story tracking

Status: phase 1 built in 0.19.0, the read-through from phase 4 in 0.20.0 and phase 2 in 0.21.0 (all 10 November 2026). Phase 3 and the compile are not started. First written 10 November 2026; revised the same day with the author's answers. Background in [feature-map-snowflake-penseed.md](feature-map-snowflake-penseed.md), and in a private note on the author's own vault that is kept out of this repository.

## Goal

A live, derived view of the book, so the inventory the writer carries in his head (what is unfiled, what is open, who knows what, what touches what, what needs rechecking) is on screen while drafting and never maintained by hand. The rule that keeps it in ProsePrince's lane: **ProsePrince does inventory, Claude does judgement.** Nothing here detects, suggests or rewrites prose. Every row is derived from conventions the vault uses, and every row jumps to its source.

The approach is to cherry-pick ideas from other plugins and build them here against the vault's own conventions. No other plugin is installed and the vault's folders do not change.

## Decisions

| Question | Answer |
|---|---|
| Where the book-level sections live | A second view, *ProsePrince story*, beside the outline |
| Unnumbered notes in the prose folders (the Leviathan Wakes chapter) | Hidden from the Story view |
| Reveals ordered by in-world `day` | Yes, as a second order, offered once any scene has `day` filled |
| Chapters | A chapter note per chapter, holding the card and the beat outline; scenes are separate files linked from their beat |
| Inventory for the Claude skills | A file, `_proseprince/Inventory.md`, written by a command |
| Ripple | Both readings: canon changed after a scene was checked, and a scene edited after later scenes were written |
| Promises | Three lists: `promises`, `progresses`, `pays` |
| Promise rows | Jump to the scene; no paragraph pin |

Assumed, not yet confirmed: while a scene file is open, its beat card is shown in the sidebar from the chapter note, and is not copied into the scene file. One copy, nothing to keep in step. A beat card that already sits in a scene file (chapters one to four today) is still read as it is now.

## What is picked, and from where

| Feature | Idea from | Phase |
|---|---|---|
| Annotation inventory with click-to-walk | this vault's own callout convention | 1 |
| Chapters and scenes in order, with counts and pass flags | Penseed's chapter list; Snowflake's per-chapter statistics | 1 |
| Chapter outline with beats, scenes attached to beats | Snowflake's plan-apart-from-prose; its beat sheet | 1 |
| Promises: made, progressed, paid, open | Penseed's board and progress entries; Snowflake's plant, reinforce, payoff | 1 |
| Reveals: what the reader has been shown, by scene | Penseed's reader-knowledge timeline and its "as of chapter" rewind | 2 |
| Who knows what, by presence | Penseed's per-character knowledge | 2 |
| Cast table with mismatches | Snowflake's entity tracking | 2 |
| Touches: notes a scene mentions, and the reverse | Snowflake's mention matching over names and aliases | 2 |
| Needs a look | Penseed's outdated badge and edit threshold; Snowflake's review impacts | 3 |
| Inventory file for the skills | this vault's Claude workflow | 3 |
| Read-through note and clean compile | Snowflake's manuscript stream and export; Longform's compile | 4 |

Anything copied rather than re-implemented (Penseed's filename parser, its change threshold) is MIT licensed and goes in `THIRD_PARTY_NOTICES.md`.

## How it works

Two views, one index.

- **The outline** stays per note and keeps refreshing on every pause in typing. It gains an Annotations section, and its Scene section gains the beat card from the chapter note, the scene's promises, what the scene touches, and any needs-a-look reasons.
- **The Story view** holds the book: Book, Promises, Reveals, Cast, Needs a look. It refreshes when a file in scope is saved, renamed or deleted, not on keystrokes.
- **The index** (`StoryIndex`, a sibling of `WorldIndex`) scans the prose folders for chapter notes and scenes and the rest of the vault for canon notes. One record per file, keyed by modified time and size; only changed files are re-read. Parsing is pure and unit-tested in `src/analysis/story.ts`.
- **Jumping** opens the file at a line through Obsidian's own open-file state, so there is no editor-readiness race.
- **Writing into the vault** happens in three places only, each on a command: creating a scene file from a beat (and adding its link to the chapter note), writing the inventory file, and writing the manuscript notes. All three land in files ProsePrince owns or the writer asked for. Prose is never touched.

## What is read

| Thing | Read from | Rule |
|---|---|---|
| Chapter note | a note in the prose folders named `NN.00 …` with `type: chapter` | its `%%Card.%%`, `target`, `summary`, chapter-level `promises`, and its headings as the chapter's beats, each with a `%%Beat.%%` card |
| Beat | a heading in a chapter note | `target`, `who`, `change`, and other card lines shown as written; `[[links]]` in the beat's section are its scenes |
| Scene | a note in the prose folders named `NN.NN …`, not `.00` | chapter from the number; ` - ` after the number optional. Attached to a beat by the link in the chapter note; failing that, by a title that matches a beat heading; failing that, listed under its chapter as unplanned |
| Scene fields | frontmatter | `pov`, `characters`, `setting`, `day`, `summary`, `target`, `promises`, `progresses`, `pays`, `dev`, `line`, `continuity` |
| Reading order | filenames | the chapter note's beat order is the plan; where the two disagree, the view says so and changes nothing |
| Words | prose lines only | the outline's existing count |
| Annotation | a line in a scene | `> [!note]`, `> [!question]`, `> [!todo]` (and `check:` inside one), `%% filed → [[x]] %%`, `%% checked → [[x]] %%`, `- [ ]` on a prose line, `==text==`, `@@`, `#openloop`, and bracket placeholders left in prose (`[FIX: …]`, `[world name …]`) |
| Canon note | any note outside the prose folders, `_proseprince`, `_archive` and `_templates` | `type`, `status`, `aliases`, `## Added YYYY-MM-DD` headings and the bullets under them ending `([[scene]])` |
| Fact | scene side and note side together | the scene comes from the `%% filed %%` comment, which survives a split; the text comes from the citation in the note. Where they disagree, the row says so |
| Mention | a canon note's `aliases`, and a character note's title | matched in scene prose as whole words: as written for a name with a capital, any case for one all in lower case |
| Unnumbered notes in the prose folders | — | ignored by the Story view |

Vault-side changes this relies on, all small and all Dan's or the organiser's to make:
- a chapter note for each chapter that wants one (chapter four first; its card and promises are currently copied into seven files);
- `aliases` on the person notes and on the system and concept notes whose subject the prose names (the Lurch, Scalper, precursor);
- `progresses:` in the draft template;
- a one-off re-cite of chapter four's 20 facts, which all point at the first scene since the split.

Nothing breaks before these are done. The view shows less, and says why: duplicate promises within a chapter are shown once with a note, and a note with no aliases simply has no mentions.

## Phases

Each phase is a build and a minor version; fixes are patches.

### Phase 1 (0.19): annotations, chapters, promises

**Annotations section** in the outline, after Beats. One row per kind present: notes to file, questions, todos (checks counted inside), fixes, stumbles, placeholders, filed, checked. Count, and click to walk, as Issues does.

**Chapter outline.** In a chapter note the outline works as it does today (headings as beats, cards read), and each beat also shows its scenes: written words against the beat's target, or "not drafted".

**Create scene from beat** command, with the cursor in a beat of a chapter note: creates the next numbered file from the draft template, titled from the heading; fills `characters` from the beat's `who:` and `pov` from the chapter; adds the link under the beat. Refuses if a file of that name exists.

**Scene section** in the outline, for a scene attached to a beat: the beat card from the chapter note (target, who, change and the other lines as written), words against the beat's target, and the scene's promise lines.

**Story view, Book section.** Chapters in order; under each, its beats in outline order with their scenes, then any unplanned scenes. A scene row: title, words with a target bar, three pass marks, counts of annotations to clear and promises open. Hover for `summary`, `pov`, `characters`. Click to open. Totals per chapter and for the book.

**Story view, Promises section.** One row per promise name: made in, progressed in, paid in, and a derived status: open, progressing, paid, or a warning (paid before made; paid or progressed but never made, usually a typo). A promise on a chapter note belongs to the chapter. Names match after trimming and lowercasing.

**Tests**: name parsing for chapter notes and scenes, beat-to-scene attachment by link, by title and unplanned, annotation parsing, promise status over a small invented book.

### Phase 2 (built, 0.21.0): reveals, cast, touches

**Reveals section.** By scene in reading order (what the reader learned there, and the note each fact landed in), by note, and by `day` once any scene has one. An "as of" control picks a scene and shows everything the reader has been shown up to it. For the open scene: facts recorded from later scenes, which a draft of this scene must not assume. Unfiled `[!note]` callouts count, marked unfiled.

**Who knows.** A fact shown in a scene is known to that scene's `characters` and `pov`. Stated in the view as an approximation. For the open scene: what the reader knows that the `pov` character does not. No override syntax yet.

**Cast section.** One row per character: scenes present, scenes mentioned, first and last scene; under it the mismatches: in `who:` but silent, speaks but not in `characters`, in `characters` but never named. "Speaks" is only known for notes analysed this session and says so otherwise.

**Touches.** For a scene, the canon notes it is connected to, grouped by type, each marked with how: declared (frontmatter, `who:`), recorded (a filed fact), or mentioned (an alias in the prose), with the note's `status` beside it. For a canon note, the scenes that touch it. Shown in the outline's Scene section and as hover detail in the Story view. The rows worth attention are the mismatches: a system mentioned in several scenes with nothing recorded, or a scene leaning on a note still `open`.

**Tests**: both-sides fact resolution including a split chapter, reader-knows-as-of, mismatch lists, mention matching with ambiguous aliases.

**As built**, where it differs from the above:
- A fact is any line ending `([[scene]])`, under any heading, since the vault keeps cited lines in a note's decided body as well as under `## Added`.
- A filed comment names a note, not a line, so the two sides can't be matched fact by fact. The check is per note: a scene with a filed comment for a note that never cites that scene is flagged, with the scene of the same chapter the note cites instead.
- Mention matching has one rule and no marking: a name with a capital matches as written, one all in lower case matches any case, a leading article is ignored. World note entries are used to group aliases of one person, not as mentions.
- Cast mismatches come from the plan, the properties and the prose only: in a beat's `who:` but not the scene's `characters`, the reverse, and listed but never named (names only, not descriptions; and for someone with both, "the inspector" in the prose is enough, in any case). **Who speaks is not in the Cast yet**: attribution runs in the editor under the Dialogue lens, one note at a time, and the outline's Beats section already checks `who:` against speakers there. Carrying it into the Cast means running attribution over every scene, which is its own piece of work.
- The note side of Touches is in the outline: open a note about the story and it lists its scenes. The Story view shows a scene's declared and recorded notes on hover, and lists notes the prose names in two scenes or more with nothing recorded under Reveals, by note.

### Phase 3 (0.22): needs a look, inventory

**Needs a look** in the Story view, and the same reasons on the Scene section. One line per reason, with the two dates behind it:
- canon changed since the continuity pass, in a note the scene touches;
- edited since the last pass;
- an earlier scene it pays or progresses a promise from was edited since this scene's last pass;
- the book's shape note changed after this chapter's card was written;
- a promise paid before it was made.

A scene with no pass flags reads "no pass yet", never stale. When a pass flag's date changes, the scene's word count and a content hash are recorded in plugin data, so "edited since" can use a threshold (at least 50 characters and 1% of the note) and say how much changed. Until a flag change has been seen, the file date is the fallback.

**Write story inventory** command: writes `_proseprince/Inventory.md`, stamped with the date and time. Contents, short: open and progressing promises with their scenes; needs-a-look reasons; per chapter, counts of annotations to clear; and for the scene that was open, its reading list (the notes it touches) and its who-knows lines. Every vault script already skips `_proseprince`. The skills read it instead of scanning; a stale stamp means ask for a refresh. The matching change to the writing team's protocol is described in the private vault note.

**Tests**: each reason from invented dates; the threshold; inventory output for the invented book.

### Phase 4: read-through (built, 0.20.0) and compile (0.23)

**Read-through** commands, built: *Read through this chapter* and *Read through the book* write `_proseprince/Read 04 The Job.md` or `_proseprince/Read the book.md`, a list of scene embeds in reading order under chapter titles, with a style class that hides callouts and embed title bars, and open it in reading view. Scenes with no words are left out. It holds no copy of the prose, so it is always current; the note is rewritten only when its list of scenes changes. Still to prove in the vault: how embeds render with the theme in use.

**Compile** command: one clean Markdown note for a chapter or the book. Scenes in order through the same rule the word counts use (no frontmatter, comments, callouts or plan headings), chapter titles, a scene break between scenes, highlights, `@@` and fix-later checkboxes stripped. Before writing, a short report of what is still in the way: unfiled notes, open questions, placeholders in the prose. Regenerated each time, never edited by hand.

**Not built**: export to Word, EPUB or PDF. The compiled note goes to Pandoc or Obsidian's PDF export when that day comes.

## Settings

- The prose folders already define the book.
- One toggle to hide the Story view's link in the outline, for vaults that are not a book.
- Output folder for the inventory and manuscript notes, default `_proseprince`.

## Not in this plan

Snowflake's planning workspace, corkboard, timeline, freeform canvas and editable manuscript stream; its folder layout; Penseed's extraction, conflict detection, rule scans and world state; Longform; a drag board for promises; character-knowledge statuses beyond presence; world rules as testable assertions (worth its own small plan once Reveals has been used for a few weeks); collapsing `%% … %%` blocks in the editor (a separate, small editor feature).

## Still open

1. Beat card while drafting a scene: sidebar only (assumed), or also copied into the scene file?
