import workerSource from "virtual:analysis-worker";
import type { ParagraphResult } from "../analysis/types";
import type { AnalyzeRequest, AnalyzeResponse, ParagraphRequest } from "./protocol";

/** Runs analysis in a Web Worker started from the source inlined into main.js. */
export class AnalysisClient {
	private worker: Worker | null = null;
	private url: string | null = null;
	private nextId = 0;
	private pending = new Map<number, { resolve: (r: ParagraphResult[]) => void; reject: (e: Error) => void }>();

	private start(): Worker {
		if (this.worker) return this.worker;
		this.url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
		const worker = new Worker(this.url);
		worker.onmessage = (event: MessageEvent<AnalyzeResponse>) => {
			const message = event.data;
			const entry = this.pending.get(message.id);
			if (!entry) return;
			this.pending.delete(message.id);
			if ("error" in message) entry.reject(new Error(message.error));
			else entry.resolve(message.results);
		};
		worker.onerror = (event) => {
			const error = new Error(event.message || "ProsePrince analysis worker failed");
			for (const entry of this.pending.values()) entry.reject(error);
			this.pending.clear();
		};
		return (this.worker = worker);
	}

	analyze(paragraphs: ParagraphRequest[], echoWindow: number): Promise<ParagraphResult[]> {
		const worker = this.start();
		const id = ++this.nextId;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			const request: AnalyzeRequest = { id, paragraphs, echoWindow };
			worker.postMessage(request);
		});
	}

	dispose(): void {
		this.worker?.terminate();
		if (this.url) URL.revokeObjectURL(this.url);
		this.worker = null;
		this.url = null;
		for (const entry of this.pending.values()) entry.reject(new Error("ProsePrince was unloaded"));
		this.pending.clear();
	}
}
