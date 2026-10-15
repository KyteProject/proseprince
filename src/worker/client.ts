import workerSource from "virtual:analysis-worker";
import type { ParagraphResult } from "../analysis/types";
import type { WordInfo } from "../analysis/wordInfo";
import type { ParagraphRequest, WorkerRequest, WorkerResponse } from "./protocol";

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
type Pending = { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void };

/** Runs analysis in a Web Worker started from the source inlined into main.js. */
export class AnalysisClient {
	private worker: Worker | null = null;
	private url: string | null = null;
	private nextId = 0;
	private pending = new Map<number, Pending>();

	private start(): Worker {
		if (this.worker) return this.worker;
		this.url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
		const worker = new Worker(this.url);
		worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const message = event.data;
			const entry = this.pending.get(message.id);
			if (!entry) return;
			this.pending.delete(message.id);
			if ("error" in message) entry.reject(new Error(message.error));
			else entry.resolve(message);
		};
		worker.onerror = (event) => {
			const error = new Error(event.message || "ProsePrince analysis worker failed");
			for (const entry of this.pending.values()) entry.reject(error);
			this.pending.clear();
		};
		return (this.worker = worker);
	}

	private send(request: WithoutId<WorkerRequest>): Promise<WorkerResponse> {
		const worker = this.start();
		const id = ++this.nextId;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			worker.postMessage({ ...request, id } as WorkerRequest);
		});
	}

	async analyze(paragraphs: ParagraphRequest[], echoWindow: number): Promise<ParagraphResult[]> {
		const response = await this.send({ type: "analyze", paragraphs, echoWindow });
		return "results" in response ? response.results : [];
	}

	/** The lemma and part of speech of the word at `from`–`to` in `text` (one line or paragraph). */
	async wordInfo(text: string, from: number, to: number, names: string[] = []): Promise<WordInfo | null> {
		const response = await this.send({ type: "word", text, from, to, names });
		return "word" in response ? response.word : null;
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
