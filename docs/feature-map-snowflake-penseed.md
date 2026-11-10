# Feature map: Snowflake Method and Penseed against ProsePrince

Written 9 November 2026 from a read of both repositories (Snowflake Method 0.31.0, Penseed 1.0.55) and ProsePrince 0.18.1. The aim is to lay out what each plugin does, where the ideas meet, and where they would touch ProsePrince's existing conventions, so the next step (deciding what to build) can be made against a full picture. Nothing here is a recommendation to build; the "Fit" notes are an honest first read against ProsePrince's lane, to be argued with.

Companion: a private note, kept out of this repository, maps these capabilities onto the author's own vault and workflow.

ProsePrince's lane, as it stands: offline, no AI, never rewrites prose unprompted, compact UI, one vault per story, data kept in the note (`%% … %%` comments and plain frontmatter) plus one World note.

## 1. The three plugins in a sentence

| Plugin | What it is | Lines | Network |
|---|---|---|---|
| **ProsePrince** | Prose-level highlighting and craft feedback while drafting, plus an outline sidebar | ~10k TS (worker model excluded) | Datamuse lookups only, opt-in |
| **Snowflake Method** | A complete planning and drafting workspace: ten-step method, characters, scenes, worldbuilding, manuscript stream, trackers, visualisations, statistics | ~163k TS + 707 KB CSS | None |
| **Penseed** | A thin client for a hosted service that reads chapters with an LLM and tracks foreshadowing, entities, contradictions and reader knowledge | ~5k TS | Everything; full note text uploaded |

Snowflake is a different kind of plugin from ProsePrince (planning, not prose feedback), but it has a prose-analysis layer that overlaps directly. Penseed is interesting only for its *concepts* and a few hundred lines of local logic; its intelligence lives on the server.

## 2. Snowflake Method: inventory

Grouped by area. Storage conventions matter because they decide whether two plugins can coexist in one vault.

### 2.1 Method and project

- **Ten-step workflow** with per-step status (`not-started`, `in-progress`, `in-revision`, `complete`, `skipped`) and a dependency graph: changing step 1 flags steps 2, 4, 6, 8, 9 and 10 "for review". Review is advisory, driven by content fingerprints (FNV-1a), never blocking. Stored on a project metadata note (`snowflake-step-status`, `snowflake-reviewed-fingerprints`). Source: `src/domain/steps.ts`, `fingerprint.ts`.
- **Numbered folder layout** per project (`00_System`, `10_Summary`, `20_Character`, `30_Synopsis`, `40_Scene`, `50_Manuscript`, `60_Worldbuilding`, `70_Tool`, `80_Material`, `90_Archive`), localised for English and Chinese. A health checker repairs damaged marker sections and refuses unsafe writes.
- **Managed sections** in notes: `<!-- snowflake:section:<id>:start -->` … `<!-- snowflake:section:<id>:end -->`. Generated sections are read-only in the editor; authored sections are free prose. Every managed note carries `snowflake-schema`, `snowflake-document` and `snowflake-project-id`.

### 2.2 Characters, scenes, worldbuilding

- **Scene note** frontmatter: `snowflake-scene-id`, `snowflake-scene-title`, `aliases`, `snowflake-rank` (sparse integer, gap 1024), `snowflake-category`, `snowflake-pov` (a wikilink, or `omniscient` / `multiple`), `snowflake-scene-time`, `snowflake-scene-location`, `snowflake-scene-characters` (all lists of wikilinks), `snowflake-conflict`, `snowflake-progress-status`, `snowflake-linked-manuscript`, `snowflake-color`. Body: a generated overview callout, then authored sections for step 8 (events) and step 9 (planning), then optional custom fields.
- **Character note**: `snowflake-character-id`, `snowflake-character-name`, `aliases`, motivation / goal / conflict / growth keys, role as a category, plus step 3, 5 and 7 sections.
- **Worldbuilding note**: kinds `time`, `location`, `item` and user-defined kinds; time notes carry `point` or `period` with start and end.
- **Vocabularies** (categories, world statuses, relationships) are folder trees of tiny notes, so renames propagate through Obsidian's link updating.
- **Record lines** in protected sections: `[[node|Taxonomy/Path]]: value -> [[target]] at [[place]] when [[time]] with [[anyone]]`. A connector only counts when followed by a link, so prose containing "at" is safe.
- **Custom fields**, **gallery** (`snowflake-gallery`, pictures copied into a `25_Gallery` folder), **Bases** files generated once and never rewritten.

