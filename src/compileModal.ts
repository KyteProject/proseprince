import { type App, Keymap, Modal } from "obsidian";
import { type Compiled, inTheWayLabel, inTheWayTotals } from "./analysis/compile";
import { sceneLabel } from "./analysis/story";

/**
 * Before a manuscript is written: what its scenes still carry. It is a list to look down, and no
 * gate: the manuscript can be written as it stands.
 */
export class CompileModal extends Modal {
	constructor(
		app: App,
		private readonly page: Compiled,
		private readonly path: string,
		private readonly onCompile: () => void,
		private readonly onOpenScene: (path: string, newTab: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, page } = this;
		this.modalEl.addClass("pp-compile-modal");
		this.titleEl.setText(`Compile ${page.name}`);
		const n = (x: number) => x.toLocaleString();
		contentEl.createEl("p", { text: `${n(page.words)} words in ${n(page.scenes)} ${page.scenes === 1 ? "scene" : "scenes"}, ready to write to ${this.path}.` });
		contentEl.createEl("p", { text: `Still in these scenes: ${inTheWayLabel(inTheWayTotals(page.inTheWay))}.` });
		const list = contentEl.createDiv({ cls: "pp-compile-list" });
		for (const row of page.inTheWay) {
			const line = list.createDiv({ cls: "pp-compile-row is-link" });
			line.createSpan({ cls: "pp-compile-scene", text: sceneLabel(row.scene) });
			line.createSpan({ cls: "pp-compile-what", text: inTheWayLabel(row.counts) });
			line.setAttribute("aria-label", "Open the scene. The Annotations section of its outline lists each one.");
			line.onclick = (evt) => {
				this.close();
				this.onOpenScene(row.scene.path, Keymap.isModEvent(evt) !== false);
			};
		}
		contentEl.createEl("p", { cls: "pp-compile-note", text: "None of this stops the manuscript. Comments, callouts, headings and fix-later lines are left out of it; highlight and @@ marks come off and their words stay; a [placeholder] stays in the text, exactly as written." });
		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		const go = buttons.createEl("button", { cls: "mod-cta", text: "Compile as it stands" });
		go.onclick = () => {
			this.close();
			this.onCompile();
		};
		buttons.createEl("button", { text: "Cancel" }).onclick = () => this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
