import type { ParagraphResult } from "../analysis/types";

/** Least-recently-used cache of per-paragraph results, keyed by paragraph text. */
export class ResultCache {
	private map = new Map<string, ParagraphResult>();

	constructor(private readonly limit = 6000) {}

	static key(text: string, echoWindow: number, names: readonly string[] = []): string {
		return `${echoWindow}\u0000${names.join("\u0001")}\u0000${text}`;
	}

	get(key: string): ParagraphResult | undefined {
		const value = this.map.get(key);
		if (value) {
			this.map.delete(key);
			this.map.set(key, value);
		}
		return value;
	}

	has(key: string): boolean {
		return this.map.has(key);
	}

	set(key: string, value: ParagraphResult): void {
		this.map.set(key, value);
		if (this.map.size > this.limit) {
			const oldest = this.map.keys().next().value;
			if (oldest !== undefined) this.map.delete(oldest);
		}
	}

	clear(): void {
		this.map.clear();
	}
}
