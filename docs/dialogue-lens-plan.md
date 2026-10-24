# Plan: Dialogue lens

Status: phase 1 built in 0.10.0 (2026-10-24). Pins use `%% speaker: Name %%` (not `%% Name %%`, so other comments are never read as pins). Phase 2 (conventions checks and guides) built in 0.11.0. 0.12.0: lines as dialogue units, titles, described aliases, scene pronoun binding, six non-red colours, every-fifth-line untagged runs. Phase 3 not started.

## Goal

A lens for three questions, in this order:

1. **Who is speaking?** Show each line's speaker. Make it obvious where a reader would lose track.
2. **How is the scene shaped?** Show where the talk is and where narration takes over.
3. **Do the voices differ?** Show how each character talks, compared with the others.

It also nudges dialogue towards standard fiction conventions (punctuation, tags, thoughts). Those conventions are written as rules with hand-written guides, so more can be added later.

## Decisions so far

- **Speaker colour:** a coloured underline. It stacks with check tints (backgrounds) and part-of-speech colours (text) without clashing.
- **The lens covers all three purposes:** attribution, scene shape and voices.
- **Described speakers count:** "the inspector" and "his father" are speakers in their own right. Standard practice allows a described speaker when the viewpoint character doesn't know a name, or when a role reads better than a name. The conventions checks nudge the *form*: "his father replied" rather than "replied his father".
- **Narration and highlights:** two quick toggles, both in the status-bar lens menu and as commands.
  - **Dim narration:** on by default with the lens.
  - **Highlights inside dialogue:** off by default with the lens. Characters don't talk like Le Guin, so craft and part-of-speech highlights inside speech are hidden. Switch them on for an edit pass.

  The second toggle is general: it can also be used without the Dialogue lens.

## 1. Finding speech and thought

- **Speech:** straight and curly double quotes, as now. A quote left open at the end of a paragraph continues into the next one, as it does now.
- **Thought:** italics covering a whole sentence or paragraph, or speech with a thought verb as its tag (*thought*, *wondered*). Thought gets a lighter, dashed underline.
- **Single quotes:** an option, off by default. Your drafts use double quotes, and single quotes mostly show up as mistakes.
- **Later:** dash-style dialogue and guillemets.

## 2. Who is speaking

Each paragraph is analysed in the worker and cached as now. A light pass on the main thread works out turn-taking across paragraphs, much as the note-wide readability pass does. Rules, first match wins:

1. **Pin:** `%% Linh %%` in the paragraph, in the same style as `%% not … %%`.
2. **Tag:** a speaker next to a tag verb, in either order. "Linh said", "said Linh", "Said Linh" and "the inspector said" all count.

   A speaker is any of:
   - a cast name or alias, from the World note and character notes;
   - a capitalised name found in this note;
   - a described noun phrase: *the / his / her / their* + a noun, e.g. *the inspector*, *his father*.
3. **Beat:** the paragraph's narration names exactly one speaker ("Linh set down his cup. 'Fine.'").
4. **Turns:** in a two-person exchange, an untagged line goes to whoever didn't speak last. This only applies within two paragraphs of the last attributed line, and resets at headings and scene breaks.

**Certainty and pronouns:**
- **Pronoun tags** ("he said") aren't resolved from the pronoun. They take the turn-taking guess, and if that agrees with the pronoun's number they count as certain.
- **Certain:** pin, tag and beat; also a pronoun tag that agrees with turn-taking.
- **Guesses:** everything else is a guess, drawn as a grey dotted underline.

**Colours:**
- Each name keeps the same colour from a stable hash into a palette of six colours tuned for light and dark themes, none of them red (red reads as an error in an editor). Adding characters never shifts existing colours.
- `colour:` on a character note, or `Name #hex` in the World note, sets one by hand.
- Two speakers that clash in one scene get moved apart.

## 3. Hover card on speech

- **Header:** "Linh · tag", or "Guess: the inspector · turn-taking".
- **Pin buttons:** the scene's speakers as chips. Clicking one writes `%% Name %%`.
- **"Not speech":** writes `%% not speech %%`.
- **Voice line:** this speaker in this note, e.g. "Linh: 14 lines · 6 words a line on average · 30% of the dialogue".

## 4. Scene shape

- **Dimming:** narration dims while the lens is on (toggle above).
- **Status bar:** the existing dialogue share stays in the readability tooltip. With the lens on, it also names the scene's speakers.
- **Long runs:** a hint flags long stretches of narration-only or dialogue-only paragraphs (e.g. eight or more). This is a hint, not a rule.

## 5. Voices

The command *Dialogue: voices in this note* opens a small window with a table:

- one row per speaker;
- columns: lines, words, average words per line, questions, exclamations;
- **words this speaker uses most compared with the others**, worked out with a standard word-comparison statistic and with common words left out.

It reads the note only and is never sent anywhere. The Accents idea (words a character would or wouldn't say) can build on this later.

## 6. Dialogue conventions (new checks, Dialogue group, on with the lens and the Style lens)

Each check gets a hand-written guide: the principle, invented before → after examples, and when to keep the original.

| Check | Example | Convention |
|---|---|---|
| Comma outside the quotes | `"Liar", Linh mouthed.` | Punctuation ends inside: `"Liar," Linh mouthed.` (US and UK fiction alike) |
| Full stop before a tag (fix existing miss) | `"No, mam." replied his father.` | A comma joins line and tag |
| Mismatched quotes | `'The fuck is that?",` | Open and close with the same mark |
| Said-bookisms that can't carry speech | `"Fine," she smiled.` | Smiling, laughing, sighing, shrugging and nodding don't make words; use *said* and a beat: `"Fine." She smiled.` |
| Showy tag verbs | scoffed, hissed, exclaimed | Hint only, with King's *said* reminder; strength by verb |
| Inverted tag with a short subject | `said he`, `replied Linh` | Modern order is subject first. Inverting is fine with a long subject ("said the man by the door") |
| Two speakers in one paragraph | two different tag subjects | New speaker, new paragraph |
| Long untagged exchange | 5+ lines in a row with no tag or beat | Re-anchor the reader every few lines |
| Thought in quotes, or "thought to himself" | `'…,' he thought to himself` | Direct thought in italics without quotes; "to himself" is implied |

Tagging every line in a two-person exchange is a matter of taste rather than a convention, so there's no check for it.

## Out of scope for this build

- the Accents lens (character word lists);
- the manuscript view;
- dash-style dialogue;
- pronoun resolution beyond the turn-taking agreement;
- online lookups for dialogue.

## Phases

1. **Lens and attribution:** spans, speakers, underline colours, dimming, the highlights-in-dialogue toggle, the hover card with pins.
2. **Conventions checks and guides:** including the existing full-stop bug.
3. **Voices:** the hover voice line, the voices window and the long-run hint.

## Testing

- **Unit tests:** attribution on invented scenes, covering each rule and reset, and each conventions check.
- **Real passages:** before tuning, run on your drafts and report false positives honestly, as with the tagger rules. Your scenes will be rewritten, so they're for measuring, not for fitting to.
