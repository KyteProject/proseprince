# Plan: optional online thesaurus and dictionary

Status: phases 1 and 2 built in 0.7.0, the "Your lookups" stats in 0.8.0, usual pairings and the Sound drawer in 0.9.0 (2026-10-15). Free Dictionary examples skipped: the API was unreachable on both probes. Context words are not sent: tested, Datamuse barely reorders with lc/rc. Words-lens tie-in waits for the Words lens; the offline WordNet pack is undecided.

## Decisions

1. **Online data enriches the cards only.** Highlights and detection stay offline and deterministic. "Richer" covers both the suggestions and their explanations: each suggestion carries a short definition, so the difference between *stroll*, *saunter* and *meander* is visible before choosing.
2. **Dialogue-tag adverbs do get suggestions** ("said softly" → murmured, whispered). They always come with King's reminder that a plain *said* is invisible and a vivid tag draws the eye. The reminder shows whether or not the King lens is on.
3. **Pair replacement:** when a finding has a partner word (an adverb, qualifier or nominalisation), choosing a suggestion replaces the whole pair. "Walked slowly" → "strolled", "very cold" → "freezing", "made a decision" → "decided".
4. **Lookup history is kept, but not shown in the popover.** Stats live on the settings page.

## Goal

Add word knowledge (synonyms, definitions, frequent pairings, word frequency) from an online source, without changing what ProsePrince does offline. It has two entry points:

1. **Hover cards**: when a card for a finding is open, add a small "Words to try" or "Common pairings" section that fits that kind of finding.
2. **Right-click on any word**: *Look up "word"* opens a popover with definitions and synonyms. Clicking a synonym replaces the word, keeping its case and inflection.

## Principles

- **Opt-in and off by default.** With it off, the plugin makes no network calls and behaves exactly as 0.6.1 does.
- **Offline is never degraded.** Highlighting stays deterministic and local. Online data only adds to the cards; it never changes which highlights appear (see open question 1).
- **Only the word goes out.** Each request carries the word, plus at most one neighbouring word for context ("walked" + "slowly"). Paragraphs are never sent.
- **The writer chooses.** Suggestions are a menu. Text changes only when the writer clicks a replacement, and that is a single undoable edit.
- **Spend requests carefully.** Requests are made only from an open hover card or an explicit right-click. Each card makes at most one request, results are cached on disk, and identical requests already in flight are shared.
- **No LLM.** The creative-thesaurus plugin has an Ollama mode; that stays out unless you ask for it.

## Data source

**Datamuse** (`https://api.datamuse.com/words`) is the engine behind OneLook's thesaurus, so it is the one to use.

- It needs no key until **1 February 2027**. After that, every request needs an API key, with a limit of 100,000 requests a day per key, and you request a key through their feedback form. The settings will have a key field from the start. Datamuse hasn't published how the key is passed yet, so that one line waits until a key exists.
- It sends CORS headers, but the plugin will use Obsidian's `requestUrl` anyway. The harness and tests get an injected `fetch` or fixtures.
- One request can return words, part of speech, frequency and definitions together (`md=dpf`).

Probes against the live API confirmed these queries:

| Query | Example | Result | Use |
|---|---|---|---|
| `ml=<verb>+<adverb>`, keep `v` | walk slowly | stroll, saunter, meander | Adverb check: one stronger verb |
| `ml=very+<adj>`, keep `adj` | very cold | freezing, frigid, arctic | Qualifier check: one exact word |
| `rel_gen=<lemma>` (more specific kinds) | walk / look | saunter, stride, trudge / gaze, glance, leer | Plain verbs and echoes: more specific options |
| `ml=<phrase>`, keep `v` | make decision | decide, resolve, determine | Nominalisations |
| `rel_syn=<lemma>` filtered by PoS | | noisy without the filter (walk → "pass, paseo, walkway") | Echoes, right-click |
| `rel_jjb=<noun>` | silence | dead, complete, profound, deep… | "Common pairings": is your adjective a predictable one? |
| `sp=<word>&qe=sp&md=dpf` | tremble | definitions by PoS, frequency | Right-click definitions |
| `rel_ant=<lemma>` | cold | hot, heat | Right-click (low priority) |

Lessons from the probes:

- **Query by lemma, not surface form.** `rel_syn=walked` returns nothing and `rel_syn=walk` works. The tagger already provides lemmas.
- **Always filter by the tagger's PoS.** Without it, verb queries come back mostly as nouns.
- **Use the `f:` frequency to label and order results.** Rare or clinical words such as "ambulate" (frequency under about 1 per million) get a muted label rather than being hidden.
- **Drop multi-word junk by default.** Examples are "base on balls" and "walk of life".

