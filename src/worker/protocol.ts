import type { ParagraphResult } from "../analysis/types";
import type { WordInfo } from "../analysis/wordInfo";

export interface ParagraphRequest {
	text: string;
	/** Known names that occur in this paragraph. */
	names: string[];
}

export interface AnalyzeRequest {
	id: number;
	type: "analyze";
	paragraphs: ParagraphRequest[];
	echoWindow: number;
}

/** Tag one line to find a word's lemma and part of speech, for a thesaurus lookup. */
export interface WordRequest {
	id: number;
	type: "word";
	text: string;
	from: number;
	to: number;
	names: string[];
}

export type WorkerRequest = AnalyzeRequest | WordRequest;

export type WorkerResponse =
	| { id: number; results: ParagraphResult[] }
	| { id: number; word: WordInfo | null }
	| { id: number; error: string };
