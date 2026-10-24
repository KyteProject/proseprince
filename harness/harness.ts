// Dev harness: the real highlighter + inline worker in a plain CodeMirror editor, outside Obsidian.
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ResultCache } from "../src/editor/cache";
import { createHighlighter, type ReadabilityState } from "../src/editor/highlighter";
import { LookupHistory } from "../src/lookup/history";
import { openLookupPopover } from "../src/lookup/popover";
import { LookupService } from "../src/lookup/service";
import { suggestForHint, usualPairings } from "../src/lookup/suggest";
import type { LookupHint, Pairing } from "../src/analysis/types";
import { DEFAULT_SETTINGS, LENSES, lensSummary, type ProsePrinceSettings } from "../src/settingsModel";
import { AnalysisClient } from "../src/worker/client";

const SAMPLE = `# A sample scene

Mara felt a hot, sick anger as the old, cracked door groaned open. She saw the _silky green liquid_ pooling on the step, really just very still. At the end of the day, she had bitten the bullet.

"I think we should go," Tomas said quietly, though he was kind of tired and a little cold. He shrugged his shoulders.

The letter had been sent by someone. Perhaps a lot of people knew. She made a decision to leave, and a flood of memories came back.

She ran. She hid. She waited. She slept. The house at the end of the long and winding lane by the river was old and grey and empty.

His frayed nerves and disjointed thoughts circled the door, the door, the door. %% not echo %%

\`\`\`
code blocks are ignored: she felt very sad
\`\`\`
`;

const host = {
	settings: structuredClone(DEFAULT_SETTINGS) as ProsePrinceSettings,
	client: new AnalysisClient(),
	cache: new ResultCache(),
	errors: [] as string[],
	readability: null as ReadabilityState | null,
	reportError(error: Error) {
		this.errors.push(error.message);
		console.error(error);
	},
	cast: new Set<string>(),
	terms: new Set<string>(),
	castNames() {
		return this.cast;
	},
	worldTerms() {
		return this.terms;
	},
	active: true,
	isActive() {
		return this.active;
	},
	reportReadability(_view: EditorView, state: ReadabilityState) {
		this.readability = state;
		const r = state.paragraph ?? state.note;
		document.getElementById("status")!.textContent = r?.readingEase
			? `${state.paragraph ? "¶" : "Note"}: Ease ${r.readingEase.band.label.toLowerCase()}${r.variety ? ` · rhythm ${r.variety.band.label.toLowerCase()}` : ""} | Note: ${state.note?.words ?? "…"} words, grade ${state.note?.grade?.toFixed(1) ?? "…"}`
			: "";
	},
};

const { extension, plugin } = createHighlighter(host);
const view = new EditorView({
	state: EditorState.create({ doc: SAMPLE, extensions: [extension, EditorView.lineWrapping] }),
	parent: document.getElementById("editor")!,
});

const refresh = () => view.plugin(plugin)?.refresh();
const controls = document.getElementById("controls")!;
for (const lens of LENSES) {
	const button = document.createElement("button");
	button.textContent = lens.name;
	button.title = `Turns on: ${lensSummary(lens)}`;
	const paint = () => (button.style.background = host.settings.lenses[lens.id] ? "#dbe8ff" : "#fff");
	paint();
	button.onclick = () => {
		host.settings.lenses[lens.id] = !host.settings.lenses[lens.id];
		paint();
		refresh();
	};
	controls.append(button);
}

// Online lookups, as in Obsidian but with fetch (Datamuse sends CORS headers). In-memory cache only.
const lookups = new LookupService({
	fetchJson: async (url) => {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return response.json() as Promise<unknown>;
	},
	apiKey: () => host.settings.lookup.apiKey,
	online: () => navigator.onLine,
});
const history = new LookupHistory();
Object.assign(host, {
	suggest: (hint: LookupHint) => (host.settings.lookup.enabled ? suggestForHint(lookups, hint, host.settings.lookup.hideRare) : null),
	recordPick: (a: string, b: string, source: string) => history.recordPick(a, b, source),
	pairings: (pairing: Pairing) => (host.settings.lookup.enabled ? usualPairings(lookups, pairing) : null),
});
async function lookUp(): Promise<void> {
	const { from, to } = view.state.selection.main;
	const word = from === to ? view.state.wordAt(from) : { from, to };
	if (!word) return;
	const line = view.state.doc.lineAt(word.from);
	const text = view.state.sliceDoc(word.from, word.to);
	const info = /\s/.test(text) ? null : await host.client.wordInfo(line.text, word.from - line.from, word.to - line.from);
	openLookupPopover(view, { from: word.from, to: word.to, text, info }, {
		service: lookups,
		hideRare: host.settings.lookup.hideRare,
		onLookup: (w) => history.recordLookup(w),
		onPick: (a, b) => history.recordPick(a, b, "lookup"),
	});
}
const lookupButton = document.createElement("button");
lookupButton.textContent = "Look up word at cursor";
lookupButton.onmousedown = (e) => e.preventDefault();
lookupButton.onclick = () => void lookUp();
controls.append(lookupButton);

/** Inspection hook for automated checks: highlighted text grouped by class. */
(window as unknown as Record<string, unknown>).__pp = {
	view,
	host,
	refresh,
	lookups,
	history,
	lookUp,
	highlights() {
		const out: Record<string, string[]> = {};
		view.contentDOM.querySelectorAll("[class*='pp-']").forEach((el) => {
			for (const c of el.classList) if (/^pp-(pos|check|rhythm)-/.test(c)) (out[c] ??= []).push(el.textContent ?? "");
		});
		return out;
	},
};