### 2.3 Manuscript stream

- Whole manuscript as one scrolling page; each chapter its own note under `50_Manuscript/`; click to edit in a bare CodeMirror instance; windowed to five notes either side. Insert, split at caret, merge, reorder, automatic chapter numbering (Arabic, Chinese, English, custom patterns), search and replace across unloaded chapters, plain-text export, import vault notes as chapters.
- Only frontmatter written: `snowflake-manuscript-sequence`.
- **Presentation**: font, size, line height, width, indent, hyphenation, background tint, scoped to stream, project or vault. **Focus mode** (`off`, `on`, `deep`, `solo`: fade all but the caret paragraph). **Typewriter scrolling** (37 lines: a transaction extender that centres authored edits, never pointer selections). **Word milestones** drawn in the margin at the exact unit where each thousand lands.
- **Editor helpers**: auto-pair for ASCII, CJK and Markdown markers; format commands; `[[` completion over project members with aliases.

### 2.4 Visualisation workspace (desktop and tablet only)

- **Corkboard**: scene cards in rank order, inline edit of POV, status, conflict, tint; drag reorder; group by eight fields.
- **Beat sheet**: sheets → acts → beats → scenes. Seven built-in templates, each beat with a one-line purpose: Blank, Three Act, Kishōtenketsu, Story Circle, Save the Cat, Hero's Journey, Romancing the Beat. Stored in `734_Beat_Sheet/beat-sheet.json`. Source: `src/domain/beat-sheet-templates.ts`.
- **Timeline** (columns are timelines, rows are Time notes, cells hold scenes), **freeform canvas** (React Flow), **relationship graph** (d3-force, rebuilt from record lines, never stored), **canvas export** to `.canvas`.

### 2.5 Trackers

- **Tasks**: kanban (`todo`, `in-progress`, `blocked`, `in-review`, `done`, `cancelled`), priority, due date, related entities. Derived cards (never stored): daily and weekly goal, unresolved mentions, sensitive words, open foreshadowings, pending revisions.
- **Foreshadowing**: a *thread* `{name, description, status: planned | active | resolved | abandoned, related, occurrences[]}`; each *occurrence* `{role: plant | reinforce | payoff, path, from, to, originalText, before, after}`. Marked in prose, listed as margin cards. Stored outside the note in `722_Foreshadowing/foreshadowing.json`. Source: `src/domain/foreshadowing.ts` (555 lines).
- **Revisions**: proposed `replace | insert | delete` edits kept outside the note with offsets, the original text and 16 characters of context either side; re-anchored on every read as anchored, moved or conflict; accept writes into the chapter. Source: `src/domain/revisions.ts` (776 lines; `passageContext`, `anchorSpot`).
- **Sticky notes**: one Markdown file each, colour in frontmatter, shown on the dashboard, sidebar and floating panels.

### 2.6 Statistics

- **Writing sessions**: stopwatch, countdown, pomodoro; focus versus idle (60 s silence) versus paused; stage `planning | draft | revision | proofreading`; words added, deleted and net per file; daily goal gauge, 30-day trend, year heatmap, hour bands. Per device, per month JSON so sync never merges.
- **Word count conventions**: `ms-word`, `qidian`, `chenggua`, `jinjiang`; heading rule `count | skip-first-h1 | skip-h1 | skip-all`; plugin-written sections excluded.
- **Prose analysis**: reading time, sentence count, words per sentence, dialogue share per chapter, word frequency with stopwords and a d3 word cloud.
- **Entity tracking**: per-member mention counts, linked versus unlinked, first and last chapter, distribution strip, per-chapter occurrences with context and jump-to.
- **Modification history**: reads Obsidian's File Recovery IndexedDB read-only, keeps `{timestamp, words, delta, hash}` per version, never the text.

