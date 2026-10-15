import type { ParagraphResult } from "../analysis/types";

export interface ParagraphRequest {
	text: string;
	/** Known names that occur in this paragraph. */
	names: string[];
}

export interface AnalyzeRequest {
	id: number;
	paragraphs: ParagraphRequest[];
	echoWindow: number;
}

export type AnalyzeResponse = { id: number; results: ParagraphResult[] } | { id: number; error: string };