**OneLook** offers no public thesaurus API apart from Datamuse. It appears only as an "Open in OneLook ↗" link in the popover, which costs no request.

**Free Dictionary API** (dictionaryapi.dev) would add example sentences. It was down when probed (HTTP 522), so it is deferred and kept as a possible second provider behind the same interface.

**Definitions** from `md=d` look like Wiktionary text (CC BY-SA). Show a small source line in the popover and add Datamuse and Wiktionary to THIRD_PARTY_NOTICES.

## Architecture

```
src/lookup/                      (pure; no obsidian import; unit-tested)
  datamuse.ts    build query URLs, parse responses into LookupResult
  plan.ts        CheckKind + target → which query (one per hover)
  rank.ts        PoS filter, frequency bands, multi-word filter, dedupe against original
  inflect.ts     re-inflect a base-form suggestion to match the original (walked → strolled)
  casing.ts      keep Capitalised / ALL CAPS
src/lookupService.ts             (main thread) cache, in-flight dedupe, offline backoff, daily count
src/lookupPopover.ts             right-click popover (plain DOM, reusable in the harness)
```

- **`HighlighterHost` gains an optional `lookup?(q)`.** The harness can stub it with fixtures, and when it is absent the cards simply skip the section.
- **`Highlight` gains an optional `target?: { lemma, pos, context? }`.** The rules that create highlights fill it in:
  - adverb: the verb plus the adverb;
  - qualifier: the following adjective;
  - echo: the lemma;
  - nominalisation: the phrase;
  - stacked modifier and metaphor: the head noun.

  Results are still plain objects from the worker, so the paragraph cache is unaffected.
- **Hover cards render at once, as now.** The card gets a placeholder that fills in once the hover has stayed open for about 400 ms and the request resolves. The update is guarded by `dom.isConnected` and abandoned in the tooltip's `destroy`. A failed request removes the section silently.
- **Inflection.** A small rule-based inflector handles `-s`, `-ed`, `-ing` and comparatives, with a table of irregular verbs (stride → strode). Where it can't be sure, it shows the base form and replaces with the base form. Base forms come back from Datamuse; re-inflecting them is our job, and creative-thesaurus doesn't attempt it.

## Hover enrichment by check

| Check | Card addition | Query |
|---|---|---|
| Manner adverb ("walked slowly") | *One verb instead:* strolled · sauntered · meandered | `ml=walk slowly`, verbs only |
| Qualifier ("very cold") | *One exact word:* freezing · frigid | `ml=very cold`, adjectives only |
| Echo ("dark… dark") | *Other words:* dim · murky · shadowed | `rel_syn` + `rel_gen`, same PoS |
| Nominalisation ("made a decision") | *As a verb:* decided · resolved | `ml=make decision`, verbs only |
| Stacked modifier / metaphor (adjective + noun) | *Common pairings for "silence":* dead, complete, profound. Yours is one of them, or it isn't. | `rel_jjb=<noun>` |
| Dialogue-tag adverb ("said softly") | *One verb instead:* murmured · whispered, plus King's reminder (below) | `ml=said softly`, verbs only |
| Clichés, filter words, passive, punctuation, hedges | Nothing; the static guide already covers these | none |

The "Common pairings" section is the educational piece. It shows the writer how predictable their pairing is without suggesting a rewrite.

### Explanations

- **Every suggestion chip shows its first definition** on hover or focus, in the matching PoS. The definitions come back in the same request (`md=dpf`), so this costs nothing extra.
- **Rare words are labelled, not hidden.** A word such as "ambulate" gets a muted *rare* label, so the writer knows it will stand out on the page.
- **Fixed craft reminders sit next to suggestions where a rule applies.** These are hand-written and live in `guides.ts` next to the existing guides. They show regardless of which lenses are on:
  - **Dialogue-tag adverb:** "King: *said* is nearly invisible. A vivid tag pulls the eye off the dialogue, so use these sparingly and let the line carry the tone."
  - **Manner adverb:** "Pick the verb that already moves the way the adverb says."
  - **Qualifier:** "One exact word beats an intensifier and a vague one."

### Pair replacement

- **Each finding records the spans to change.** A finding with a partner word carries `target.replace` (the span the suggestion replaces) and `target.remove` (the partner's span, if it isn't next to it).
- **Choosing a suggestion is one CodeMirror transaction**, so a single undo restores the original.
- **The edit cleans up after itself.** It tidies the space or comma left by the removed word, and when a removed opening word ("Slowly, she walked") moves a lowercase word to the start of the sentence, it capitalises it.
- **Cases handled:**
  - verb + adverb, either order and adjacent or not;
  - fronted adverb + comma;
  - qualifier + adjective;
  - nominalisation phrase;
  - a tag adverb before or after "said".