### 2.7 Prose-analysis internals (the direct overlap)

- **One Markdown scan, two projections** (`markdown-scan.ts`, `countable-prose.ts`, `analyzable-prose.ts`): a lezer CommonMark parse finds every piece of syntax once; the *countable* projection substitutes (link alias for link, entity decoded) and keeps a back-map to source offsets; the *analyzable* projection is verbatim ranges so matchers get exact offsets and know when a hit sits inside a wikilink. Stray `~~~` runs are masked before parsing so a writer's tildes cannot swallow a chapter as a code fence. `%% … %%` is hidden.
- **Aho-Corasick matcher** (124 lines) over names and aliases; exact case, NFC and NFD forms; word-boundary rule that excludes CJK scripts from the "glued word" test.
- **Mentions** (`mentions.ts`, 707 lines): hits cached per note by `mtime:size` plus matcher fingerprint; resolution (ignores, overlap winner, self-mention drop, `wikilink` / `foreign-link` / `unique` / `ambiguous`) recomputed on read. Ignore scopes: this occurrence, this note, everywhere. Highlight modes `off | first | unlinked | all`; right-click converts to a link.
- **Dialogue** (171 lines): paragraph-bounded stack pairing for `“”`, `""`, `「」`, `『』`; unclosed quote runs to paragraph end; dialogue share; display `off | highlight | focus`. Explicitly no speaker, no tags.
- **Sentences** (66 lines): terminator runs, closers attach, `.` does not end a sentence before a letter or digit.
- **Word frequency** (339 lines): `Intl.Segmenter` tokens; names and aliases cut first as atomic tokens so multi-word names count as one; possessive `'s` folds in; stopwords applied only at aggregation.
- **Sensitive words**: a user list, case variants for Latin, same matcher.
- **Custom highlights** (311 lines): user rules `{kind: literal | regex, patterns[], decoration: background | color | underline | wavy | bold, color}`; precedence entity > sensitive > custom when marks overlap.
- **Editor rendering**: metrics-neutral `Decoration.mark`, decorations mapped synchronously on each change then re-planned after 200 ms, IME-aware, same marks projected into reading view through a source-index map.

### 2.8 Architecture habits worth noting

Pure domain layer with no Obsidian or DOM imports and 280 headless vitest files; lenient JSON readers that carry unknown keys through; corrupt user data quarantined rather than deleted; per-device files for anything written continuously; "breathing" vault walks with a 12 ms budget; derived status never stored.

## 3. Penseed: inventory

What is local versus what the server supplies.

### 3.1 Local

- **Chapter number from filename** (`chapter.ts`, 60 lines): Chinese `第N章`, then `chapter N`, then a leading date stripped and the first number anywhere. `assignPluginChapterNumbers` gives unnumbered files negative numbers (treated as front matter) rather than guessing they belong at the end.
- **Chapter versus reference classifier** (`chapterClassifier.ts`, 124 lines), no word lists: the dominant filename pattern with digits replaced by `#` marks chapters; first-level subfolders with five or fewer notes are proposed as excludes (character sheets, world bible); unnumbered notes before the first chapter are front matter, after the last need confirming.
- **Edit reminder**: on leaving a note, a line-level LCS diff against the last analysed text; nags only when both `max(50 chars, 1% of the note)` thresholds are passed. Never auto-runs. Last analysed text kept in `content-cache.json`, bounded to 2000 notes.
- **Foreshadowing board** (`board.ts`, 590 lines): four columns `pending | in_progress | resolved | cancelled`, native HTML5 drag, optimistic move, priority dot 1 to 3, chapter line. Double-click jumps to the sentence.
- **Fuzzy sentence relocation** (`locateMatch`): exact, then case-insensitive, then letters-and-digits-only with an index back-map, then the three longest tokens as anchors. Server offsets are stored but never trusted. The "highlight" is just the editor selection plus scroll.
- **Review modal**: the accept-or-reject gate for a fresh analysis: chapter summary buckets (`revelations`, `resolutions`, `plot_advances`, `key_entities`), new foreshadowings with confidence and type, entities, earlier threads this chapter pays off with `resolution_type`.
- **Status bar**: four items, hidden until needed (task progress, outdated count, "note changed, re-analyse?", permanent reminder to run web reports). Toasts last 15 s.

