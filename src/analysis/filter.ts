import type { AnalysisOptions, Highlight } from "./types";

/** Apply the user's toggles to cached results. Kept free of tagger imports so wink stays in the worker bundle only. */
export function filterHighlights(highlights: Highlight[], options: AnalysisOptions): Highlight[] {
	return highlights.filter((h) => ("pos" in h.kind ? options.pos[h.kind.pos] : options.checks[h.kind.check]) === true);
}
