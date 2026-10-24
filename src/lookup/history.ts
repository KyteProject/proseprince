/** Where a lookup started: the right-click popover, or a hover card for a particular check. */
export type LookupSource = string;

export interface Pick {
	from: string;
	to: string;
	source: LookupSource;
	at: number;
}

interface HistoryFile {
	version: 1;
	lookups: Record<string, { n: number; last: number }>;
	picks: Pick[];
}

/** Older picks are dropped beyond this; word counts are kept. */
export const MAX_PICKS = 2000;

/**
 * What the writer looked up and what they chose instead. Stored per vault (so per story) and only
 * shown on the settings page, never in the popover.
 */
export class LookupHistory {
	private lookups = new Map<string, { n: number; last: number }>();
	private picks: Pick[] = [];

	constructor(private readonly onChange?: () => void, private readonly now: () => number = Date.now) {}

	recordLookup(word: string): void {
		const key = word.toLowerCase();
		const entry = this.lookups.get(key) ?? { n: 0, last: 0 };
		entry.n++;
		entry.last = this.now();
		this.lookups.set(key, entry);
		this.onChange?.();
	}

	recordPick(from: string, to: string, source: LookupSource): void {
		this.picks.push({ from: from.toLowerCase(), to: to.toLowerCase(), source, at: this.now() });
		if (this.picks.length > MAX_PICKS) this.picks.splice(0, this.picks.length - MAX_PICKS);
		this.onChange?.();
	}

	/** Words looked up most often, most first. */
	topLookups(limit: number): { word: string; n: number }[] {
		return [...this.lookups].map(([word, e]) => ({ word, n: e.n })).sort((a, b) => b.n - a.n || a.word.localeCompare(b.word)).slice(0, limit);
	}

	/** Words replaced most often, with what was chosen instead (most chosen first). */
	topReplaced(limit: number): { word: string; n: number; chosen: string[] }[] {
		const by = new Map<string, Map<string, number>>();
		for (const p of this.picks) {
			const choices = by.get(p.from) ?? new Map<string, number>();
			choices.set(p.to, (choices.get(p.to) ?? 0) + 1);
			by.set(p.from, choices);
		}
		return [...by]
			.map(([word, choices]) => ({
				word,
				n: [...choices.values()].reduce((a, b) => a + b, 0),
				chosen: [...choices].sort((a, b) => b[1] - a[1]).map(([w]) => w),
			}))
			.sort((a, b) => b.n - a.n || a.word.localeCompare(b.word))
			.slice(0, limit);
	}

	/** Picks per source (right-click lookup, or the check whose hover card offered them). */
	picksBySource(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const p of this.picks) out[p.source] = (out[p.source] ?? 0) + 1;
		return out;
	}

	/** Lookups made, distinct words looked up, and replacements picked. */
	totals(): { lookups: number; words: number; picks: number } {
		let lookups = 0;
		for (const e of this.lookups.values()) lookups += e.n;
		return { lookups, words: this.lookups.size, picks: this.picks.length };
	}

	get isEmpty(): boolean {
		return this.lookups.size === 0 && this.picks.length === 0;
	}

	clear(): void {
		this.lookups.clear();
		this.picks = [];
		this.onChange?.();
	}

	serialize(): string {
		const file: HistoryFile = { version: 1, lookups: Object.fromEntries(this.lookups), picks: this.picks };
		return JSON.stringify(file);
	}

	restore(text: string | null): void {
		if (!text) return;
		let file: Partial<HistoryFile>;
		try {
			file = JSON.parse(text) as Partial<HistoryFile>;
		} catch {
			return;
		}
		if (file.version !== 1) return;
		for (const [word, e] of Object.entries(file.lookups ?? {})) {
			if (typeof e?.n === "number" && typeof e.last === "number") this.lookups.set(word, { n: e.n, last: e.last });
		}
		this.picks = (Array.isArray(file.picks) ? file.picks : [])
			.filter((p): p is Pick => typeof p?.from === "string" && typeof p.to === "string" && typeof p.source === "string" && typeof p.at === "number")
			.slice(-MAX_PICKS);
	}
}