Nothing is written into notes: no frontmatter, no comments.

### 3.2 Server-side (the concepts)

- **Foreshadowing** detection and cross-chapter resolution, with `fully resolved | partially resolved | progressed`, type, target elements, tone, narrative function, suggestions.
- **Entities** with `canonical_name`, `display_name`, `aliases[]`, `entity_type`, `attributes{}`, per-chapter facts.
- **Contradictions and world rules**: project-wide reports on the web app; the plugin only reminds you to run them.
- **Reader knowledge versus character knowledge**: a timeline of what the reader has learned by chapter N and which characters share it; dramatic irony; what the reader merely suspects. Exists only in the README and web app; no plugin code touches it.
- **Ripple and staleness**: after re-analysing chapter N, which later chapters depend on it; a `noop` when only wording changed; batch re-analysis strictly in order because one out-of-order chapter corrupts everything after it.

## 4. Where the ideas intersect

Each theme names what the two plugins do, what ProsePrince already has, how it could land in ProsePrince, and a first read on fit. Sizes are rough.

### A. The cast roster and name highlighting

- **Snowflake**: roster from per-note frontmatter (`snowflake-character-name`, `snowflake-name`, `aliases`), Aho-Corasick matching, linked versus unlinked, ambiguity, three ignore scopes, convert to link, per-chapter occurrence tracking with first and last appearance.
- **Penseed**: entities with canonical and display names, aliases, attributes; all extracted server-side.
- **ProsePrince**: World note Names, Places and Terms with `|` aliases; character notes with `type: character` and `aliases`; names feed the tagger and are excluded from echoes. Right-click to add to the World.
- **Intersection**: ProsePrince already owns the roster; what it lacks is the *tracking* half: who appears where, how often, first and last beat, and "named in `who:` but never appears". The sidebar's Dialogue section already does part of this for speakers. Snowflake's matcher rules (exact case, NFC and NFD, CJK boundary, possessive folding) are small and would harden `namesInText`, which the handoff already flags as noisy.
- **Data**: no clash. Optionally harvest `snowflake-document: character` notes as a name source for vaults running both.
- **Fit**: high. Small to medium.

### B. Foreshadowing threads: plant, reinforce, payoff

- **Snowflake**: a thread with a status and occurrences with roles `plant | reinforce | payoff`, each anchored by offsets plus original text plus context, stored in JSON outside the note; margin cards; derived "open threads" task card.
- **Penseed**: sentence-level threads with `pending | in_progress | resolved | cancelled`, priority, a kanban board, jump to sentence by fuzzy text match; resolution graded full, partial, progressed; dangling threads surfaced.
- **ProsePrince**: nothing. Nearest relatives are the beat comment's `change:` line and the `%% speaker %%` pin pattern.
- **Intersection**: the two plugins agree on the model (a thread, occurrences with roles, a lifecycle) and differ on storage (JSON outside versus server). ProsePrince's convention would be a hidden comment in the paragraph: for example `%% plant: locket %%`, `%% reinforce: locket %%`, `%% payoff: locket %%`, with the thread's name, priority or notes optionally on a World note section (`## Threads`). Status then derives: no payoff anywhere later is *dangling*, a reinforce without payoff is *in progress*, a `%% drop: locket %%` is *abandoned*. The sidebar gets a Threads section; a board view is optional. Jump is exact because the comment is the anchor, so no fuzzy relocation is needed.
- **Data**: needs a notion of note order (theme E) to say "later".
- **Fit**: high on concept, and it fits the in-note comment convention. Medium size. Honest limit: everything is author-tagged; nothing is detected.

