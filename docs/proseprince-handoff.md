# Handoff: ProsePrince (Obsidian fiction-highlighting plugin)

Next session focus: **continue development of ProsePrince**. Read the repo's `README.md` first: it describes the features, known limits and roadmap, and none of that is repeated here.

## Where things are

| What | Path |
|---|---|
| Repo (TypeScript, esbuild, vitest) | WSL: `/home/dan/dev/personal/proseprince` · Mac: `/Users/dan/dev/personal/proseprince` |
| GitHub | `KyteProject/proseprince`. `main` is current; PRs #1–#6 are merged |
| Feature plans and decisions | `docs/thesaurus-plan.md`, `docs/dialogue-lens-plan.md` (each has a status line) |
| Third-party credits | `THIRD_PARTY_NOTICES.md` |
| Installed copy (one story per vault) | `<vault>/.obsidian/plugins/proseprince/` (`main.js`, `manifest.json`, `styles.css`). The user's `data.json`, `lookup-cache.json` and `lookup-history.json` live there too; **never overwrite them** |
| Vault | WSL: `/mnt/d/Obsidian Vaults/Soul Rot` · Mac: `/Users/dan/Documents/Soul Rot`. It syncs between the two with Obsidian Sync, and the user often tests on the Mac |
| The story's World note | `_proseprince/World.md` (user-curated: names with aliases, places, terms) |
| Drafts used for tuning | `60_draft/` in the vault. `Laviathan Wakes Chapter 2.md` is a published chapter kept as a reference benchmark |

**Version:** 0.16.0, built, installed and merged. Beats can carry `%%Beat. target: … who: … change: … %%` notes (see the README sidebar section).

## Commands

```bash
npm install
npx tsc --noEmit                         # type-check
npx vitest run --exclude '.claude/**'    # 175 tests; the exclude skips stale worktrees under .claude/
npm run build                            # tsc + esbuild → main.js (~4 MB: the wink model is inlined into the worker)
npm run harness                          # → harness/dist/harness.js (CodeMirror test page, no Obsidian)
cp main.js manifest.json styles.css "/mnt/d/Obsidian Vaults/Soul Rot/.obsidian/plugins/proseprince/"
```

- **Node:** 22 works on WSL. On the Mac, the old note said to use `nvm use 24`.
- **Pushing from WSL:** SSH to `github.com` fails there; no key matches. Push over HTTPS with the gh login, without touching git config:
  `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push https://github.com/KyteProject/proseprince.git <branch>`
  `gh pr create` and `gh pr merge --merge` work as normal.
- **Ad-hoc probes:** Vitest hides console output. Bundle a small script with `npx esbuild x.ts --bundle --platform=node --format=esm` into the scratchpad and run it with node. That's how attribution, the conventions checks and voices were measured against the drafts.
- **The user runs the services:** don't start dev servers or `npm run dev`.

## Release habit (the user asked for this)

- **Version bumps:** bump the version for **every** build copied into the vault: a minor version for each phase or feature set, a patch version for each fix. Update `package.json` and `manifest.json`, and add the new version to `versions.json` (minAppVersion `1.5.0`). Always tell the user the number; they check it under Community plugins to confirm the build has synced.
- **Branches:** work on a feature branch. Commit, push, open a PR and merge **only when asked**; the user has asked for this at the end of each feature so far. Merge with `--merge`, which keeps the earlier PRs' merge-commit style.
- **Repo copy of this note:** `docs/proseprince-handoff.md` in the repo is untracked; leave it out of commits unless the user says otherwise.

## Code map (pointers only)

- **`src/analysis/`** is pure, worker-side and unit-tested:
  - **Tagging:** `tagger.ts` (wink-nlp plus fixes).
  - **Phrase matching and rules:** `phrases.ts` (lemma trie matcher), `rules/*` (word choice, filter words, passive, adverbs, sentences, metaphor, dialogue punctuation, `dialogueConventions.ts`), `checks.ts` (PoS, stacked modifiers, participles, echoes).
  - **Sidebar support:** `outline.ts` (headings, beats, prose counts, repeated words).
  - **Teaching text:** `guides.ts` (hand-written "How to approach this" guides, plus the `SUGGESTION_ROWS` craft reminders).
  - **Highlights carry extra data:** `lookup` hints (for suggestion rows and pair replacement) and `pairing` (for the usual-pairings row). `ParagraphResult.dialogue` is per **line**.
- **`src/analysis/dialogue/`:**
  - `speech.ts`: speech spans, tags, beats, pronoun links, mentions. Each line is a unit.
  - `attribute.ts`: works out the speaker in this order: pin → tag → pronoun (scene binding) → beat → turn-taking (with an unnamed "other"). Also stable colour slots (six) and untagged runs.
  - `cast.ts`: World note and character-note aliases, and `colour:`.
  - `voices.ts`: per-speaker statistics and log-odds "their words", with the prior tuned on the Leviathan Wakes chapter.
