import type { EditorView, ViewPlugin } from "@codemirror/view";
import { debounce, type Editor, editorInfoField, FuzzySuggestModal, MarkdownView, Menu, normalizePath, Notice, Plugin, requestUrl, setIcon, TFile, type WorkspaceLeaf } from "obsidian";
import { type Exercise, EXERCISES, exerciseById, exerciseNote } from "./exercises/definitions";
import type { ExerciseContext } from "./editor/highlighter";
import type { ReadabilityReport } from "./analysis/readability";
import { CHECK_KINDS, POS_CATEGORIES } from "./analysis/types";
import { ResultCache } from "./editor/cache";
import { createHighlighter, type HighlightRunner, type ReadabilityState } from "./editor/highlighter";
import { LookupHistory } from "./lookup/history";
import { openLookupPopover } from "./lookup/popover";
import { LookupService } from "./lookup/service";
import { type HintResult, type PairingResult, suggestForHint, usualPairings } from "./lookup/suggest";
import type { LookupHint, Pairing } from "./analysis/types";
import type { DialogueLine } from "./analysis/dialogue/speech";
import { type SceneSpeech, sceneSpeech, speechParagraphs } from "./analysis/dialogue/scene";
import { excludedBlocks } from "./analysis/mask";
import { beatAt, beatNotes, beatsOf, headingsIn } from "./analysis/outline";
import { sceneKnowledge, speechLabel, type Reveal } from "./analysis/relations";
import { compile } from "./analysis/compile";
import { INVENTORY_NAME, inventory } from "./analysis/inventory";
import { fillSceneTemplate, nextSceneNumber, parseSceneName, readThrough, SCENE_TEMPLATE, sceneFileName, sceneLabel, scenePromises, type SceneRecord } from "./analysis/story";
import { ProsePrinceSettingTab } from "./settings";
import type { OutlineReport } from "./editor/highlighter";
import { OUTLINE_VIEW, type OutlineFact, type OutlineStory, OutlineView } from "./sidebar";
import { StoryIndex } from "./story";
import { STORY_VIEW, StoryView, touchDetail, touchLabel } from "./storyView";
import { CompileModal } from "./compileModal";
import { VoicesModal } from "./voicesModal";
import {
	activeLenses,
	clearOverrides,
	DEFAULT_SETTINGS,
	effective,
	inScope,
	LENSES,
	type LensId,
	lensLabel,
	lensSummary,
	migrateLegacy,
	overrideCount,
	type ProsePrinceSettings,
	setRhythm,
} from "./settingsModel";
import { AnalysisClient } from "./worker/client";
import { WorldIndex, type WorldSection } from "./world";

/** Where the prints and dates behind "Needs a look" are kept, beside the plugin's settings. */
const STORY_TRACKING_FILE = "story-tracking.json";

export default class ProsePrincePlugin extends Plugin {
	settings: ProsePrinceSettings = structuredClone(DEFAULT_SETTINGS);
	client = new AnalysisClient();
	cache = new ResultCache();
	private runner: ViewPlugin<HighlightRunner> | null = null;
	private lastErrorAt = 0;
	private lensItem: HTMLElement | null = null;
	private readabilityItem: HTMLElement | null = null;
	private readability = new WeakMap<EditorView, ReadabilityState>();
	/** Last known on/off state per note, so saves that don't change it don't trigger a refresh. */
	private activeState = new Map<string, boolean>();
	/** What the status-bar items currently show, so unchanged content isn't redrawn. */
	private lensShown = "";
	private readabilityShown = "";
	private unloaded = false;
	world = new WorldIndex(this.app, () => this.settings);
	private rebuildWorld = debounce(async () => {
		if (!(await this.world.rebuild())) return;
		this.refreshEditors();
		// The cast is grouped by the World note's names, so it follows them.
		if (!(await this.story.rebuild(true))) return;
		this.renderStory();
		this.refreshOutline();
	}, 800, true);
	/** Online word lookups. Nothing is requested unless `settings.lookup.enabled` is on. */
	lookups = new LookupService({
		fetchJson: async (url) => {
			const response = await requestUrl({ url, method: "GET", throw: false });
			if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
			return response.json as unknown;
		},
		apiKey: () => this.settings.lookup.apiKey,
		online: () => navigator.onLine,
		onChange: () => this.saveLookupCache(),
	});
	lookupHistory = new LookupHistory(() => this.saveLookupHistory());
	/** The book: chapter notes and scenes in the prose folders, re-read when one of them changes. */
	story = new StoryIndex(this.app, () => this.settings.folders, (name) => this.canonicalSpeaker(name), () => this.settings.shapeNote, () => this.saveStoryTracking(), {
		key: () => `${[...this.world.properNouns].join("\u0001")}\u0000${[...this.world.speakers].join("\u0001")}`,
		of: (text) => this.speechOf(text),
	});
	private rebuildStory = debounce(async () => {
		if (!(await this.story.rebuild())) return;
		this.renderStory();
		this.refreshOutline();
	}, 600, true);
	/** The Markdown editor the sidebar describes: the last one that had focus. */
	private outlineSource: MarkdownView | null = null;
	/** Prose words in each note when first seen this session, for "words this session". */
	private sessionStart = new Map<string, number>();
	private refreshOutline = debounce(() => void this.updateOutline(), 400, true);
	private saveLookupCache = debounce(() => void this.writePluginFile("lookup-cache.json", this.lookups.serialize()), 30_000, true);
	private saveLookupHistory = debounce(() => void this.writePluginFile("lookup-history.json", this.lookupHistory.serialize()), 5_000, true);
	/** Prints and dates behind "Needs a look". Not held back to the first rebuild: nothing is saved until it has been read. */
	private saveStoryTracking = debounce(() => {
		if (this.storyTrackingRead) void this.writePluginFile(STORY_TRACKING_FILE, this.story.serialize());
	}, 10_000, true);
	private storyTrackingRead = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.lookups.restore(await this.readPluginFile("lookup-cache.json"));
		this.lookupHistory.restore(await this.readPluginFile("lookup-history.json"));
		this.story.restore(await this.readPluginFile(STORY_TRACKING_FILE));
		this.storyTrackingRead = true;
		const { extension, plugin } = createHighlighter(this);
		this.runner = plugin;
		this.registerEditorExtension(extension);
		this.addSettingTab(new ProsePrinceSettingTab(this.app, this));