- **Anything that can't be mapped safely falls back to replacing just the single word.**

## Right-click lookup

- **Menu entry:** `editor-menu` adds *Look up "word"* to the existing `proseprince` section. It uses the selection, or the word under the cursor, the same way `addWorldMenu` does. It appears only when lookups are switched on.
- **Popover:** anchored at the word and styled like the hover cards. It holds:
  - definitions grouped by PoS (the first 3, with "more");
  - synonyms shown as chips, in the word's tagged PoS first;
  - a "More specific" row from `rel_gen`;
  - "Open in OneLook ↗".

  Clicking a chip replaces the word, keeping inflection and case. Keys: ↑↓, Enter and Esc. Clicks use mousedown so the editor keeps focus.
- **Command:** *Look up word at cursor*, which you can bind to a hotkey. It follows creative-thesaurus's order: selection, then word.
- **Offline or uncached:** the popover says "Offline: lookups resume when you're connected" and still shows any cached result.

Patterns worth borrowing from creative-thesaurus (MIT): abortable `requestUrl`, dropping stale responses, Unicode-aware `wordAt`, and rendering everything via `textContent`. Its cache rewrites the whole file on every hit; ours won't.

## Lookup history

- **What is recorded:** each lookup (word, PoS, check kind or right-click, date) and each pick (original → chosen). It is stored locally in `lookup-history.json` in the plugin folder. The popover never shows it.
- **Settings page "Your lookups":**
  - words looked up most;
  - words most often replaced, and what you chose instead;
  - picks by check kind (e.g. 14 adverb pairs collapsed into one verb);
  - requests today.

  Clear and toggle controls sit alongside.
- **Later tie-in:** the roadmap's "writer's own word lists" (Words lens) could take words you replace often as a starting watch list, with an *Add to my words* button in the stats.

## Cache and quota

- **Cache file:** `lookup-cache.json` in the plugin folder, separate from `data.json` so settings stay small. It is LRU with about 5,000 entries and a 180-day TTL (word data barely changes). It is written at most once every 30 s, and only when something changed. Failures and partial results are never cached.
- **Backoff:** after a network failure, no requests for 2 minutes (and none while `navigator.onLine` is false).
- **Counter:** a requests-today counter in settings, so the quota is visible.
- **Expected volume:** a few hundred requests a day at most. That is far below 100k, but it matters for politeness and for after the key arrives.

## Settings ("Word lookups (online)", placed before Advanced)

- **Use online word lookups (Datamuse):** off by default. The description explains what is sent.
- **API key:** optional until February 2027.
- **Add suggestions to hover cards** and **Right-click lookup**: these default to on once lookups are switched on.
- **Hide rare words:** frequency threshold.
- **Cache:** shows the entry count, with a *Clear* button.
- **Keep lookup history:** on by default. The "Your lookups" stats sit below it, with a *Clear history* button.

## Docs to update

- README "entirely offline" lines (README.md:5 and :58) and the `manifest.json` description: reword to "offline by default; optional online lookups".
- A new README section on what is sent, and where.
- THIRD_PARTY_NOTICES: Datamuse, Wiktionary (CC BY-SA), and creative-thesaurus for the patterns borrowed.

## Testing

- **Unit tests:**
  - query planning per check;
  - response parsing against recorded JSON fixtures (saved from the probes);
  - PoS and frequency ranking;
  - the inflector (regular and irregular forms, plus base-form fallback);
  - case preservation;
  - cache LRU and TTL;
  - backoff.
- **Harness:** `host.lookup` backed by fixtures, so hover cards and the popover can be checked with no network.
- **In Obsidian:** the right-click entry, the replace-and-undo round trip, behaviour offline (Wi-Fi off), and that nothing is requested while the feature is off. Watch the network panel in the developer tools.

## Phases

1. **Foundation and right-click lookup.** This phase is useful on its own and doesn't touch the analysis. It covers:
   - the lookup modules, service, cache and settings;
   - the popover, with single-word replacement;
   - recording history.
2. **Hover enrichment.** This phase adds:
   - `Highlight.target` (lemma, PoS, replace and remove spans) in the rules;
   - the plan table above and async card sections;
   - definitions on the chips, and the craft reminders;
   - pair replacement.
3. **Stats and extras.** The "Your lookups" settings page comes first. After that, if wanted:
   - "Common pairings" teaching;
   - rhymes and sound-alikes (`rel_rhy`, `sl`) for the future Le Guin *sound* chapter;
   - Free Dictionary examples;
   - the Words-lens tie-in;
   - an offline WordNet pack as a separate download.

## Open questions

1. **API key:** request one from Datamuse now, so it is in hand before 1 February 2027.

Settled: history stays in the vault's plugin folder, so each story keeps its own. No cross-story view.
