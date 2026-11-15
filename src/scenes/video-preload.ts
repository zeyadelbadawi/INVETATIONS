// Scene file downloads (playbook §6.7, §7.3): one file at a time in page order, with byte progress,
// adopting the downloads the inline prefetch script already started, and a line-speed estimate.

import { getPrefetchRegistry, getVisitVariant, readPageSceneData, type PrefetchEntry, type PrefetchRegistry } from "./page-data";

export type PreloadItem = { key: string; url: string; bytes: number; gate: boolean };

export type PreloadProgress = {
  loaded: number;
  total: number;
  /** Bytes of the files the splash waits for: everything up to the last gating scene in the queue. */
  blockingLoaded: number;
  blockingTotal: number;
  blockingDone: boolean;
  aborted: boolean;
};

export type LineEstimate = { bytesPerSecond: number; remainingSeconds: number };

/** The line is measured over this long, starting at the first bytes (§7.3). */
export const LINE_MEASURE_MS = 2500;

/** Seconds the remaining bytes would take at the speed seen so far. */
export function estimateRemainingSeconds(loadedBytes: number, elapsedMs: number, remainingBytes: number): number {
  if (remainingBytes <= 0) return 0;
  if (loadedBytes <= 0 || elapsedMs <= 0) return Number.POSITIVE_INFINITY;
  return remainingBytes / ((loadedBytes / elapsedMs) * 1000);
}

type Entry = {
  item: PreloadItem;
  loaded: number;
  settled: boolean;
  promise: Promise<ArrayBuffer>;
  controller: AbortController | null;
  adopted: PrefetchEntry | null;
};

export type PreloaderOptions = {
  registry?: PrefetchRegistry | null;
  fetch?: typeof fetch;
  now?: () => number;
  measureMs?: number;
};

export class VideoPreloader {
  private readonly entries = new Map<string, Entry>();
  private readonly order: Entry[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly registry: PrefetchRegistry | null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly measureMs: number;
  private tail: Promise<void> = Promise.resolve();
  private aborted = false;
  private firstByteAt = 0;
  private measureTimer: ReturnType<typeof setTimeout> | null = null;
  private estimate: LineEstimate | null = null;

  constructor(options: PreloaderOptions = {}) {
    this.registry = options.registry ?? null;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => performance.now());
    this.measureMs = options.measureMs ?? LINE_MEASURE_MS;
  }

  /** Queues a file (once per URL) and resolves with its bytes. Files download in the order they are added. */
  add(item: PreloadItem): Promise<ArrayBuffer> {
    const existing = this.entries.get(item.url);
    if (existing) {
      if (item.gate && !existing.item.gate) existing.item = { ...existing.item, gate: true };
      return existing.promise;
    }
    const entry: Entry = { item, loaded: 0, settled: false, promise: Promise.resolve(new ArrayBuffer(0)), controller: null, adopted: null };
    const adopted = this.aborted ? null : (this.registry?.d[item.url] ?? null);
    let raw: Promise<ArrayBuffer>;
    if (adopted) {
      entry.adopted = adopted;
      entry.loaded = adopted.l;
      if (adopted.s > 0) this.noteFirstByte(adopted.s);
      adopted.f = () => {
        entry.loaded = adopted.l;
        this.noteFirstByte(adopted.s || this.now());
        this.emit();
      };
      // If the inline script's download fails, fetch the file again from this queue.
      raw = adopted.p.catch(() => this.enqueue(entry));
      // Files the script did not list wait for the adopted ones, so it stays one at a time.
      this.tail = Promise.all([this.tail, adopted.p.then(noop, noop)]).then(noop);
    } else {
      raw = this.enqueue(entry);
    }
    entry.promise = raw.then(
      (buffer) => {
        if (buffer.byteLength !== item.bytes) {
          // The decode index addresses bytes in the file, so a different file cannot be played.
          throw new Error(`Scene file ${item.url} is ${buffer.byteLength} bytes, manifest says ${item.bytes}`);
        }
        entry.loaded = item.bytes;
        return buffer;
      },
    );
    const settle = () => {
      entry.settled = true;
      this.emit();
    };
    entry.promise.then(settle, settle);
    this.entries.set(item.url, entry);
    this.order.push(entry);
    return entry.promise;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getProgress(): PreloadProgress {
    const blockingCount = this.blockingCount();
    const progress: PreloadProgress = { loaded: 0, total: 0, blockingLoaded: 0, blockingTotal: 0, blockingDone: true, aborted: this.aborted };
    this.order.forEach((entry, index) => {
      const loaded = Math.min(entry.loaded, entry.item.bytes);
      progress.loaded += loaded;
      progress.total += entry.item.bytes;
      if (index < blockingCount) {
        progress.blockingLoaded += loaded;
        progress.blockingTotal += entry.item.bytes;
        if (!entry.settled) progress.blockingDone = false;
      }
    });
    return progress;
  }

  /** Set once, `measureMs` after the first bytes, unless the blocking files finished before that. */
  getEstimate(): LineEstimate | null {
    return this.estimate;
  }

  /** Stops every download, including the ones the inline script started. Pending promises reject. */
  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    if (this.registry) this.registry.x = true;
    if (this.measureTimer !== null) clearTimeout(this.measureTimer);
    for (const entry of this.order) {
      entry.adopted?.c.abort();
      entry.controller?.abort();
    }
    this.emit();
  }