		this.registerView(OUTLINE_VIEW, (leaf: WorkspaceLeaf) => new OutlineView(leaf));
		this.addRibbonIcon("scroll-text", "ProsePrince outline", () => void this.openOutline());
		this.addCommand({ id: "open-outline", name: "Open outline sidebar", callback: () => void this.openOutline() });
		this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
			if (!(leaf?.view instanceof MarkdownView)) return;
			// Another tab: draw at once rather than after the typing pause.
			this.outlineSource = leaf.view;
			void this.updateOutline();
		}));
		// Another note opened in the same tab is caught by `reportDocumentReplaced`, once its text has loaded;
		// this is a fallback in case the editor is rebuilt instead (switching view modes).
		this.registerEvent(this.app.workspace.on("file-open", () => {
			window.setTimeout(() => {
				const active = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (active) this.outlineSource = active;
				void this.updateOutline();
			}, 250);
		}));
		this.registerEvent(this.app.workspace.on("editor-change", () => this.refreshOutline()));
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			if (file === this.outlineSource?.file) this.refreshOutline();
		}));
		this.app.workspace.onLayoutReady(() => {
			this.outlineSource = this.app.workspace.getActiveViewOfType(MarkdownView);
			this.refreshOutline();
		});

		// The story view: the whole book, rebuilt when a chapter note or scene is saved, renamed or deleted.
		this.registerView(STORY_VIEW, (leaf: WorkspaceLeaf) => new StoryView(leaf));
		this.addCommand({ id: "open-story", name: "Open story view", callback: () => void this.openStory() });
		this.app.workspace.onLayoutReady(() => void this.rebuildStory());
		this.registerEvent(this.app.metadataCache.on("resolved", () => void this.rebuildStory()));
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			if (this.story.isRelevant(file) || this.story.knows(file.path) || this.story.isCanon(file)) void this.rebuildStory();
		}));
		this.registerEvent(this.app.vault.on("delete", (file) => {
			if (this.story.knows(file.path)) void this.rebuildStory();
		}));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			if (!(file instanceof TFile)) return;
			this.story.renamed(oldPath, file.path);
			if (this.story.knows(oldPath) || this.story.isRelevant(file) || this.story.isCanon(file)) void this.rebuildStory();
		}));
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
			const path = this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
			if (path) for (const v of this.storyViews()) v.setCurrent(path);
		}));
		this.addCommand({
			id: "read-chapter",
			name: "Read through this chapter",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				const record = file ? this.story.record(file.path) : undefined;
				if (!record) return false;
				if (!checking) void this.openReadThrough(record.name.chapter);
				return true;
			},
		});
		this.addCommand({ id: "read-book", name: "Read through the book", callback: () => void this.openReadThrough() });
		this.addCommand({ id: "write-inventory", name: "Write story inventory", callback: () => void this.writeInventory() });
		this.addCommand({
			id: "compile-chapter",
			name: "Compile this chapter",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				const record = file ? this.story.record(file.path) : undefined;
				if (!record) return false;
				if (!checking) void this.compileManuscript(record.name.chapter);
				return true;
			},
		});
		this.addCommand({ id: "compile-book", name: "Compile the book", callback: () => void this.compileManuscript() });
		this.addCommand({
			id: "create-scene-from-beat",
			name: "Create scene from beat",
			editorCheckCallback: (checking: boolean, editor: Editor, ctx) => {
				// Only in a chapter note ("04.00 - The Job"): its headings are the chapter's beats.
				const file = ctx.file;
				const name = file ? parseSceneName(file.basename) : null;
				if (!file || !name || name.scene !== 0 || !this.story.isRelevant(file)) return false;
				if (!checking) void this.createSceneFromBeat(editor, file, name.chapter);
				return true;
			},
		});

		this.lensItem = this.addStatusBarItem();
		this.lensItem.addClass("pp-status-lens", "mod-clickable");
		this.lensItem.setAttribute("aria-label", "ProsePrince lenses: click to switch them on or off");
		this.registerDomEvent(this.lensItem, "click", (evt) => this.lensMenu().showAtMouseEvent(evt));
		this.readabilityItem = this.addStatusBarItem();
		this.readabilityItem.addClass("pp-status-readability");
		this.renderLens();
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
			this.renderLens();
			this.renderReadability();
		}));
		this.registerEvent(this.app.workspace.on("file-open", () => this.renderLens()));
		// A note's own `proseprince:` flag can switch it on or off. Metadata changes on every save,
		// so only refresh when the on/off state actually flips.
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			const now = this.isActiveFile(file);
			const before = this.activeState.get(file.path);
			this.activeState.set(file.path, now);
			if (before !== undefined && before !== now) {
				this.refreshEditors();
				this.renderLens();
			}
		}));
		this.addCommand({
			id: "toggle-note",
			name: "Toggle ProsePrince for this note",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.toggleNote(file);
				return true;
			},
		});

		// The story world: the World note and character notes. Rebuilt when either changes.
		this.app.workspace.onLayoutReady(() => void this.rebuildWorld());
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			if (this.world.isRelevant(file)) this.rebuildWorld();
		}));
		this.registerEvent(this.app.vault.on("delete", (file) => {
			if (file instanceof TFile && this.world.isRelevant(file)) this.rebuildWorld();
		}));
		this.registerEvent(this.app.vault.on("rename", (file) => {
			if (file instanceof TFile) this.rebuildWorld();
		}));
		this.addCommand({ id: "open-world-note", name: "Open world note", callback: () => void this.world.open() });
		for (const [section, label] of [["names", "name"], ["places", "place"], ["terms", "term"]] as [WorldSection, string][]) {
			this.addCommand({
				id: `add-world-${label}`,
				name: `Add selection to world as a ${label}`,
				editorCheckCallback: (checking: boolean, editor: Editor) => {
					const selection = editor.getSelection().trim();
					if (!selection || selection.includes("\n")) return false;
					if (!checking) void this.addToWorld(section, selection);
					return true;
				},
			});
		}
		this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
			this.addLookupMenu(menu, editor);
			this.addWorldMenu(menu, editor);
		}));
		this.addCommand({
			id: "look-up-word",
			name: "Look up word at cursor (online)",
			editorCheckCallback: (checking: boolean, editor: Editor) => {
				if (!this.settings.lookup.enabled || !lookupRange(editor)) return false;
				if (!checking) void this.lookUp(editor);
				return true;
			},
		});

		this.addCommand({
			id: "toggle-highlighting",
			name: "Toggle highlighting",
			callback: async () => {
				this.settings.enabled = !this.settings.enabled;
				await this.saveSettings();
				new Notice(`ProsePrince highlighting ${this.settings.enabled ? "on" : "off"}`);
			},
		});
		this.addCommand({
			id: "toggle-rhythm",
			name: "Toggle sentence rhythm",
			callback: async () => {
				setRhythm(this.settings, !effective(this.settings).rhythm);
				await this.saveSettings();
			},
		});
		for (const lens of LENSES) {
			this.addCommand({
				id: `lens-${lens.id}`,
				name: `Lens: toggle ${lens.name}`,
				callback: async () => {
					const on = await this.toggleLens(lens.id);
					new Notice(`ProsePrince: ${lens.name} ${on ? "on" : "off"}`);
				},
			});
		}
		this.addCommand({
			id: "toggle-dialogue-highlights",
			name: "Toggle highlights inside dialogue",
			callback: async () => {
				const on = await this.toggleDialogueSetting("highlightsInDialogue");
				new Notice(`ProsePrince: highlights inside dialogue ${on ? "on" : "off"}`);
			},
		});
		this.addCommand({ id: "start-exercise", name: "Start exercise…", callback: () => new ExercisePicker(this).open() });
		this.addCommand({
			id: "start-imitation",
			name: "Start imitation exercise from selection",
			editorCheckCallback: (checking: boolean, editor: Editor) => {
				const selection = editor.getSelection().trim();
				if (!selection) return false;
				if (!checking) void this.startExercise(exerciseById("imitation")!, selection);
				return true;
			},
		});
		// A note becoming (or ceasing to be) an exercise switches its lens.
		this.registerEvent(this.app.metadataCache.on("changed", (_file, _data, cache) => {
			if (cache.frontmatter?.["proseprince-exercise"] !== undefined) this.refreshEditors();
		}));
		this.addCommand({
			id: "dialogue-voices",
			name: "Dialogue: voices in this note",
			editorCheckCallback: (checking: boolean, editor: Editor, ctx) => {
				const view = (editor as unknown as { cm?: EditorView }).cm;
				if (!view || !this.runner) return false;
				if (!checking) void this.showVoices(view, ctx.file?.basename ?? "this note");
				return true;
			},
		});
		this.addCommand({
			id: "toggle-dim-narration",
			name: "Dialogue lens: toggle dim narration",
			callback: async () => {
				const on = await this.toggleDialogueSetting("dimNarration");
				new Notice(`ProsePrince: narration ${on ? "dimmed" : "not dimmed"} under the Dialogue lens`);
			},
		});
		this.addCommand({
			id: "lens-clear",
			name: "Lens: switch all lenses off",
			callback: async () => {
				this.settings.lenses = {};
				await this.saveSettings();
			},
		});
		this.addCommand({
			id: "reset-overrides",
			name: "Reset your changes to what the lenses say",
			callback: async () => {
				clearOverrides(this.settings);
				await this.saveSettings();
			},
		});
	}

	/** Folder scope and the note's own `proseprince: true|false` flag. */
	isActive(view: EditorView): boolean {
		const file = view.state.field(editorInfoField, false)?.file;
		return file ? this.isActiveFile(file) : this.settings.folders.length === 0;
	}

	isActiveFile(file: TFile): boolean {
		const flag = this.app.metadataCache.getFileCache(file)?.frontmatter?.proseprince;
		const active = inScope(file.path, this.settings.folders, typeof flag === "boolean" ? flag : undefined);
		this.activeState.set(file.path, active);
		return active;
	}

	/** Flip this note's frontmatter flag to the opposite of its current state. */
	private async toggleNote(file: TFile): Promise<void> {
		const on = !this.isActiveFile(file);
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			// Remove the flag when the folder rule already gives the wanted state, to keep notes tidy.
			if (inScope(file.path, this.settings.folders) === on) delete fm.proseprince;
			else fm.proseprince = on;
		});
		new Notice(`ProsePrince ${on ? "on" : "off"} for ${file.basename}`);
	}

	/**
	 * Who speaks in a scene, from its whole text: the Dialogue lens's reading, without the note being
	 * open. Paragraphs are analysed in the worker and share the editor's cache, so opening the scene
	 * afterwards costs nothing more.
	 */
	private async speechOf(raw: string): Promise<SceneSpeech | null> {
		// Once unloaded, asking the worker anything would start it again.
		if (this.unloaded) return null;
		const text = raw.replace(/\r\n?/g, "\n");
		const paragraphs = speechParagraphs(text, this.castNames());
		const echo = this.settings.echoWindow;
		const keyOf = (p: { text: string; names: string[] }) => ResultCache.key(p.text, echo, p.names);
		// Kept here as well: the cache may let an early paragraph go before a long scene is done.
		const lines = new Map<string, DialogueLine[]>();
		const missing: typeof paragraphs = [];
		for (const p of paragraphs) {
			const key = keyOf(p);
			const cached = this.cache.get(key);
			if (cached) lines.set(key, cached.dialogue);
			else if (!lines.has(key)) {
				lines.set(key, []);
				missing.push(p);
			}
		}
		const BATCH = 40;
		for (let i = 0; i < missing.length; i += BATCH) {
			if (this.unloaded) return null;
			const batch = missing.slice(i, i + BATCH);
			const results = await this.client.analyze(batch.map((p) => ({ text: p.text, names: p.names })), echo);
			if (results.length !== batch.length) return null;
			results.forEach((result, k) => {
				this.cache.set(keyOf(batch[k]!), result);
				lines.set(keyOf(batch[k]!), result.dialogue);
			});
		}
		return sceneSpeech(text, paragraphs, paragraphs.map((p) => lines.get(keyOf(p))), (name) => this.canonicalSpeaker(name));
	}

	canonicalSpeaker(name: string): string {
		return this.world.speakers.get(name.toLowerCase()) ?? name;
	}

	speakerColour(name: string): string | undefined {
		return this.world.speakerColours.get(name);
	}

	castNames(): ReadonlySet<string> {
		return this.world.properNouns;
	}

	worldTerms(): ReadonlySet<string> {
		return this.world.terms;
	}

	/** Right-click: ProsePrince ▸ Add "word" to world ▸ Name / Place / Term. */
	private addWorldMenu(menu: Menu, editor: Editor): void {
		let entry = editor.getSelection().trim();
		if (!entry) {
			const range = editor.wordAt(editor.getCursor());
			entry = range ? editor.getRange(range.from, range.to).trim() : "";
		}
		entry = entry.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
		if (!entry || entry.includes("\n") || entry.length > 60) return;
		const choices: [WorldSection, string, string][] = [["names", "Name", "user"], ["places", "Place", "map-pin"], ["terms", "Term", "book-open"]];
		const flatTitle = (label: string) => `ProsePrince: add "${entry}" to world as a ${label.toLowerCase()}`;
		let submenu: Menu | undefined;
		menu.addItem((item) => {
			item.setTitle(`ProsePrince: add "${entry}" to world`).setIcon("globe").setSection("proseprince");
			// Obsidian supports submenus at runtime, but they are not in the public typings.
			submenu = (item as unknown as { setSubmenu?: () => Menu }).setSubmenu?.();
			if (submenu) {
				for (const [section, label, icon] of choices) {
					submenu.addItem((sub) => sub.setTitle(label).setIcon(icon).onClick(() => void this.addToWorld(section, entry)));
				}
			} else {
				// Older Obsidian without submenus: this item becomes the first of three flat ones.
				item.setTitle(flatTitle("Name")).setIcon("user").onClick(() => void this.addToWorld("names", entry));
			}
		});
		if (submenu) return;
		for (const [section, label, icon] of choices.slice(1)) {
			menu.addItem((item) => item
				.setTitle(flatTitle(label))
				.setIcon(icon)
				.setSection("proseprince")
				.onClick(() => void this.addToWorld(section, entry)));
		}
	}

	/** Words to try in a hover card; null when lookups (or hover suggestions) are off. */
	suggest(hint: LookupHint): Promise<HintResult> | null {
		const { enabled, hoverCards, hideRare } = this.settings.lookup;
		return enabled && hoverCards ? suggestForHint(this.lookups, hint, hideRare) : null;
	}

	/** Whether a modifier + noun pairing is a usual one; null when lookups (or hover suggestions) are off. */
	pairings(pairing: Pairing): Promise<PairingResult> | null {
		const { enabled, hoverCards } = this.settings.lookup;
		return enabled && hoverCards ? usualPairings(this.lookups, pairing) : null;
	}

	recordPick(original: string, chosen: string, source: string): void {
		if (this.settings.lookup.history) this.lookupHistory.recordPick(original, chosen, source);
	}

	/** Right-click: ProsePrince: look up "word". Only when online lookups are switched on. */
	private addLookupMenu(menu: Menu, editor: Editor): void {
		if (!this.settings.lookup.enabled || !this.settings.lookup.rightClick) return;
		const range = lookupRange(editor);
		if (!range) return;
		menu.addItem((item) => item
			.setTitle(`ProsePrince: look up "${range.text}"`)
			.setIcon("book-open-text")
			.setSection("proseprince")
			.onClick(() => void this.lookUp(editor)));
	}

	/** Open the lookup popover for the selection, or the word at the cursor. */
	private async lookUp(editor: Editor): Promise<void> {
		try {
			await this.openLookup(editor);
		} catch (error) {
			console.error("ProsePrince: lookup failed", error);
			new Notice(`ProsePrince could not open the lookup: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async openLookup(editor: Editor): Promise<void> {
		// Each step of opening and closing the card, for the developer console.
		const trace = (step: string) => console.debug(`ProsePrince lookup: ${step}`);
		const range = lookupRange(editor);
		trace(`started for "${range?.text ?? "(no word)"}"`);
		const view = (editor as unknown as { cm?: EditorView }).cm;
		if (!range) throw new Error("no word at the cursor");
		if (!view) throw new Error("no editor view");
		const line = editor.getLine(range.line);
		const names = [...this.castNames()].filter((n) => line.includes(n));
		// The worker may be busy with a long analysis pass; don't let that hold the card back.
		const tagged = this.client.wordInfo(line, range.fromCh, range.toCh, names).catch((error: unknown) => {
			console.warn("ProsePrince: could not tag the word for lookup", error);
			return null;
		});
		const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), WORD_INFO_TIMEOUT));
		const info = /\s/.test(range.text) ? null : await Promise.race([tagged, timeout]);
		if (!info && !/\s/.test(range.text)) console.warn(`ProsePrince: looking up "${range.text}" without its part of speech`);
		trace(info ? `tagged as ${info.upos} (${info.lemma})` : "no tag, going ahead");
		const from = editor.posToOffset({ line: range.line, ch: range.fromCh });
		openLookupPopover(view, { from, to: from + range.text.length, text: range.text, info }, {
			service: this.lookups,
			hideRare: this.settings.lookup.hideRare,
			onLookup: (word) => {
				if (this.settings.lookup.history) this.lookupHistory.recordLookup(word);
			},
			onPick: (original, chosen) => {
				if (this.settings.lookup.history) this.lookupHistory.recordPick(original, chosen, "lookup");
			},
			trace,
		});
	}

	private pluginFile(name: string): string {
		return `${this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`}/${name}`;
	}

	private async readPluginFile(name: string): Promise<string | null> {
		const path = this.pluginFile(name);
		try {
			return (await this.app.vault.adapter.exists(path)) ? await this.app.vault.adapter.read(path) : null;
		} catch (error) {
			console.error(`ProsePrince: could not read ${path}`, error);
			return null;
		}
	}

	private async writePluginFile(name: string, text: string): Promise<void> {
		try {
			await this.app.vault.adapter.write(this.pluginFile(name), text);
		} catch (error) {
			console.error(`ProsePrince: could not save ${name}`, error);
		}
	}

	private async addToWorld(section: WorldSection, entry: string): Promise<void> {
		if (!(await this.world.add(section, entry))) {
			new Notice(`ProsePrince: "${entry}" is already in the world note`);
			return;
		}
		await this.world.rebuild();
		this.refreshEditors();
		new Notice(`ProsePrince: added "${entry}" to ${section} in ${this.world.worldNotePath}`);
	}

	onunload(): void {
		this.unloaded = true;
		this.saveLookupCache.run();
		this.saveLookupHistory.run();
		this.saveStoryTracking.run();
		this.client.dispose();
		this.cache.clear();
	}

	/** The exercise an editor's note is for: frontmatter `proseprince-exercise:` naming a known exercise. */
	exerciseOf(view: EditorView): ExerciseContext | null {
		const file = view.state.field(editorInfoField, false)?.file;
		const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined;
		const exercise = fm ? exerciseById(String(fm["proseprince-exercise"] ?? "")) : undefined;
		if (!exercise) return null;
		const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
		return { exercise, subject: str(fm!.subject), written: str(fm!.written) };
	}

	/** Create a new exercise note in the exercise folder and open it in a new tab. */
	async startExercise(exercise: Exercise, model?: string): Promise<void> {
		if (exercise.needsModel && !model) {
			new Notice("Select a passage you admire in any note, then run \"Start imitation exercise from selection\".");
			return;
		}
		const now = new Date();
		const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		const folder = normalizePath(this.settings.exerciseFolder.trim() || "_proseprince/Exercises");
		if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		let path = normalizePath(`${folder}/${today} ${exercise.title}.md`);
		for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${folder}/${today} ${exercise.title} ${n}.md`);
		const file = await this.app.vault.create(path, exerciseNote(exercise, today, model));
		await this.app.workspace.getLeaf("tab").openFile(file);
		new Notice(`ProsePrince: ${exercise.title}. The brief is folded at the top; only this exercise's rules are flagged.`);
	}

	/**
	 * Start a scene for the beat at the cursor of a chapter note: a new numbered file from the scene
	 * template, its people taken from the beat's `who:` line, and a link to it added under the beat.
	 */
	private async createSceneFromBeat(editor: Editor, chapterNote: TFile, chapter: number): Promise<void> {
		const text = editor.getValue();
		const headings = headingsIn(text, excludedBlocks(text));
		const { beats } = beatsOf(headings);
		const at = beatAt(beats, editor.posToOffset(editor.getCursor()));
		const beat = beats[at];
		if (!beat) {
			new Notice("ProsePrince: put the cursor in a beat first (under one of the chapter's headings).");
			return;
		}
		const folder = chapterNote.parent?.path && chapterNote.parent.path !== "/" ? chapterNote.parent.path : "";
		const basename = sceneFileName(chapter, nextSceneNumber(this.story.namesIn(chapterNote.parent?.path ?? ""), chapter), beat.text);
		const path = normalizePath(`${folder ? `${folder}/` : ""}${basename}.md`);
		if (this.app.vault.getAbstractFileByPath(path)) {
			new Notice(`ProsePrince: "${basename}" already exists.`);
			return;
		}
		const templatePath = this.settings.sceneTemplate.trim();
		const templateFile = templatePath ? this.app.vault.getAbstractFileByPath(normalizePath(templatePath)) : null;
		const template = templateFile instanceof TFile ? await this.app.vault.cachedRead(templateFile) : SCENE_TEMPLATE;
		const now = new Date();
		const pov = this.app.metadataCache.getFileCache(chapterNote)?.frontmatter?.pov;
		const file = await this.app.vault.create(path, fillSceneTemplate(template, {
			title: beat.text,
			date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
			pov: typeof pov === "string" ? pov.replace(/\[\[(?:[^\]|]*\|)?|\]\]/g, "").trim() || undefined : undefined,
			characters: beatNotes(text, beats)[at]?.who,
		}));
		// The link goes on its own line at the end of the beat's section, before the next heading.
		const next = headings.find((h) => h.from > beat.from);
		let end = next ? next.from : text.length;
		while (end > beat.to && /\s/.test(text[end - 1]!)) end--;
		editor.replaceRange(`\n[[${basename}]]`, editor.offsetToPos(end));
		await this.app.workspace.getLeaf("tab").openFile(file);
		new Notice(`ProsePrince: created "${basename}" and linked it under "${beat.text}".`);
	}

	/**
	 * Write the story inventory: the book's open ends as one note, for a reader (a person or an
	 * assistant) that would otherwise scan the vault for them. It is replaced whole each time. The scene that
	 * was open gets its reading list.
	 */
	private async writeInventory(): Promise<void> {
		await this.story.rebuild();
		if (!this.story.book.scenes.length) {
			new Notice("ProsePrince: no scenes found, so there is nothing to take stock of yet.");
			return;
		}
		const open = (this.outlineSource?.file ?? this.app.workspace.getActiveFile())?.path ?? null;
		const now = new Date();
		const two = (n: number) => String(n).padStart(2, "0");
		const written = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}`;
		const text = inventory({ book: this.story.book, relations: this.story.relations, needs: this.story.needs, written, open, canonical: (name) => this.canonicalSpeaker(name) });
		const folder = normalizePath(this.settings.readFolder.trim() || "_proseprince");
		const path = normalizePath(`${folder}/${INVENTORY_NAME}.md`);
		try {
			if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) await this.app.vault.modify(file, text);
			else if (file) {
				new Notice(`ProsePrince: ${path} is a folder, so the inventory can't be written there.`);
				return;
			} else await this.app.vault.create(path, text);
		} catch (error) {
			console.error("ProsePrince: could not write the inventory", error);
			new Notice(`ProsePrince: couldn't write ${path}. See the console for why.`);
			return;
		}
		const scene = open ? this.story.record(open) : undefined;
		new Notice(`ProsePrince: inventory written to ${path}${scene?.kind === "scene" ? `, with the reading list for ${sceneLabel(scene)}` : ""}.`);
	}

	/**
	 * Write the read-through note for a chapter (or the whole book) and open it in reading view. The note
	 * only embeds the scenes, so it is rewritten whenever its list of scenes would differ, and never otherwise.
	 */
	private async openReadThrough(chapter?: number): Promise<void> {
		await this.story.rebuild();
		const page = readThrough(this.story.book, chapter);
		if (!page) {
			new Notice(chapter === undefined ? "ProsePrince: no written scenes found to read." : "ProsePrince: nothing is written in this chapter yet.");
			return;
		}
		const folder = normalizePath(this.settings.readFolder.trim() || "_proseprince");
		if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		const path = normalizePath(`${folder}/${page.name}.md`);
		let file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			if ((await this.app.vault.read(file)) !== page.text) await this.app.vault.modify(file, page.text);
		} else if (file) {
			new Notice(`ProsePrince: ${path} is a folder, so the read-through can't be written there.`);
			return;
		} else file = await this.app.vault.create(path, page.text);
		const target = file as TFile;
		// Reuse the tab if this read-through is already open.
		let leaf: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((l) => {
			if (!leaf && l.view instanceof MarkdownView && l.view.file?.path === target.path) leaf = l;
		});
		const open = leaf ?? this.app.workspace.getLeaf("tab");
		await open.openFile(target, { state: { mode: "preview" } });
		this.app.workspace.setActiveLeaf(open, { focus: true });
	}

	/**
	 * Compile a chapter (or the whole book) into one clean note for export, and open it. When the scenes
	 * still carry notes, questions or placeholders, they are shown first; the manuscript can be written
	 * all the same. The note is replaced whole each time.
	 */
	private async compileManuscript(chapter?: number): Promise<void> {
		await this.story.rebuild();
		const texts = new Map<string, string>();
		for (const c of this.story.book.chapters) {
			if (chapter !== undefined && c.number !== chapter) continue;
			for (const scene of c.scenes) {
				const file = scene.words > 0 ? this.app.vault.getAbstractFileByPath(scene.path) : null;
				if (file instanceof TFile) texts.set(scene.path, await this.app.vault.cachedRead(file));
			}
		}
		const now = new Date();
		const two = (n: number) => String(n).padStart(2, "0");
		const written = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}`;
		const page = compile(this.story.book, texts, { chapter, written });
		if (!page) {
			new Notice(chapter === undefined ? "ProsePrince: no written scenes found to compile." : "ProsePrince: nothing is written in this chapter yet.");
			return;
		}
		const folder = normalizePath(this.settings.readFolder.trim() || "_proseprince");
		const path = normalizePath(`${folder}/${page.name}.md`);
		const write = async () => {
			let file = this.app.vault.getAbstractFileByPath(path);
			try {
				if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
				if (file instanceof TFile) await this.app.vault.modify(file, page.text);
				else if (file) {
					new Notice(`ProsePrince: ${path} is a folder, so the manuscript can't be written there.`);
					return;
				} else file = await this.app.vault.create(path, page.text);
			} catch (error) {
				console.error("ProsePrince: could not write the manuscript", error);
				new Notice(`ProsePrince: couldn't write ${path}. See the console for why.`);
				return;
			}
			const target = file as TFile;
			// Reuse the tab if this manuscript is already open.
			let leaf: WorkspaceLeaf | null = null;
			this.app.workspace.iterateAllLeaves((l) => {
				if (!leaf && l.view instanceof MarkdownView && l.view.file?.path === target.path) leaf = l;
			});
			const open = leaf ?? this.app.workspace.getLeaf("tab");
			await open.openFile(target, { state: { mode: "preview" } });
			this.app.workspace.setActiveLeaf(open, { focus: true });
			new Notice(`ProsePrince: ${page.name} written to ${path}: ${page.words.toLocaleString()} words, ${page.scenes.toLocaleString()} ${page.scenes === 1 ? "scene" : "scenes"}.`);
		};
		if (page.inTheWay.length) new CompileModal(this.app, page, path, () => void write(), (scene, newTab) => void this.openPath(scene, newTab)).open();
		else await write();
	}

	/** Open the story view in the right sidebar (or reveal it if it's already there). */
	private async openStory(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(STORY_VIEW)[0];
		const leaf = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		if (!existing) await leaf.setViewState({ type: STORY_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
		await this.story.rebuild();
		this.renderStory();
	}

	private storyViews(): StoryView[] {
		return this.app.workspace.getLeavesOfType(STORY_VIEW).map((l) => l.view).filter((v): v is StoryView => v instanceof StoryView);
	}

	private renderStory(): void {
		const current = (this.outlineSource?.file ?? this.app.workspace.getActiveFile())?.path ?? null;
		for (const v of this.storyViews()) v.show({ book: this.story.book, relations: this.story.relations, needs: this.story.needs, current, onOpen: (path, newTab, line) => void this.openPath(path, newTab, line), onRead: (chapter) => void this.openReadThrough(chapter), onInventory: () => void this.writeInventory(), onCompile: () => void this.compileManuscript() });
	}

	/** Open a note from a sidebar: in the editor last used, or a new tab with Ctrl/Cmd-click. At a line (from 0), when given. */
	private async openPath(path: string, newTab: boolean, line?: number): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(`ProsePrince: couldn't find ${path}. It may have been renamed.`);
			return;
		}
		const leaf = this.app.workspace.getLeaf(newTab ? "tab" : false);
		// Obsidian's own way to land on a line: it scrolls once the note has loaded, in either view mode.
		await leaf.openFile(file, line === undefined ? undefined : { eState: { line } });
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	/** Where a note sits in the book, for the outline: a scene's beat and promises, or a chapter note's scenes. */
	private storyFor(file: TFile): OutlineStory | null {
		const record = this.story.record(file.path);
		const relations = this.story.relations;
		if (!record) {
			// A note about the story: the scenes that touch it.
			const scenes = this.story.note(file.path) ? (relations.touchedBy.get(file.path) ?? []) : [];
			if (!scenes.length) return null;
			return {
				kind: "note",
				promises: [],
				touches: scenes.map(({ scene, touch }) => ({ path: scene.path, label: sceneLabel(scene), how: touchLabel(touch), detail: touchDetail(touch), faint: !touch.declared.length && !touch.facts && !touch.filed })),
			};
		}
		const book = this.story.book;
		const promises = scenePromises(book, record);
		const needs = (this.story.needs.byScene.get(record.path) ?? []).map((n) => ({ text: n.text, ...(n.cause ? { path: n.cause.path, ...(n.cause.line === undefined ? {} : { line: n.cause.line }) } : {}) }));
		const look = { ...(needs.length ? { needs } : {}), ...(this.story.needs.noPass.some((s) => s.path === record.path) ? { noPass: true } : {}) };
		const heard = relations.speech.get(record.path);
		const unlisted = relations.cast.filter((r) => r.issues.some((i) => i.kind === "speaks-unlisted" && i.scene.path === record.path)).map((r) => r.name);
		const speaks = heard?.lines ? { speaks: { text: speechLabel(heard), lines: heard.lines, unlisted } } : {};
		const link = (s: SceneRecord) => ({ path: s.path, label: sceneLabel(s), words: s.words });
		if (record.kind === "chapter") {
			const chapter = book.chapters.find((c) => c.note?.path === record.path);
			return {
				kind: "chapter",
				promises,
				...look,
				beats: (chapter?.beats ?? []).map((b) => ({ text: b.text, target: b.target, scenes: b.scenes.map(link) })),
				unplanned: (chapter?.unplanned ?? []).map(link),
			};
		}
		const place = book.places.get(record.path);
		const note = place?.chapter.note;
		const knowledge = sceneKnowledge(relations, book, record.path, (name) => this.canonicalSpeaker(name));
		const fact = (r: Reveal): OutlineFact => ({ text: r.text, where: `${sceneLabel(r.scene)}${r.note ? ` · ${r.note.title}` : " · unfiled"}`, path: r.note?.path ?? r.scene.path, ...(r.note && r.line !== undefined ? { line: r.line } : {}) });
		return {
			kind: "scene",
			promises,
			...look,
			...speaks,
			touches: (relations.touches.get(record.path) ?? []).map((t) => ({
				path: t.note.path, label: t.note.title, group: t.note.type, status: t.note.status,
				how: touchLabel(t), detail: `${t.note.basename}\n${touchDetail(t)}`,
				faint: !t.declared.length && !t.facts && !t.filed,
			})),
			...(knowledge ? { knowledge: { here: knowledge.here.length, before: knowledge.before, later: knowledge.later.map(fact), ahead: knowledge.ahead.map(fact), ...(knowledge.pov ? { pov: knowledge.pov } : {}) } } : {}),
			...(note ? { chapter: { path: note.path, title: place.chapter.title } } : {}),
			// Unset when the chapter has no outline; null when it has one and this scene isn't in it.
			...(place?.beat ? { beat: { text: place.beat.text, card: place.beat.card, target: place.beat.target, ...(place.beat.twoCards ? { twoCards: true } : {}) } } : place?.chapter.beats.length ? { beat: null } : {}),
		};
	}

	/** Open the outline in the right sidebar (or reveal it if it's already there). */
	private async openOutline(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(OUTLINE_VIEW)[0];
		const leaf = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		if (!existing) await leaf.setViewState({ type: OUTLINE_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
		this.refreshOutline();
	}

	private outlineViews(): OutlineView[] {
		return this.app.workspace.getLeavesOfType(OUTLINE_VIEW).map((l) => l.view).filter((v): v is OutlineView => v instanceof OutlineView);
	}

	/** Recompute the sidebar for the note being edited. Cached analysis makes this cheap after the first time. */
	private async updateOutline(): Promise<void> {
		const views = this.outlineViews();
		if (!views.length) return;
		const md = this.outlineSource;
		const file = md?.file;
		const cm = (md?.editor as unknown as { cm?: EditorView } | undefined)?.cm;
		const runner = cm && this.runner ? cm.plugin(this.runner) : null;
		if (!md || !file || !cm || !runner || !md.containerEl.isConnected) {
			for (const v of views) v.clear("Open a note to see its outline.");
			return;
		}
		// Draw what's known now (counts and beats are always complete), then again once the whole note is analysed.
		const now = runner.outlineNow(this.settings.outlineAllChecks);
		if (!this.sessionStart.has(file.path)) this.sessionStart.set(file.path, now.words);
		this.showOutline(views, now, md, file, cm);
		if (!now.pending) return;
		const full = await runner.outlineReport(this.settings.outlineAllChecks);
		// Only if the same note is still showing: another note may have loaded into this tab meanwhile.
		if (full && md === this.outlineSource && md.file?.path === file.path) this.showOutline(this.outlineViews(), full, md, file, cm);
	}

	private showOutline(views: OutlineView[], report: OutlineReport, md: MarkdownView, file: TFile, cm: EditorView): void {
		for (const v of views) {
			v.show(report, {
				title: file.basename,
				frontmatter: (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>,
				view: cm,
				cursor: cm.state.selection.main.head,
				sessionStart: this.sessionStart.get(file.path)!,
				rhythmTiers: this.settings.rhythm.tiers,
				highlighting: this.settings.enabled && this.isActiveFile(file),
				onToggleAllChecks: () => {
					this.settings.outlineAllChecks = !this.settings.outlineAllChecks;
					void this.saveSettings();
				},
				onVoices: () => void this.showVoices(cm, file.basename),
				onFocusEditor: () => this.app.workspace.setActiveLeaf(md.leaf, { focus: true }),
				story: this.storyFor(file),
				storyLink: this.settings.storyLink,
				onOpenPath: (path, newTab, line) => void this.openPath(path, newTab, line),
				onOpenStory: () => void this.openStory(),
				onReadChapter: () => {
					const chapter = this.story.record(file.path)?.name.chapter;
					if (chapter !== undefined) void this.openReadThrough(chapter);
				},
			});
		}
	}

	/** A note loaded into an editor (same tab, new note) or replaced by Sync: redraw the sidebar if it's this one. */
	reportDocumentReplaced(view: EditorView): void {
		const active = this.app.workspace.getActiveViewOfType(MarkdownView);
		const cm = (active?.editor as unknown as { cm?: EditorView } | undefined)?.cm;
		if (active && cm === view) this.outlineSource = active;
		if ((this.outlineSource?.editor as unknown as { cm?: EditorView } | undefined)?.cm === view) void this.updateOutline();
	}

	reportCursor(view: EditorView, pos: number): void {
		const cm = (this.outlineSource?.editor as unknown as { cm?: EditorView } | undefined)?.cm;
		if (cm === view) for (const v of this.outlineViews()) v.setCursor(pos);
	}

	private async showVoices(view: EditorView, title: string): Promise<void> {
		const runner = this.runner ? view.plugin(this.runner) : null;
		const report = await runner?.voiceReport();
		if (report) new VoicesModal(this.app, view, title, report).open();
		else new Notice("ProsePrince: couldn't read this note's dialogue. Try again in a moment.");
	}

	private async toggleDialogueSetting(key: "highlightsInDialogue" | "dimNarration"): Promise<boolean> {
		this.settings.dialogue[key] = !this.settings.dialogue[key];
		await this.saveSettings();
		return this.settings.dialogue[key];
	}

	/** Lenses stack: switch one on or off without touching the others. Returns the new state. */
	async toggleLens(id: LensId): Promise<boolean> {
		const on = !this.settings.lenses[id];
		this.settings.lenses[id] = on;
		if (on) this.settings.enabled = true;
		await this.saveSettings();
		return on;
	}

	private lensMenu(): Menu {
		const menu = new Menu();
		for (const lens of LENSES) {
			menu.addItem((item) => {
				item.setTitle(lens.name)
					.setIcon(lens.icon)
					.setChecked(!!this.settings.lenses[lens.id])
					.onClick(() => void this.toggleLens(lens.id));
				// The tooltip spells out what the lens turns on.
				(item as unknown as { dom?: HTMLElement }).dom?.setAttribute("aria-label", `Turns on: ${lensSummary(lens)}`);
			});
		}
		menu.addSeparator();
		menu.addItem((item) => item
			.setTitle("Sentence rhythm")
			.setChecked(effective(this.settings).rhythm)
			.onClick(async () => {
				setRhythm(this.settings, !effective(this.settings).rhythm);
				await this.saveSettings();
			}));
		menu.addItem((item) => item
			.setTitle("Highlights inside dialogue")
			.setChecked(this.settings.dialogue.highlightsInDialogue)
			.onClick(() => void this.toggleDialogueSetting("highlightsInDialogue")));
		if (this.settings.lenses.dialogue) {
			menu.addItem((item) => item
				.setTitle("Dim narration")
				.setChecked(this.settings.dialogue.dimNarration)
				.onClick(() => void this.toggleDialogueSetting("dimNarration")));
		}
		const overrides = overrideCount(this.settings);
		if (overrides > 0) {
			menu.addItem((item) => item
				.setTitle(`Reset your changes (${overrides})`)
				.setIcon("rotate-ccw")
				.onClick(async () => {
					clearOverrides(this.settings);
					await this.saveSettings();
				}));
		}
		menu.addItem((item) => item
			.setTitle(this.settings.enabled ? "Turn highlighting off" : "Turn highlighting on")
			.onClick(async () => {
				this.settings.enabled = !this.settings.enabled;
				await this.saveSettings();
			}));
		menu.addItem((item) => item
			.setTitle("ProsePrince settings…")
			.setIcon("settings")
			.onClick(() => {
				const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
				setting?.open();
				setting?.openTabById(this.manifest.id);
			}));
		return menu;
	}

	/** One icon per active lens, a dot when you've changed individual toggles; words go in the tooltip. */
	private renderLens(): void {
		const item = this.lensItem;
		if (!item) return;
		const file = this.app.workspace.getActiveFile();
		const inactive = file !== null && file.extension === "md" && !this.isActiveFile(file);
		const key = JSON.stringify([this.settings.enabled, activeLenses(this.settings).map((l) => l.id), overrideCount(this.settings), inactive]);
		if (key === this.lensShown) return;
		this.lensShown = key;
		item.empty();
		const icon = (name: string) => setIcon(item.createSpan({ cls: "pp-status-icon" }), name);
		if (!this.settings.enabled) {
			icon("eye-off");
			item.setAttribute("aria-label", "ProsePrince: highlighting off. Click for lenses.");
			return;
		}
		const lenses = activeLenses(this.settings);
		if (lenses.length === 0) icon("eye");
		for (const lens of lenses) icon(lens.icon);
		if (overrideCount(this.settings) > 0) item.createSpan({ cls: "pp-status-dot", text: "•" });
		// Outside the prose folders the icons dim, so it's clear why nothing is highlighted.
		item.toggleClass("pp-status-inactive", inactive);
		item.setAttribute("aria-label", `ProsePrince: ${lensLabel(this.settings)}.${inactive ? " Not active in this note (outside your prose folders)." : ""} Click to switch lenses.`);
		item.setAttribute("data-tooltip-position", "top");
	}

	reportReadability(view: EditorView, state: ReadabilityState): void {
		this.readability.set(view, state);
		if (view === this.activeEditorView()) this.renderReadability();
	}

	private activeEditorView(): EditorView | undefined {
		const md = this.app.workspace.getActiveViewOfType(MarkdownView);
		return (md?.editor as unknown as { cm?: EditorView } | undefined)?.cm;
	}

	private renderReadability(): void {
		const item = this.readabilityItem;
		if (!item) return;
		const view = this.activeEditorView();
		const state = view ? this.readability.get(view) : undefined;
		const main = state?.paragraph ?? state?.note ?? null;
		const key = JSON.stringify([this.settings.enabled && this.settings.readabilityStatus, main?.readingEase?.band.label, main?.variety?.band.label, describe("p", state?.paragraph ?? null), describe("n", state?.note ?? null)]);
		if (key === this.readabilityShown) return;
		this.readabilityShown = key;
		if (!this.settings.enabled || !this.settings.readabilityStatus || !main?.readingEase) {
			item.setText("");
			item.removeAttribute("aria-label");
			return;
		}
		// Icons instead of words: gauge = reading ease, activity = sentence rhythm. Details in the tooltip.
		item.empty();
		setIcon(item.createSpan({ cls: "pp-status-icon" }), "gauge");
		item.createSpan({ text: main.readingEase.band.label });
		if (main.variety) {
			setIcon(item.createSpan({ cls: "pp-status-icon" }), "activity");
			item.createSpan({ text: main.variety.band.label });
		}
		const scope = state?.paragraph ? "Paragraph at the cursor" : "Whole note";
		item.setAttribute("aria-label", [`Reading ease and sentence rhythm: ${scope.toLowerCase()}.`, describe("Paragraph", state?.paragraph ?? null), describe("Note", state?.note ?? null)].filter(Boolean).join("\n\n"));
		item.setAttribute("data-tooltip-position", "top");
	}

	reportError(error: Error): void {
		console.error("ProsePrince:", error);
		if (Date.now() - this.lastErrorAt > 30_000) {
			this.lastErrorAt = Date.now();
			new Notice(`ProsePrince could not analyse this note: ${error.message}`);
		}
	}

	async loadSettings(): Promise<void> {
		const saved = migrateLegacy(((await this.loadData()) ?? {}) as Record<string, unknown>);
		const defaults = structuredClone(DEFAULT_SETTINGS);
		this.settings = {
			...defaults,
			...saved,
			lenses: { ...(saved.lenses ?? defaults.lenses) },
			overrides: {
				pos: pick(saved.overrides?.pos, POS_CATEGORIES),
				checks: pick(saved.overrides?.checks, CHECK_KINDS),
				...(typeof saved.overrides?.ooze === "boolean" ? { ooze: saved.overrides.ooze } : {}),
				...(typeof saved.overrides?.rhythm === "boolean" ? { rhythm: saved.overrides.rhythm } : {}),
			},
			rhythm: { ...defaults.rhythm, ...(saved.rhythm ?? {}) },
			lookup: { ...defaults.lookup, ...(saved.lookup ?? {}) },
			dialogue: { ...defaults.dialogue, ...(saved.dialogue ?? {}) },
			folders: Array.isArray(saved.folders) ? saved.folders.filter((f): f is string => typeof f === "string") : [],
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.renderLens();
		this.refreshEditors();
		this.renderReadability();
		this.refreshOutline();
		// The prose folders decide what the book is.
		void this.rebuildStory();
	}

	/** Re-apply highlighting in every open Markdown editor. */
	refreshEditors(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (!(leaf.view instanceof MarkdownView) || !this.runner) return;
			// Obsidian exposes the CodeMirror 6 view on the editor as `cm`.
			const cm = (leaf.view.editor as unknown as { cm?: EditorView }).cm;
			cm?.plugin(this.runner)?.refresh();
		});
	}
}

/** How long a lookup waits for the tagger before going ahead without the part of speech. */
const WORD_INFO_TIMEOUT = 1500;

/**
 * What a lookup acts on: the selection (one line, up to 60 characters) or the word at the cursor,
 * with surrounding punctuation trimmed off.
 */
function lookupRange(editor: Editor): { line: number; fromCh: number; toCh: number; text: string } | null {
	let from = editor.getCursor("from");
	let to = editor.getCursor("to");
	if (from.line === to.line && from.ch === to.ch) {
		const word = editor.wordAt(from);
		if (!word) return null;
		from = word.from;
		to = word.to;
	}
	if (from.line !== to.line) return null;
	const raw = editor.getRange(from, to);
	const lead = raw.length - raw.replace(/^[^\p{L}\p{N}]+/u, "").length;
	const text = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
	if (!text || text.length > 60 || !/\p{L}/u.test(text)) return null;
	return { line: from.line, fromCh: from.ch + lead, toCh: from.ch + lead + text.length, text };
}

/** "Start exercise…": the exercises with the skill each trains. */
class ExercisePicker extends FuzzySuggestModal<Exercise> {
	constructor(private readonly plugin: ProsePrincePlugin) {
		super(plugin.app);
		this.setPlaceholder("Pick an exercise: one skill at a time");
	}

	getItems(): Exercise[] {
		return EXERCISES;
	}

	getItemText(e: Exercise): string {
		return `${e.title}: ${e.skill}`;
	}

	onChooseItem(e: Exercise): void {
		const editor = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		void this.plugin.startExercise(e, e.needsModel ? editor?.getSelection().trim() || undefined : undefined);
	}
}

function describe(label: string, r: ReadabilityReport | null): string {
	if (!r?.readingEase) return "";
	const lines = [`${label}: ${r.words} words, ${r.sentences} sentences`];
	lines.push(`Reading ease ${Math.round(r.readingEase.score)} (${r.readingEase.band.label}): ${r.readingEase.band.hint}`);
	if (r.grade !== null) lines.push(`Grade level ${Math.max(0, Math.round(r.grade))}`);
	if (r.variety) lines.push(`Rhythm ${r.variety.band.label}: ${r.variety.band.hint}`);
	if (r.dialogueShare) lines.push(`Dialogue ${Math.round(r.dialogueShare.ratio * 100)}% (${r.dialogueShare.band.label})`);
	return lines.join("\n");
}

function pick<K extends string>(value: Partial<Record<K, boolean>> | undefined, keys: readonly K[]): Partial<Record<K, boolean>> {
	const out: Partial<Record<K, boolean>> = {};
	for (const k of keys) if (typeof value?.[k] === "boolean") out[k] = value[k];
	return out;
}