### C. Reader knowledge and reveals

- **Penseed** only: what the reader knows at chapter N, which characters know it, what the reader wrongly believes. The plugin ships none of it.
- **Snowflake**: nothing equivalent. World-status record lines (`[[Injured]] when [[Year 1024]]`) are per-entity state over time, a cousin.
- **ProsePrince**: frontmatter `pov` and `characters`; beat `who:`; speaker pronoun tracking.
- **Intersection**: an offline version is a ledger of author-written entries, for example `%% reveal: the butler did it %%` (to the reader) and `%% knows: Ruoi: the butler did it %%`, read in note order. Derivable views: "what the reader knows by here", and a dramatic-irony list per scene (facts the reader knows that the `pov` character does not). What is *not* derivable without tagging every use of a fact: catching a character blurting something they should not know. The ledger can be shown; slips cannot be caught.
- **Fit**: medium. Interesting, but it would be a bookkeeping feature rather than a feedback one, and the payoff depends on the author's discipline in tagging. Worth asking whether the beat comment's `change:` line already covers most of what a writer would record.

### D. Facts and contradictions

- **Penseed**: attributes per entity per chapter, conflict reports (server).
- **Snowflake**: world-status and relationship record lines in protected sections, with time and place connectors; no contradiction detection, but the data is structured enough to permit it.
- **ProsePrince**: character notes are free-form apart from `aliases`, `name` and `colour`.
- **Intersection**: a `facts:` block in character notes (`eyes: grey`, with an optional `since:`) or an inline `%% fact: Linh.eyes = grey %%`, and a check that reports the same key with two values across notes. A cheap prose-side heuristic is possible: a name within a few words of a known attribute word (colour, age, handedness) becomes a prompt to record the fact, never an automatic extraction.
- **Fit**: medium to low. The consistency check is trivial once facts exist; getting facts recorded is the whole cost. Snowflake's record-line grammar is the most considered design here if a structured form is wanted.

### E. Note order and the manuscript as a whole

