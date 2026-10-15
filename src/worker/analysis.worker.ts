/// <reference lib="webworker" />
import { analyzeParagraph } from "../analysis/analyze";
import { wordInfoAt } from "../analysis/wordInfo";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;
	const { id } = request;
	let response: WorkerResponse;
	try {
		response = request.type === "word"
			? { id, word: wordInfoAt(request.text, request.from, request.to, request.names) }
			: { id, results: request.paragraphs.map((p) => analyzeParagraph(p.text, request.echoWindow, p.names)) };
	} catch (error) {
		response = { id, error: error instanceof Error ? error.message : String(error) };
	}
	scope.postMessage(response);
};
