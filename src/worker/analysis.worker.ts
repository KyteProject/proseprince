/// <reference lib="webworker" />
import { analyzeParagraph } from "../analysis/analyze";
import type { AnalyzeRequest, AnalyzeResponse } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
	const { id, paragraphs, echoWindow } = event.data;
	let response: AnalyzeResponse;
	try {
		response = { id, results: paragraphs.map((p) => analyzeParagraph(p.text, echoWindow, p.names)) };
	} catch (error) {
		response = { id, error: error instanceof Error ? error.message : String(error) };
	}
	scope.postMessage(response);
};
