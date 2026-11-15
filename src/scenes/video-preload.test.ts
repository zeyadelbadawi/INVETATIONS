import { describe, expect, it } from "vitest";
import type { PrefetchEntry, PrefetchRegistry } from "./page-data";
import { estimateRemainingSeconds, VideoPreloader } from "./video-preload";

function response(bytes: number[], chunk = 2): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunk) controller.enqueue(new Uint8Array(bytes.slice(i, i + chunk)));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("estimateRemainingSeconds", () => {
  it("divides what is left by the speed seen so far", () => {
    // 1.3 Mbps ≈ 162 500 B/s: 10 MB left is about a minute.
    expect(estimateRemainingSeconds(406_250, 2500, 10_000_000)).toBeCloseTo(61.5, 1);
    expect(estimateRemainingSeconds(5_000_000, 2500, 1_000_000)).toBeCloseTo(0.5);
  });

  it("is zero when nothing is left and unbounded when nothing has arrived", () => {
    expect(estimateRemainingSeconds(100, 2500, 0)).toBe(0);
    expect(estimateRemainingSeconds(0, 2500, 100)).toBe(Number.POSITIVE_INFINITY);
    expect(estimateRemainingSeconds(100, 0, 100)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("VideoPreloader", () => {
  it("downloads one file at a time in the order added, reporting bytes", async () => {
    const started: string[] = [];
    const gates = new Map<string, () => void>();
    const preloader = new VideoPreloader({
      fetch: async (input) => {
        const url = String(input);
        started.push(url);
        await new Promise<void>((resolve) => gates.set(url, resolve));
        return response(url === "/a" ? [1, 2, 3, 4] : [5, 6]);
      },
    });
    const a = preloader.add({ key: "a", url: "/a", bytes: 4, gate: true });
    const b = preloader.add({ key: "b", url: "/b", bytes: 2, gate: false });
    expect(preloader.add({ key: "a", url: "/a", bytes: 4, gate: true })).toBe(a);
    await tick();
    expect(started).toEqual(["/a"]);
    expect(preloader.getProgress()).toMatchObject({ loaded: 0, total: 6, blockingLoaded: 0, blockingTotal: 4, blockingDone: false });

    gates.get("/a")?.();
    expect([...new Uint8Array(await a)]).toEqual([1, 2, 3, 4]);
    await tick();
    expect(started).toEqual(["/a", "/b"]);
    // Only the gating scene's file blocks; the later non-gating one does not.
    expect(preloader.getProgress()).toMatchObject({ loaded: 4, blockingLoaded: 4, blockingDone: true });

    gates.get("/b")?.();
    expect([...new Uint8Array(await b)]).toEqual([5, 6]);
    expect(preloader.getProgress()).toMatchObject({ loaded: 6, total: 6 });
  });

  it("counts files ahead of the last gating scene as blocking", () => {
    const preloader = new VideoPreloader({ fetch: () => new Promise(() => {}) });
    void preloader.add({ key: "a", url: "/a", bytes: 10, gate: false });
    void preloader.add({ key: "b", url: "/b", bytes: 20, gate: true });
    void preloader.add({ key: "c", url: "/c", bytes: 40, gate: false });
    expect(preloader.getProgress()).toMatchObject({ total: 70, blockingTotal: 30 });
  });

  it("rejects a file whose size differs from the manifest", async () => {
    const preloader = new VideoPreloader({ fetch: async () => response([1, 2, 3]) });
    await expect(preloader.add({ key: "a", url: "/a", bytes: 4, gate: true })).rejects.toThrow(/3 bytes, manifest says 4/);
    expect(preloader.getProgress().blockingDone).toBe(true);
  });

  function prefetched(url: string, bytes: number): PrefetchEntry & { resolve: (b: ArrayBuffer) => void; reject: (e: Error) => void } {
    let resolve: (b: ArrayBuffer) => void = () => {};
    let reject: (e: Error) => void = () => {};
    const p = new Promise<ArrayBuffer>((a, b) => {
      resolve = a;
      reject = b;
    });
    p.catch(() => {});
    return { u: url, n: bytes, l: 0, s: 0, c: new AbortController(), p, f: null, resolve, reject };
  }

  it("adopts downloads the inline script started, with their progress", async () => {
    const entry = prefetched("/a", 4);
    entry.l = 1;
    const registry: PrefetchRegistry = { v: "desktop", x: false, d: { "/a": entry } };
    const fetched: string[] = [];
    const preloader = new VideoPreloader({
      registry,
      fetch: async (input) => {
        fetched.push(String(input));
        return response([9, 9]);
      },
    });
    let notified = 0;
    preloader.subscribe(() => void notified++);
    const a = preloader.add({ key: "a", url: "/a", bytes: 4, gate: true });
    const b = preloader.add({ key: "b", url: "/b", bytes: 2, gate: false });
    expect(preloader.getProgress().loaded).toBe(1);

    entry.l = 3;
    entry.s = performance.now();
    entry.f?.();
    expect(preloader.getProgress().loaded).toBe(3);
    expect(notified).toBeGreaterThan(0);
    await tick();
    // A file the script did not list waits for the adopted ones: still one at a time.
    expect(fetched).toEqual([]);

    entry.resolve(new Uint8Array([1, 2, 3, 4]).buffer);
    expect((await a).byteLength).toBe(4);
    expect((await b).byteLength).toBe(2);
    expect(fetched).toEqual(["/b"]);
    preloader.abort();
  });

  it("downloads a file itself when the adopted download fails", async () => {
    const entry = prefetched("/a", 2);
    const preloader = new VideoPreloader({ registry: { v: "desktop", x: false, d: { "/a": entry } }, fetch: async () => response([7, 8]) });
    const a = preloader.add({ key: "a", url: "/a", bytes: 2, gate: true });
    entry.reject(new Error("network"));
    expect([...new Uint8Array(await a)]).toEqual([7, 8]);
  });

  it("abort stops its own and the adopted downloads, and tells the inline queue to stop", async () => {
    const entry = prefetched("/a", 2);
    entry.c.signal.addEventListener("abort", () => entry.reject(new Error("aborted")));
    const registry: PrefetchRegistry = { v: "desktop", x: false, d: { "/a": entry } };
    const preloader = new VideoPreloader({ registry, fetch: () => new Promise(() => {}) });
    const a = preloader.add({ key: "a", url: "/a", bytes: 2, gate: true });
    preloader.abort();
    expect(registry.x).toBe(true);
    expect(entry.c.signal.aborted).toBe(true);
    await expect(a).rejects.toThrow();
    expect(preloader.getProgress().aborted).toBe(true);
    await expect(preloader.add({ key: "late", url: "/late", bytes: 1, gate: false })).rejects.toThrow(/stopped/);
  });

  it("estimates the line once, measureMs after the first bytes", async () => {
    let clock = 1000;
    const pending: ReadableStreamDefaultController<Uint8Array>[] = [];
    const preloader = new VideoPreloader({
      now: () => clock,
      measureMs: 20,
      fetch: async () => new Response(new ReadableStream<Uint8Array>({ start: (controller) => void pending.push(controller) })),
    });
    void preloader.add({ key: "a", url: "/a", bytes: 1000, gate: true }).catch(() => {});
    await tick();
    pending[0].enqueue(new Uint8Array(100));
    await tick();
    expect(preloader.getEstimate()).toBeNull();
    clock = 1500;
    await new Promise((resolve) => setTimeout(resolve, 40));
    // 100 bytes in 0.5 s = 200 B/s; 900 left = 4.5 s.
    expect(preloader.getEstimate()).toEqual({ bytesPerSecond: 200, remainingSeconds: 4.5 });
    preloader.abort();
  });
});
