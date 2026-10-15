import { AbstractInputSuggest, type App, PluginSettingTab, Setting, TFolder } from "obsidian";
import { CHECK_KINDS, type CheckKind, POS_CATEGORIES, type PosCategory } from "./analysis/types";
import type ProsePrincePlugin from "./main";
import {
	CHECK_GROUPS,
	CHECK_INFO,
	clearOverrides,
	effective,
	fromLenses,
	LENSES,
	lensesFor,
	lensSummary,
	overrideCount,
	POS_LABELS,
	type RhythmScope,
	WORLD_NOTE_DEFAULT,
	setCheck,
	setOoze,
	setPos,
	setRhythm,
} from "./settingsModel";

/** Folder autocomplete for the "Where ProsePrince runs" field. */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		private readonly input: HTMLInputElement,
	) {
		super(app, input);
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder && !f.isRoot() && f.path.toLowerCase().includes(q))
			.slice(0, 50);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.input.value = folder.path;
		this.input.dispatchEvent(new Event("input"));
		this.close();
	}
}

export class ProsePrinceSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ProsePrincePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		const save = async (redraw = false) => {
			await this.plugin.saveSettings();
			if (redraw) this.display();
		};
		const active = effective(s);
		const base = fromLenses(s);
		containerEl.empty();

		new Setting(containerEl)
			.setName("Highlighting")
			.setDesc("Turn all ProsePrince highlighting on or off.")
			.addToggle((t) => t.setValue(s.enabled).onChange(async (v) => {
				s.enabled = v;
				await save();
			}));

		// ── Where it runs ──────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName("Where ProsePrince runs")
			.setDesc(createFragment((f) => {
				f.appendText("Only notes inside these folders (and their subfolders) are highlighted. ");
				f.appendText(s.folders.length ? "" : "No folders set, so it runs on every note. ");
				f.appendText("A note's own frontmatter always wins: ");
				f.createEl("code", { text: "proseprince: true" });
				f.appendText(" or ");
				f.createEl("code", { text: "proseprince: false" });
				f.appendText(" (the \"Toggle ProsePrince for this note\" command sets it for you).");
			}))
			.setHeading();
		for (const folder of s.folders) {
			new Setting(containerEl)
				.setName(folder)
				.setClass("pp-folder-row")
				.addExtraButton((b) => b.setIcon("trash-2").setTooltip("Remove folder").onClick(async () => {
					s.folders = s.folders.filter((f) => f !== folder);
					await save(true);
				}));
		}
		let pending = "";
		new Setting(containerEl)
			.setName(s.folders.length ? "Add another folder" : "Add a folder")
			.addSearch((search) => {
				search.setPlaceholder("e.g. 60_draft").onChange((v) => (pending = v.trim().replace(/^\/+|\/+$/g, "")));
				new FolderSuggest(this.app, search.inputEl);
			})
			.addButton((b) => b.setButtonText("Add").setCta().onClick(async () => {
				if (!pending || s.folders.includes(pending)) return;
				s.folders = [...s.folders, pending];
				await save(true);
			}));

		// ── Lenses ──────────────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName("Lenses")
			.setDesc("Lenses stack: each one you switch on adds its highlights. The toggles further down show the combined result; changing one there overrides the lenses for just that item.")
			.setHeading();
		for (const lens of LENSES) {
			const desc = createFragment((f) => {
				f.appendText(lens.credit);
				f.createEl("br");
				f.createEl("span", { cls: "pp-setting-turns-on", text: `Turns on: ${lensSummary(lens)}.` });
			});
			new Setting(containerEl)
				.setName(lens.name)
				.setDesc(desc)
				.addToggle((t) => t.setValue(!!s.lenses[lens.id]).onChange(async (v) => {
					s.lenses[lens.id] = v;
					await save(true);
				}));
		}
		const overrides = overrideCount(s);
		if (overrides > 0) {
			new Setting(containerEl)
				.setName(`Your changes (${overrides})`)
				.setDesc("Items you've switched on or off by hand, overriding the lenses. They're marked \"Your change\" below.")
				.addButton((b) => b.setButtonText("Reset all to lenses").onClick(async () => {
					clearOverrides(s);
					await save(true);
				}));
		}

		/** One toggle row: shows the combined state and where it comes from. */
		const row = (opts: {
			name: string;
			desc?: string;
			cls?: string;
			value: boolean;
			lensValue: boolean;
			via: string[];
			overridden: boolean;
			set: (v: boolean) => void;
		}) => {
			const source = opts.overridden
				? `Your change (lenses say ${opts.lensValue ? "on" : "off"}).`
				: opts.via.length
					? `On via ${opts.via.join(", ")}.`
					: "";
			const setting = new Setting(containerEl)
				.setName(opts.name)
				.setDesc(createFragment((f) => {
					if (opts.desc) f.appendText(opts.desc + " ");
					if (source) f.createEl("span", { cls: opts.overridden ? "pp-setting-overridden" : "pp-setting-via", text: source });
				}));
			if (opts.cls) setting.setClass(opts.cls);
			if (opts.overridden) {
				setting.addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Back to what the lenses say").onClick(async () => {
					opts.set(opts.lensValue);
					await save(true);
				}));
			}
			setting.addToggle((t) => t.setValue(opts.value).onChange(async (v) => {
				opts.set(v);
				await save(true);
			}));
		};
		const names = (l: { name: string }[]) => l.map((x) => x.name);

		// ── Rhythm and readability ─────────────────────────────────────────────
		new Setting(containerEl).setName("Rhythm and readability").setHeading();
		row({
			name: "Sentence rhythm",
			desc: "Tints each sentence by its felt length, cool for short through warm for long, so monotony shows before you hear it.",
			value: active.rhythm,
			lensValue: base.rhythm,
			via: names(lensesFor("rhythm", s)),
			overridden: s.overrides.rhythm !== undefined,
			set: (v) => setRhythm(s, v),
		});
		new Setting(containerEl)
			.setName("Rhythm scope")
			.addDropdown((d) => d
				.addOption("paragraph", "Paragraph at the cursor")
				.addOption("visible", "Everything on screen")
				.setValue(s.rhythm.scope)
				.onChange(async (v) => {
					s.rhythm.scope = v as RhythmScope;
					await save();
				}));
		new Setting(containerEl)
			.setName("Rhythm bands")
			.setDesc("How many length bands to colour (4–6).")
			.addSlider((sl) => sl.setLimits(4, 6, 1).setValue(s.rhythm.tiers).setDynamicTooltip().onChange(async (v) => {
				s.rhythm.tiers = v;
				await save();
			}));
		new Setting(containerEl)
			.setName("Readability in the status bar")
			.setDesc("Reading ease, sentence variety and dialogue share for the paragraph at the cursor; hover for the whole note and grade level.")
			.addToggle((t) => t.setValue(s.readabilityStatus).onChange(async (v) => {
				s.readabilityStatus = v;
				await save();
			}));

		// ── Story world ────────────────────────────────────────────────────────
		new Setting(containerEl).setName("Story world").setHeading();
		const world = this.plugin.world;
		const sample = (set: ReadonlySet<string>) => [...set].slice(0, 12).join(", ") + (set.size > 12 ? "…" : "");
		new Setting(containerEl)
			.setName("World note")
			.setDesc(`Names, places and invented terms for this story. Names and places are treated as proper nouns ("White stood up" is a character, not a colour) and never count as repetition; terms never count as repetition or metaphor. Found: ${world.world.names.size} names, ${world.world.places.size} places, ${world.world.terms.size} terms.`)
			.addText((t) => t.setPlaceholder(WORLD_NOTE_DEFAULT).setValue(s.worldNote).onChange(async (v) => {
				s.worldNote = v.trim();
				await save();
				await world.rebuild();
				this.plugin.refreshEditors();
			}))
			.addButton((b) => b.setButtonText("Open").onClick(() => void world.open()));
		new Setting(containerEl)
			.setName("Character notes")
			.setDesc(`Notes with "type: character" (or a #character tag) are always read for their aliases, name or names; add a folder to include every note in it. ${world.characterNames.size ? `Found: ${sample(world.characterNames)}.` : "None found yet: add aliases to your character notes, e.g. aliases: [Shin, Effie]."}`)
			.addText((t) => t.setPlaceholder("Folder (optional)").setValue(s.characterFolder).onChange(async (v) => {
				s.characterFolder = v.trim();
				await save();
				await world.rebuild();
				this.plugin.refreshEditors();
			}));
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Names written mid-sentence in a note (\"she turned to White\") are picked up automatically too. Right-click a word for ProsePrince: add to world.",
		});

		// ── Parts of speech ────────────────────────────────────────────────────
		new Setting(containerEl).setName("Parts of speech").setHeading();
		for (const category of POS_CATEGORIES) {
			row({
				name: POS_LABELS[category],
				cls: `pp-setting-pos-${category.toLowerCase()}`,
				value: active.pos[category],
				lensValue: base.pos[category],
				via: names(lensesFor({ pos: category }, s)),
				overridden: s.overrides.pos[category] !== undefined,
				set: (v) => setPos(s, category as PosCategory, v),
			});
		}
		row({
			name: "Ooze mode",
			desc: "Inspired by Stephen King's On Writing: adverbs ooze red ink. Shows adverbs while on.",
			value: active.oozeMode,
			lensValue: base.oozeMode,
			via: names(lensesFor("ooze", s)),
			overridden: s.overrides.ooze !== undefined,
			set: (v) => setOoze(s, v),
		});

		// ── Craft checks ───────────────────────────────────────────────────────
		for (const group of CHECK_GROUPS) {
			new Setting(containerEl).setName(group).setHeading();
			for (const check of CHECK_KINDS.filter((k) => CHECK_INFO[k].group === group)) {
				row({
					name: CHECK_INFO[check].name,
					desc: CHECK_INFO[check].desc,
					cls: `pp-setting-check-${check}`,
					value: active.checks[check],
					lensValue: base.checks[check],
					via: names(lensesFor({ check }, s)),
					overridden: s.overrides.checks[check] !== undefined,
					set: (v) => setCheck(s, check as CheckKind, v),
				});
			}
		}
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Hover a highlight for its note. \"Not … here\" adds a hidden %% not cliche %% comment to the paragraph, which switches that check off there.",
		});
		new Setting(containerEl)
			.setName("\"How to approach this\" in hover cards")
			.setDesc("A drawer of hand-written guidance under each note: the principle, invented before-and-after examples, and when to keep it. Nothing is generated and your own sentences are never rewritten.")
			.addDropdown((d) => d
				.addOption("collapsed", "Closed until clicked")
				.addOption("hidden", "Don't show")
				.setValue(s.guidance)
				.onChange(async (v) => {
					s.guidance = v as "collapsed" | "hidden";
					await save();
				}));

		// ── Advanced ───────────────────────────────────────────────────────────
		new Setting(containerEl).setName("Advanced").setHeading();
		new Setting(containerEl)
			.setName("Echo window")
			.setDesc("How many content words apart two uses of a word can be and still count as an echo.")
			.addSlider((sl) => sl.setLimits(5, 100, 5).setValue(s.echoWindow).setDynamicTooltip().onChange(async (v) => {
				s.echoWindow = v;
				await save();
			}));
		new Setting(containerEl)
			.setName("Typing delay (ms)")
			.setDesc("How long to wait after you stop typing before re-highlighting.")
			.addSlider((sl) => sl.setLimits(100, 1000, 50).setValue(s.debounceMs).setDynamicTooltip().onChange(async (v) => {
				s.debounceMs = v;
				await save();
			}));
	}
}