- **`src/lookup/`:** optional Datamuse lookups.
  - `datamuse.ts`, `rank.ts`: queries, the PoS filter, the rare-word label, already-inflected forms.
  - `inflect.ts`: British spellings and irregular verbs.
  - `edit.ts`: pair replacement with comma and capital tidy-up.
  - `suggest.ts`: hover rows, "other ways to <verb>", usual pairings.
  - `service.ts`: disk cache, in-flight sharing, backoff.
  - `history.ts`, `popover.ts`: lookup history, and the right-click card.
- **`src/editor/highlighter.ts`:** the CodeMirror ViewPlugin.
  - Whole-paragraph analysis, cache, hover cards (including suggestion rows and the speaker card).
  - `shown()` is the single highlight filter, shared with the sidebar.
  - Dialogue lens drawing; `outlineNow()` / `outlineReport()` for the sidebar; `voiceReport()`.
  - It talks to the plugin only through `HighlighterHost`. **Don't import `obsidian` in `src/analysis`, `src/editor` or `src/lookup`**, or the harness breaks.
- **Plugin glue:**
  - `src/main.ts`: status bar, lens menu, commands, world index, lookups wiring, and sidebar updates. The sidebar redraws via `reportDocumentReplaced` when a note loads into the same tab.
  - `src/sidebar.ts`: the outline view.
  - `src/voicesModal.ts`: the voices window.
  - `src/settings.ts`, `src/settingsModel.ts`: settings.
  - `src/world.ts`: WorldIndex, plus the speaker index and colours.

## User preferences and decisions (keep honouring these)

- **British English, non-Oxford, with a collaborative tone.** Challenge their ideas when warranted. Use the Socratic method when teaching. Ask before building anything large: they like scope confirmed first, often through a written plan in `docs/`.
- **Never rewrite their prose unprompted.**
  - **Allowed:** replacements they pick themselves (lookups, suggestion chips). Pair replacement is one undoable edit.
  - **Guides:** stay static, hand-written, with invented examples.
  - **No AI/LLM features** unless they ask.
- **Offline by default.** The only network use is the opt-in Datamuse lookups, which send only the word or phrase being looked up. Sending neighbouring words was tested and dropped. Datamuse needs an API key from 1 Feb 2027; the user should request one.
- **Compact UI.** The status bar is icons only, and lenses stack. Highlights inside dialogue are **hidden by default** (characters don't talk like Le Guin), with a toggle for an edit pass. Narration dims to 58% opacity under the Dialogue lens.
- **Speaker colours:** six distinct hues, **no red** (it reads as an error). The colour is drawn as an underline, so it never clashes with check tints or PoS colours.
- **Dialogue conventions:** aim at industry-standard fiction conventions, since the user is learning them. Comma inside the quotes, speaker before the verb, said-bookisms flagged, showy tags only as a hint, a new speaker on a new line. Their drafts often put one speaker per line with no blank line between, so the line is the unit.
- **One vault per story.** `_proseprince/` holds the World note. Character notes have idea-style titles with `type: character`, so names come from aliases and the World note.
- **Tune on real text.** Before changing tagging or attribution rules, run them on the drafts **and** the Leviathan Wakes chapter, and report false positives honestly. The published chapter produced zero conventions findings, which makes it a good false-positive check.
- **Licensing:** reused lists are credited in `THIRD_PARTY_NOTICES.md`, which also covers Datamuse, Wiktionary (CC BY-SA) and the Creative Thesaurus/Writer designs. iwl.me was used only as a benchmark; never copy from it.

## Not yet verified inside Obsidian

**Confirmed by the user:**
- the right-click lookup card;
- hover suggestion rows;
- the Dialogue lens basics;
- the sidebar, including switching notes.

**Not confirmed:**
- the "Your lookups" stats on the settings page;
- the voices window;
- the speaker card's pin and unpin buttons;
- `colour:` on character notes;
- the World note alias `- Shaddid | the captain`;
- the sidebar's target bar and session words;
- the rhythm sparkline as redrawn in 0.14.1.

## Open ideas

The roadmap in the README is the list. The user has shown most interest in:
- point of view and head-hopping (frontmatter `pov` is in every draft);
- the Words lens, seeded from the sidebar's repeated words and lookup history;
- the dangling-opener check.

Separately, the note name finder (`namesInText`) is noisy: it takes "The", "His" and "Captain" for names. It's worth fixing on its own, and the parts-of-speech colours would benefit too.
