import type { Needs } from "./needs";
import { type Relations, type Reveal, sceneKnowledge, speechLabel, touchLabel } from "./relations";
import { ANNOTATION_LABELS, type Book, type PromiseRef, type PromiseRow, PROMISE_LABELS, sceneLabel, type SceneRecord, TO_CLEAR, toClear } from "./story";

/** The name the inventory is written under. */
export const INVENTORY_NAME = "Inventory";

export interface InventoryInput {
	book: Book;
	relations: Relations;
	needs: Needs;
	/** When it is written: `2026-11-10 22:58`. */
	written: string;
	/** The scene that was open, for its reading list. */
	open?: string | null;
	canonical?: (name: string) => string;
}

const num = (n: number) => n.toLocaleString();
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const link = (path: string) => `[[${path.replace(/^.*\//, "").replace(/\.md$/i, "")}]]`;
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The book's inventory as one note, for a reader that would otherwise scan the vault for it: the
 * promises still open, the scenes that need a look, what is left to clear in each chapter, and, for
 * the scene that was open, its reading list and what the reader knows by then. Everything in it is
 * derived, so it is replaced whole each time and is only as fresh as its stamp.
 */
export function inventory({ book, relations, needs, written, open, canonical }: InventoryInput): string {
	const out: string[] = [
		"---",
		`written: ${written.replace(" ", "T")}`,
		"proseprince: false",
		"---",
		`%% Made by ProsePrince on ${written}. Everything here is derived from the notes: run "Write story inventory" to refresh it, and anything typed here is replaced. %%`,
		"",
		"# Story inventory",
		"",
		`Written ${written}. ${num(book.words)} words, ${plural(book.chapters.length, "chapter")}, ${plural(book.scenes.length, "scene")}.`,
		"",
	];

	// Promises that are not settled, with where each stands.
	const refs = (list: readonly PromiseRef[]) => list.map((r) => `${link(r.path)}${r.repeats ? ` (and ${r.repeats - 1} more in the chapter)` : ""}`).join(", ");
	const promise = (p: PromiseRow) => `- ${p.name}: ${[p.made.length ? `made in ${refs(p.made)}` : "", p.progressed.length ? `moved on in ${refs(p.progressed)}` : "", p.paid.length ? `paid in ${refs(p.paid)}` : ""].filter(Boolean).join("; ") || "no scene"}`;
	out.push("## Promises", "");
	const groups: [PromiseRow["status"], string][] = [["open", "Open"], ["progressing", "Progressing"], ["paid-before-made", "Paid before made"], ["never-made", "Paid or moved on, never made"]];
	let listed = 0;
	for (const [status, title] of groups) {
		const rows = book.promises.filter((p) => p.status === status);
		if (!rows.length) continue;
		listed += rows.length;
		out.push(`### ${title} (${num(rows.length)})`, "", ...rows.map(promise), "");
	}
	const paid = book.promises.filter((p) => p.status === "paid").length;
	if (!listed) out.push(book.promises.length ? "None open." : "No scene names a promise yet.", "");
	if (paid) out.push(`${plural(paid, "promise")} ${PROMISE_LABELS.paid}, not listed.`, "");

	// Needs a look.
	out.push(`## Needs a look (${needs.list.length ? `${plural(needs.byScene.size, "scene")}, ${plural(needs.list.length, "reason")}` : "0"})`, "");
	if (needs.list.length) {
		for (const [path, list] of needs.byScene) {
			out.push(`- ${link(path)}`);
			for (const need of list) out.push(`  - ${need.text}${need.cause ? ` → ${link(need.cause.path)}` : ""}`);
		}
		out.push("");
	} else out.push(needs.passed ? "Nothing: no scene with a pass has a reason against it." : "Nothing can be said yet: no scene has a pass date.", "");
	if (needs.noPass.length) out.push(`No pass yet (${num(needs.noPass.length)}): ${needs.noPass.map((s) => link(s.path)).join(", ")}`, "");

	// What is left to clear, by chapter.
	out.push("## To clear, by chapter", "");
	let any = false;
	for (const chapter of book.chapters) {
		const notes = [...(chapter.note ? [chapter.note] : []), ...chapter.scenes];
		const total = notes.reduce((n, s) => n + toClear(s.annotations), 0);
		if (!total) continue;
		any = true;
		const kinds = TO_CLEAR.map((k) => [k, notes.reduce((n, s) => n + s.annotations[k], 0)] as const).filter(([, n]) => n);
		out.push(`- ${String(chapter.number).padStart(2, "0")}${chapter.title ? ` ${chapter.title}` : ""}: ${kinds.map(([k, n]) => `${num(n)} ${ANNOTATION_LABELS[k][n === 1 ? 0 : 1]}`).join(", ")}`);
		for (const s of notes) if (toClear(s.annotations)) out.push(`  - ${link(s.path)}: ${num(toClear(s.annotations))}`);
	}
	out.push(any ? "" : "Nothing to clear.", ...(any ? [] : [""]));

	// The scene that was open.
	const scene = open ? book.scenes.find((s) => s.path === open) : undefined;
	if (scene) out.push(...sceneInventory(book, relations, scene, canonical));
	return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function sceneInventory(book: Book, relations: Relations, scene: SceneRecord, canonical?: (name: string) => string): string[] {
	const out = [`## Scene: ${sceneLabel(scene)}`, "", `${link(scene.path)}, the scene that was open when this was written.`, ""];
	const touches = relations.touches.get(scene.path) ?? [];
	out.push("### Reading list", "");
	if (touches.length) out.push(...touches.map((t) => `- ${link(t.note.path)}${[t.note.type, t.note.status].filter(Boolean).length ? ` (${[t.note.type, t.note.status].filter(Boolean).join(", ")})` : ""}: ${touchLabel(t)}`), "");
	else out.push("No note is connected to this scene yet.", "");
	const heard = relations.speech.get(scene.path);
	if (heard?.lines) {
		const unlisted = relations.cast.filter((r) => r.issues.some((i) => i.kind === "speaks-unlisted" && i.scene === scene)).map((r) => r.name);
		out.push("### Who speaks", "", `${plural(heard.lines, "line")} of speech. ${speechLabel(heard)}.`, "", "A number is lines that are theirs by a tag, a pinned speaker, an action beat or a settled pronoun. Guesses come from turn-taking.", "");
		if (unlisted.length) out.push(`Tagged as speaking here, and not in the scene's pov or characters: ${unlisted.join(", ")}.`, "");
	}
	const k = sceneKnowledge(relations, book, scene.path, canonical);
	if (!k) return out;
	const fact = (r: Reveal, who = false) => `- ${oneLine(r.text)} (${r.note ? link(r.note.path) : "unfiled"}, ${link(r.scene.path)})${who && r.knownTo.length ? ` — there: ${r.knownTo.join(", ")}` : ""}`;
	out.push("### Who knows", "", `By this scene the reader has been shown ${plural(k.before + k.here.length, "fact")}, ${num(k.here.length)} of them here. "There" is who was in the scene, which is not the same as noticing.`, "");
	if (k.here.length) out.push("Shown here:", "", ...k.here.map((r) => fact(r, true)), "");
	if (k.pov && k.ahead.length) out.push(`Shown to the reader in scenes ${k.pov} wasn't in:`, "", ...k.ahead.map((r) => fact(r, true)), "");
	if (k.later.length) out.push("Recorded from later scenes, so not known here:", "", ...k.later.map((r) => fact(r)), "");
	return out;
}