- **Snowflake**: `snowflake-manuscript-sequence` rank in frontmatter, a manuscript stream view, per-chapter statistics tables.
- **Penseed**: chapter number parsed from the filename, a structural classifier for which notes are chapters, negative numbers for front matter, drift warnings when numbering moves.
- **ProsePrince**: strictly per note. The sidebar knows this note's beats, nothing about the book.
- **Intersection**: themes B, C and F all need "which note comes first". The lightest answer is an `order:` (or `chapter:`) frontmatter key with Penseed's filename parser as fallback and the folder list in "Where ProsePrince runs" as the manuscript scope. With order in place, a book-level sidebar section becomes possible: per-chapter words, dialogue share, style figures, and issue counts, which is Snowflake's per-chapter table with ProsePrince's richer figures.
- **Data**: ProsePrince already uses plain unprefixed keys; `order:` fits. Reading `snowflake-manuscript-sequence` as a fallback would cost one line.
- **Fit**: high as an enabler, and cheap on its own (Penseed's parser and classifier are about 200 MIT-licensed lines).

### F. Staleness, ripples and revision awareness

- **Snowflake**: content fingerprints per step with a declared dependency graph; "needs review" hints that never block.
- **Penseed**: server-side dependency graph of chapters; outdated badge; LCS edit-reminder thresholds; `previous_content` to tell wording changes from meaning changes.
- **ProsePrince**: nothing persisted across sessions apart from lookup history.
- **Intersection**: with threads (B), reveals (C) and facts (D) in place, dependencies fall out for free: a later note depends on an earlier one when it pays off its plant, uses its reveal, or first mentions a name introduced there. A content hash per note at "mark reviewed" time gives "the scene this payoff depends on has changed since you last read it". The semantic-versus-wording distinction is not achievable offline; the LCS thresholds are the pragmatic stand-in.
- **Fit**: low until B or C exist. Park.

### G. Structure scaffolds

- **Snowflake**: seven beat-sheet templates with per-beat purpose lines; scenes placed under story beats; a corkboard.
- **Penseed**: none.
- **ProsePrince**: beats are headings inside a note with `%%Beat. target: … who: … change: …%%`; a `target:` per note.
- **Intersection**: the two meanings of "beat" differ in grain (story structure versus scene-internal unit), so they do not clash. Snowflake's template data could seed a *Start outline from template…* command that writes headings with the purpose line in a beat comment, or a book-level view that assigns notes to structural beats via `beat:` frontmatter. The templates are a dataset, bilingual, and small.
- **Fit**: medium. Useful if theme E lands; otherwise it is a planning feature in a drafting plugin.

### H. Writing statistics and sessions

- **Snowflake**: sessions, idle detection, stages, daily goals, heatmaps, milestones in the margin, modification history from File Recovery.
- **Penseed**: word count per chapter sent to the server; nothing else.
- **ProsePrince**: `target:` progress bar and "words added this session" in the sidebar.
- **Intersection**: the margin milestone is the one piece that is about the prose on screen rather than a dashboard. A daily goal on the sidebar's existing session count is the next-smallest step. Per-device monthly JSON is the right storage pattern if any history is kept.
- **Fit**: low to medium. Most of this is a separate kind of plugin, and several good ones already exist for Obsidian.

### I. The writer's own word lists

- **Snowflake**: sensitive words (one list, case variants) and custom highlight rules (literal or regex, five decorations, colour), with a clear precedence model when marks overlap.
- **Penseed**: none.
- **ProsePrince**: the roadmap's *Words lens*, seeded from repeated words and lookup replacements; later *Accents* per character.
- **Intersection**: Snowflake's rule shape is exactly what the Words lens needs, minus regex if the user-facing surface should stay simple. Accents (words a character would or wouldn't say) have no counterpart in either plugin and would build on the voices table.
- **Fit**: high. Already planned; Snowflake supplies a tested design for the rule shape and overlap precedence.

### J. Dialogue share, word frequency and stopwords

- **Snowflake**: dialogue share per chapter; `Intl.Segmenter` tokens with names cut atomically; stopwords at aggregation; word cloud.
- **ProsePrince**: dialogue share in the sidebar and the voices table; repeated words by part of speech with names and terms excluded.
- **Intersection**: ProsePrince is ahead on both. Two small borrowings: fold possessives into names, and treat multi-word names as one token in the repeated-words list. The word cloud is decoration.
- **Fit**: low. Nothing to chase.

### K. Editor ergonomics

- **Snowflake**: typewriter scrolling, focus mode levels, auto-pair, paragraph-aware Enter, format commands, `[[` completion over the cast.
- **ProsePrince**: none; the plugin reads and decorates, it does not change editing behaviour.
- **Intersection**: typewriter and focus are 40 to 100 lines each and sit comfortably in a CodeMirror extension that is already there. `[[` completion over World names is a natural use of the roster. Auto-pair and formatting belong to other plugins.
- **Fit**: medium for focus and typewriter (they suit the lens idea: a *Focus lens*), low for the rest. A question of whether ProsePrince wants to be a writing environment or stay a feedback layer.

### L. Annotations kept outside the note

