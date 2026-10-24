import type { EditorView } from "@codemirror/view";
import { type App, Modal } from "obsidian";
import type { VoiceReport } from "./editor/highlighter";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * "Voices in this note": how each character talks (lines, length, questions, exclamations, the words
 * they use more than the others) and the scene's shape, dialogue against narration. Reads the note only.
 */
export class VoicesModal extends Modal {
	constructor(
		app: App,
		private readonly view: EditorView,
		private readonly title: string,
		private readonly report: VoiceReport,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, report } = this;
		this.modalEl.addClass("pp-voices-modal");
		this.titleEl.setText(`Voices in ${this.title}`);

		if (!report.voices.length) {
			contentEl.createEl("p", { cls: "pp-voices-empty", text: "No attributed dialogue in this note yet. Tags (\"Linh said\") or pins (%% speaker: Linh %%) give the lens something to work with." });
		} else {
			const guessed = report.voices.reduce((n, v) => n + v.guessed, 0);
			contentEl.createEl("p", {
				cls: "setting-item-description",
				text: `From the lines the Dialogue lens could attribute${guessed ? `, including ${guessed} guessed by turn-taking` : ""}. "Their words" are the ones a speaker uses more than everyone else here, common words left out: with a chapter's worth of lines it's a lean, not proof, and plot words (names, places) show up too.`,
			});
			const table = contentEl.createEl("table", { cls: "pp-voices-table" });
			const head = table.createEl("thead").createEl("tr");
			for (const h of ["Speaker", "Lines", "Words", "Per line", "Questions", "Exclaims", "Share", "Their words"]) head.createEl("th", { text: h });
			const body = table.createEl("tbody");
			for (const v of report.voices) {
				const row = body.createEl("tr");
				const who = row.createEl("td", { cls: "pp-voices-who" });
				const dot = who.createSpan({ cls: "pp-speaker-dot" });
				dot.style.setProperty("--pp-speaker", v.colour);
				who.appendText(v.speaker);
				row.createEl("td", { text: v.guessed ? `${v.lines} (${v.guessed}?)` : String(v.lines) });
				row.createEl("td", { text: String(v.words) });
				row.createEl("td", { text: v.wordsPerLine.toFixed(1) });
				row.createEl("td", { text: pct(v.questions) });
				row.createEl("td", { text: pct(v.exclamations) });
				row.createEl("td", { text: pct(v.share) });
				row.createEl("td", { cls: "pp-voices-words", text: v.distinctive.length ? v.distinctive.join(", ") : "—" });
			}
		}

		// The scene's shape: one mark per line, coloured by speaker, faint for narration.
		contentEl.createEl("h4", { text: "Shape" });
		const strip = contentEl.createDiv({ cls: "pp-shape" });
		for (const s of report.shape) {
			const mark = strip.createSpan({ cls: s.speech === null ? "pp-shape-break" : s.speech ? "pp-shape-speech" : "pp-shape-narration" });
			if (s.speech && s.colour) mark.style.setProperty("--pp-speaker", s.colour);
			mark.onclick = () => this.jump(s.from);
		}
		contentEl.createEl("p", { cls: "setting-item-description", text: "Each mark is a line: coloured for speech (grey when the speaker is a guess), faint for narration, a gap for a scene break. Click one to go there." });

		for (const s of report.stretches) {
			const p = contentEl.createEl("p", { cls: "pp-shape-stretch" });
			p.appendText(s.kind === "narration" ? `${s.length} lines without dialogue, from ` : `${s.length} lines of dialogue without narration, from `);
			const link = p.createEl("a", { text: `"${s.excerpt}…"`, href: "#" });
			link.onclick = (e) => {
				e.preventDefault();
				this.jump(s.from);
			};
			p.appendText(s.kind === "narration" ? ". Fine for description or interiority; a long scene of it can feel told." : ". Quick, but a reader may lose the room and the people in it: a beat now and then grounds them.");
		}
	}

	private jump(at: number): void {
		this.close();
		this.view.dispatch({ selection: { anchor: Math.min(at, this.view.state.doc.length) }, scrollIntoView: true });
		this.view.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