  private blockingCount(): number {
    let count = 0;
    this.order.forEach((entry, index) => {
      if (entry.item.gate) count = index + 1;
    });
    return count;
  }

  private enqueue(entry: Entry): Promise<ArrayBuffer> {
    const download = this.tail.then(() => this.download(entry));
    this.tail = download.then(noop, noop);
    return download;
  }

  private async download(entry: Entry): Promise<ArrayBuffer> {
    if (this.aborted) throw new DOMException("Downloads were stopped", "AbortError");
    entry.controller = new AbortController();
    entry.loaded = 0;
    // No `crossOrigin`/credentials options on purpose (§5); a cross-origin CDN must send CORS headers for fetch.
    const init: RequestInit = { signal: entry.controller.signal, priority: "low" };
    const response = await this.fetchImpl(entry.item.url, init);
    if (!response.ok) throw new Error(`Scene file ${entry.item.url} answered ${response.status}`);
    if (!response.body) return response.arrayBuffer();

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      entry.loaded += value.byteLength;
      this.noteFirstByte(this.now());
      this.emit();
    }
    const whole = new Uint8Array(new ArrayBuffer(entry.loaded));
    let offset = 0;
    for (const chunk of chunks) {
      whole.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return whole.buffer;
  }

  private noteFirstByte(at: number): void {
    if (this.firstByteAt > 0 || this.aborted) return;
    this.firstByteAt = at;
    const wait = Math.max(0, at + this.measureMs - this.now());
    this.measureTimer = setTimeout(() => this.measure(), wait);
  }

  private measure(): void {
    this.measureTimer = null;
    const progress = this.getProgress();
    if (this.aborted || progress.blockingDone) return;
    const elapsedMs = this.now() - this.firstByteAt;
    const remainingBytes = progress.blockingTotal - progress.blockingLoaded;
    this.estimate = {
      bytesPerSecond: elapsedMs > 0 ? (progress.loaded / elapsedMs) * 1000 : 0,
      remainingSeconds: estimateRemainingSeconds(progress.loaded, elapsedMs, remainingBytes),
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

function noop(): void {}

let shared: VideoPreloader | null = null;

/**
 * Browser only. The page's one download queue, seeded from the page's scene list so files
 * download in page order whatever order the scenes mount in.
 */
export function getPreloader(): VideoPreloader {
  if (!shared) {
    shared = new VideoPreloader({ registry: getPrefetchRegistry(window) });
    const mobile = getVisitVariant() === "mobile";
    for (const scene of readPageSceneData(document).s) {
      const [url, bytes] = mobile ? scene.m : scene.d;
      void shared.add({ key: scene.k, url, bytes, gate: scene.g === 1 }).catch(noop);
    }
  }
  return shared;
}