- **Snowflake**: revisions and foreshadowing occurrences live in JSON with offsets, original text and context, re-anchored on each read; margin cards list them.
- **Penseed**: everything lives on the server; relocation by fuzzy text match.
- **ProsePrince**: everything lives in the note as `%% %%` comments.
- **Intersection**: this is a design fork rather than a feature. In-note comments survive renames, sync and other tools, and ProsePrince already parses them; outside-note anchors keep the prose clean and allow proposed edits without touching the text. If ProsePrince ever wants "suggested revision, accept or reject" (which the handoff's "never rewrite prose unprompted" rule leans against), Snowflake's `revisions.ts` is the reference. For threads and reveals, staying in-note is consistent with everything ProsePrince does.
- **Fit**: keep in-note comments; borrow `locateMatch` only as a fallback for jumping to a quoted sentence that has since been edited.

### M. Architecture borrowings (no user-facing change)

- The two-projection scan (counts versus offsets from one parse) is the same problem ProsePrince's masking solves; worth a side-by-side read for edge cases (tilde fences, block ids, footnote marks, `==highlights==`).
- Hit cache versus resolution split: ProsePrince caches per paragraph already; the split matters once suppression comments and user lists grow.
- Lenient JSON with strays carried through, and quarantine of corrupt files, for `lookup-history.json` and anything new.
- Per-device files for anything written on a timer.

## 5. Frontmatter and marker conventions side by side

| Meaning | ProsePrince | Snowflake | Penseed |
|---|---|---|---|
| Scene summary | `summary` | step 8 section body, `snowflake-conflict` | server `chapter_summary` |
| Status | `status` (free) | `snowflake-progress-status` (4 values) | — |
| Point of view | `pov` (name) | `snowflake-pov` (wikilink, `omniscient`, `multiple`) | — |
| Place | `setting` | `snowflake-scene-location` (links) | — |
| Time | `day` | `snowflake-scene-time` (links to Time notes) | — |
| Cast present | `characters`, beat `who:` | `snowflake-scene-characters` (links) | server entities |
| Order | — | `snowflake-rank`, `snowflake-manuscript-sequence` | filename number |
| Word target | `target` | daily goal in settings | — |
| Aliases | `aliases`, World `a \| b` | `aliases` | server `aliases[]` |
| Character note | `type: character` | `snowflake-document: character` | — |
| Hidden data in prose | `%% … %%` | `<!-- snowflake:section:… -->` | none |
| Suppression | `%% not cliche %%` | ignore scopes in JSON | — |
| Threads | — | `foreshadowing.json` | server |

ProsePrince's plain keys and Snowflake's namespaced link-typed keys can coexist in one note. If ProsePrince reads Snowflake's keys at all, it should map `[[path|alias]]` to the alias and otherwise leave them alone.

## 6. Out of ProsePrince's lane

Listed so the decision is deliberate: the manuscript stream and chapter management, corkboard, timeline, freeform canvas, relationship graph, canvas export, project import and series sync, Bases generation, gallery, tasks kanban, sticky notes, i18n of folder names, Penseed's auth and sync, and anything that needs an LLM.

## 7. Questions to settle before choosing

1. Does ProsePrince want to know about the *book*, or only the note? Themes B, C, E, F and G all hinge on this one answer.
2. If threads come in, is a sidebar section enough, or is a board view (Penseed's four columns) wanted?
3. Is author-tagged bookkeeping (threads, reveals, facts) in character for a plugin whose value so far is that it works on untouched prose?
4. Should the Words lens accept regex, or only words and phrases?
5. Are focus and typewriter modes feedback, or a different product?

## Source pointers

Snowflake: `src/domain/markdown-scan.ts`, `analyzable-prose.ts`, `countable-prose.ts`, `aho-corasick.ts`, `entity-matcher.ts`, `mentions.ts`, `sensitive-words.ts`, `custom-highlights.ts`, `dialogue.ts`, `sentences.ts`, `word-frequency.ts`, `foreshadowing.ts`, `revisions.ts`, `beat-sheet-templates.ts`, `src/editor/typewriter.ts`, `caret-paragraph.ts`, `mention-highlights.ts`, `src/templates/markers.ts`, `record-lines.ts`, `src/domain/types.ts`.

Penseed: `src/chapter.ts`, `chapterClassifier.ts`, `chapterNumbering.ts`, `board.ts` (`locateMatch` lines 38 to 103, drag 245 to 321, jump 415 to 471), `main.ts` (edit reminder 121 to 168 and 481 to 537), `review.ts`, `stale.ts`.

Both are MIT licensed. Anything copied goes in `THIRD_PARTY_NOTICES.md`.
