import { buildUrl, parseWords, queryKey } from "./datamuse";
import type { Candidate, DatamuseParams } from "./types";

/** Word data barely changes, so cached answers are kept for half a year. */
export const CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 2000;
/** After a failed request, stay quiet for a while instead of retrying on every hover. */
export const BACKOFF_MS = 2 * 60 * 1000;

export type LookupFailure = "offline" | "failed";

export class LookupError extends Error {
	constructor(readonly reason: LookupFailure, message: string) {
		super(message);
	}
}

export interface LookupDeps {
	/** GET a URL and parse its JSON; throws on network or HTTP errors. */
	fetchJson(url: string): Promise<unknown>;
	apiKey(): string;
	/** Called whenever the cache or the request count changes, so the caller can schedule a save. */
	onChange?(): void;
	now?(): number;
	online?(): boolean;
}

interface Entry {
	at: number;
	words: Candidate[];
}

interface CacheFile {
	version: 1;
	day: string;
	requests: number;
	entries: [string, number, Candidate[]][];
}

const localDay = (ms: number) => {
	const d = new Date(ms);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Datamuse requests with a disk-backed LRU cache, shared in-flight requests and an offline backoff.
 * Plain TypeScript (no Obsidian), so it can be tested and reused in the dev harness.
 */
export class LookupService {
	private cache = new Map<string, Entry>();
	private inFlight = new Map<string, Promise<Candidate[]>>();
	private blockedUntil = 0;
	private day = "";
	private requests = 0;

	constructor(private readonly deps: LookupDeps) {}

	private now(): number {
		return this.deps.now?.() ?? Date.now();
	}

	/** A cached answer, if there is a fresh one. Never makes a request. */
	cached(params: DatamuseParams): Candidate[] | undefined {
		const key = queryKey(params);
		const entry = this.cache.get(key);
		if (!entry) return undefined;
		if (this.now() - entry.at > CACHE_TTL_MS) {
			this.cache.delete(key);
			return undefined;
		}
		// Most recently used last, so eviction drops the oldest first.
		this.cache.delete(key);
		this.cache.set(key, entry);
		return entry.words;
	}

	/** The answer for one query, from the cache or from Datamuse. Throws `LookupError` when it can't be had. */
	get(params: DatamuseParams): Promise<Candidate[]> {
		const hit = this.cached(params);
		if (hit) return Promise.resolve(hit);
		const key = queryKey(params);
		const pending = this.inFlight.get(key);
		if (pending) return pending;
		if (this.deps.online?.() === false || this.now() < this.blockedUntil) {
			return Promise.reject(new LookupError("offline", "Offline: lookups resume when you're connected"));
		}
		const request = this.request(key, params).finally(() => this.inFlight.delete(key));
		this.inFlight.set(key, request);
		return request;
	}

	private async request(key: string, params: DatamuseParams): Promise<Candidate[]> {
		this.count();
		let json: unknown;
		try {
			json = await this.deps.fetchJson(buildUrl(params, this.deps.apiKey()));
		} catch (error) {
			this.blockedUntil = this.now() + BACKOFF_MS;
			throw new LookupError("failed", `Lookup failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		const words = trim(parseWords(json));
		this.cache.set(key, { at: this.now(), words });
		while (this.cache.size > CACHE_MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
		this.deps.onChange?.();
		return words;
	}

	private count(): void {
		const today = localDay(this.now());
		if (today !== this.day) {
			this.day = today;
			this.requests = 0;
		}
		this.requests++;
	}

	/** Requests made today, for the settings page. */
	requestsToday(): number {
		return this.day === localDay(this.now()) ? this.requests : 0;
	}

	get size(): number {
		return this.cache.size;
	}

	clear(): void {
		this.cache.clear();
		this.deps.onChange?.();
	}

	serialize(): string {
		const file: CacheFile = {
			version: 1,
			day: this.day,
			requests: this.requests,
			entries: [...this.cache].map(([key, e]) => [key, e.at, e.words]),
		};
		return JSON.stringify(file);
	}

	/** Restore a saved cache. Anything malformed or expired is dropped. */
	restore(text: string | null): void {
		if (!text) return;
		let file: Partial<CacheFile>;
		try {
			file = JSON.parse(text) as Partial<CacheFile>;
		} catch {
			return;
		}
		if (file.version !== 1 || !Array.isArray(file.entries)) return;
		const now = this.now();
		for (const row of file.entries) {
			if (!Array.isArray(row)) continue;
			const [key, at, words] = row as unknown[];
			if (typeof key !== "string" || typeof at !== "number" || !Array.isArray(words) || now - at > CACHE_TTL_MS) continue;
			this.cache.set(key, { at, words: words as Candidate[] });
		}
		if (typeof file.day === "string" && typeof file.requests === "number") {
			this.day = file.day;
			this.requests = file.requests;
		}
	}
}

/**
 * Keep the cache small: a list of suggestions keeps one definition per part of speech for each word
 * (enough for the chip's hint), while a single-word definition query keeps up to twelve.
 */
function trim(words: Candidate[]): Candidate[] {
	if (words.length <= 1) return words.map((w) => ({ ...w, defs: w.defs.slice(0, 12) }));
	return words.map((w) => {
		const seen = new Set<string | null>();
		return { ...w, defs: w.defs.filter((d) => !seen.has(d.pos) && seen.add(d.pos)).slice(0, 4) };
	});
}
