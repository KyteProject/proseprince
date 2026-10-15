import type { EditorView, ViewPlugin } from "@codemirror/view";
import { debounce, type Editor, editorInfoField, MarkdownView, Menu, Notice, Plugin, setIcon, TFile } from "obsidian";
import type { ReadabilityReport } from "./analysis/readability";
import { CHECK_KINDS, POS_CATEGORIES } from "./analysis/types";
import { ResultCache } from "./editor/cache";
import { createHighlighter, type HighlightRunner, type ReadabilityState } from "./editor/highlighter";
import { ProsePrinceSettingTab } from "./settings";
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

export default class ProsePrincePlugin extends Plugin {
	settings: ProsePrinceSettings = structuredClone(DEFAULT_SETTINGS);
	client = new AnalysisClient();
	cache = new ResultCache();
	private runner: ViewPlugin<HighlightRunner> | null = null;
	private lastErrorAt = 0;
	private lensItem: HTMLElement | null = null;
	private readabilityItem: HTMLElement | null = null;
	private readability = new WeakMap<EditorView, ReadabilityState>();
	world = new WorldIndex(this.app, () => this.settings);
	private rebuildWorld = debounce(async () => {
		if (await this.world.rebuild()) this.refreshEditors();
	}, 800, true);

	async onload(): Promise<void> {
		await this.loadSettings();
		const { extension, plugin } = createHighlighter(this);
		this.runner = plugin;
		this.registerEditorExtension(extension);
		this.addSettingTab(new ProsePrinceSettingTab(this.app, this));

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
		// A note's own `proseprince:` flag can switch it on or off: re-check when frontmatter changes.
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			if (file === this.app.workspace.getActiveFile()) {
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
		this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => this.addWorldMenu(menu, editor)));

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
		return inScope(file.path, this.settings.folders, typeof flag === "boolean" ? flag : undefined);
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

	private async addToWorld(section: WorldSection, entry: string): Promise<void> {
		await this.world.add(section, entry);
		await this.world.rebuild();
		this.refreshEditors();
		new Notice(`ProsePrince: added "${entry}" to ${section} in ${this.world.worldNotePath}`);
	}

	onunload(): void {
		this.client.dispose();
		this.cache.clear();
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
		const file = this.app.workspace.getActiveFile();
		const inactive = file !== null && file.extension === "md" && !this.isActiveFile(file);
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
			folders: Array.isArray(saved.folders) ? saved.folders.filter((f): f is string => typeof f === "string") : [],
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.renderLens();
		this.refreshEditors();
		this.renderReadability();
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
