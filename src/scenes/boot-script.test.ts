import { describe, expect, it } from "vitest";
import {
  prefetchScript,
  sceneNoScriptCss,
  splashBootScript,
  splashCss,
  PREFETCH_GLOBAL,
  SCENE_DATA_ID,
  SPLASH_ATTR,
  SPLASH_FAILSAFE_MS,
  SPLASH_JS_ATTR,
  SPLASH_PANEL_ATTR,
} from "./boot-script";
import { decideTier } from "./device-tier";
import type { PageSceneData, PrefetchRegistry } from "./page-data";

type Env = {
  data: PageSceneData | null;
  reducedMotion?: boolean;
  connection?: { saveData?: boolean; effectiveType?: string };
  innerWidth?: number;
  innerHeight?: number;
  fetch?: (url: string, init: { signal: AbortSignal; priority?: string }) => Promise<unknown>;
};

/** Runs an inline script against stand-ins for the browser globals it touches. */
function run(script: string, env: Env) {
  const attributes = new Map<string, string>();
  const timeouts: { run: () => void; ms: number }[] = [];
  const frames: (() => void)[] = [];
  const history = { scrollRestoration: "auto" };
  const documentElement = {
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    hasAttribute: (name: string) => attributes.has(name),
    removeAttribute: (name: string) => void attributes.delete(name),
  };
  const document = {
    documentElement,
    getElementById: (id: string) => (id === SCENE_DATA_ID && env.data ? { textContent: JSON.stringify(env.data) } : null),
  };
  const navigator = { connection: env.connection };
  const matchMedia = (query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" && env.reducedMotion === true });
  const setTimeoutStub = (fn: () => void, ms: number) => timeouts.push({ run: fn, ms });
  const window: Record<string, unknown> = {
    innerWidth: env.innerWidth ?? 1440,
    innerHeight: env.innerHeight ?? 900,
    fetch: env.fetch,
    ReadableStream,
    AbortController,
    Promise,
    requestAnimationFrame: (fn: () => void) => frames.push(fn),
  };
  new Function("window", "document", "navigator", "matchMedia", "history", "setTimeout", "fetch", "performance", script)(
    window,
    document,
    navigator,
    matchMedia,
    history,
    setTimeoutStub,
    env.fetch,
    performance,
  );
  return { attributes, timeouts, frames, history, registry: window[PREFETCH_GLOBAL] as PrefetchRegistry | undefined };
}

const gated: PageSceneData = {
  s: [
    { k: "a", g: 1, d: ["/a/desktop.mp4", 6], m: ["/a/mobile.mp4", 3] },
    { k: "b", g: 0, d: ["/b/desktop.mp4", 4], m: ["/b/mobile.mp4", 2] },
  ],
};
const ungated: PageSceneData = { s: [{ k: "b", g: 0, d: ["/b/desktop.mp4", 4], m: ["/b/mobile.mp4", 2] }] };

describe("inline scripts are constants that match the exported names", () => {
  it("returns the same string on every call", () => {
    expect(splashBootScript()).toBe(splashBootScript());
    expect(prefetchScript()).toBe(prefetchScript());
  });

  it("uses the exported ids and attribute names", () => {
    for (const script of [splashBootScript(), prefetchScript()]) expect(script).toContain(`getElementById("${SCENE_DATA_ID}")`);
    expect(splashBootScript()).toContain(`"${SPLASH_ATTR}"`);
    expect(splashBootScript()).toContain(`"${SPLASH_JS_ATTR}"`);
    expect(splashBootScript()).toContain(`},${SPLASH_FAILSAFE_MS})`);
    expect(prefetchScript()).toContain(`w.${PREFETCH_GLOBAL}=`);
    expect(splashCss()).toContain(`html[${SPLASH_ATTR}="hold"]`);
    expect(splashCss()).toContain(`[${SPLASH_PANEL_ATTR}]`);
    expect(sceneNoScriptCss()).toContain("--seq-progress:1");
  });

  it("cannot close its own script element", () => {
    for (const script of [splashBootScript(), prefetchScript()]) expect(script).not.toMatch(/<\/script|<!--/i);
  });
});

describe("splash boot script", () => {
  it("locks the page when a scene gates, and makes every visit start at the top", () => {
    const result = run(splashBootScript(), { data: gated });
    expect(result.attributes.get(SPLASH_ATTR)).toBe("hold");
    expect(result.history.scrollRestoration).toBe("manual");
  });

  it("does nothing when no scene gates or the page has no scene data", () => {
    for (const data of [ungated, null]) {
      const result = run(splashBootScript(), { data });
      expect(result.attributes.has(SPLASH_ATTR)).toBe(false);
      expect(result.history.scrollRestoration).toBe("auto");
      expect(result.timeouts).toHaveLength(0);
    }
  });

  it("shows no panel for reduced motion, Save-Data and 2g, but holds on 3g", () => {
    expect(run(splashBootScript(), { data: gated, reducedMotion: true }).attributes.get(SPLASH_ATTR)).toBe("seen");
    expect(run(splashBootScript(), { data: gated, connection: { saveData: true } }).attributes.get(SPLASH_ATTR)).toBe("seen");
    expect(run(splashBootScript(), { data: gated, connection: { effectiveType: "2g" } }).attributes.get(SPLASH_ATTR)).toBe("seen");
    expect(run(splashBootScript(), { data: gated, connection: { effectiveType: "slow-2g" } }).attributes.get(SPLASH_ATTR)).toBe("seen");
    expect(run(splashBootScript(), { data: gated, connection: { effectiveType: "3g" } }).attributes.get(SPLASH_ATTR)).toBe("hold");
  });

  it("agrees with decideTier on which visits get the still version", () => {
    const cases: Env[] = [
      { data: gated },
      { data: gated, reducedMotion: true },
      { data: gated, connection: { saveData: true } },
      { data: gated, connection: { effectiveType: "2g" } },
      { data: gated, connection: { effectiveType: "slow-2g" } },
      { data: gated, connection: { effectiveType: "3g" } },
      { data: gated, connection: { effectiveType: "4g", saveData: false } },
    ];
    for (const env of cases) {
      const tier = decideTier({
        reducedMotion: env.reducedMotion === true,
        saveData: env.connection?.saveData === true,
        effectiveType: env.connection?.effectiveType,
        coarsePointer: false,
        viewportWidth: 1440,
      });
      const stills = tier === "STATIC" || tier === "LOW";
      expect(run(splashBootScript(), env).attributes.get(SPLASH_ATTR)).toBe(stills ? "seen" : "hold");
      expect(run(prefetchScript(), { ...env, fetch: () => new Promise(() => {}) }).registry === undefined).toBe(stills);
    }
  });

  it("lets go after 10 s unless the app script took over", () => {
    const abandoned = run(splashBootScript(), { data: gated });
    expect(abandoned.timeouts.map((t) => t.ms)).toEqual([SPLASH_FAILSAFE_MS]);
    abandoned.timeouts[0].run();
    expect(abandoned.attributes.has(SPLASH_ATTR)).toBe(false);

    const takenOver = run(splashBootScript(), { data: gated });
    takenOver.attributes.set(SPLASH_JS_ATTR, "1");
    takenOver.timeouts[0].run();
    expect(takenOver.attributes.get(SPLASH_ATTR)).toBe("hold");
  });
});

describe("prefetch script", () => {
  function streamOf(...chunks: number[][]): { ok: true; status: 200; body: ReadableStream<Uint8Array> } {
    return {
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
          controller.close();
        },
      }),
    };
  }

  it("downloads one file at a time, in page order, at low priority, after the first paint", async () => {
    const calls: { url: string; priority?: string }[] = [];
    let releaseFirst: (response: unknown) => void = () => {};
    const result = run(prefetchScript(), {
      data: gated,
      fetch: (url, init) => {
        calls.push({ url, priority: init.priority });
        if (calls.length === 1) return new Promise((resolve) => (releaseFirst = resolve));
        return Promise.resolve(streamOf([7, 8], [9, 10]));
      },
    });
    const registry = result.registry;
    if (!registry) throw new Error("no registry");
    expect(registry.v).toBe("desktop");
    expect(Object.keys(registry.d)).toEqual(["/a/desktop.mp4", "/b/desktop.mp4"]);
    expect(calls).toHaveLength(0);

    result.frames[0]();
    result.timeouts.find((t) => t.ms === 0)?.run();
    expect(calls).toEqual([{ url: "/a/desktop.mp4", priority: "low" }]);

    let progressCalls = 0;
    registry.d["/a/desktop.mp4"].f = () => void progressCalls++;
    releaseFirst(streamOf([1, 2, 3], [4, 5, 6]));
    const first = await registry.d["/a/desktop.mp4"].p;
    expect([...new Uint8Array(first)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(registry.d["/a/desktop.mp4"].l).toBe(6);
    expect(registry.d["/a/desktop.mp4"].s).toBeGreaterThan(0);
    expect(progressCalls).toBe(2);

    const second = await registry.d["/b/desktop.mp4"].p;
    expect([...new Uint8Array(second)]).toEqual([7, 8, 9, 10]);
    expect(calls.map((c) => c.url)).toEqual(["/a/desktop.mp4", "/b/desktop.mp4"]);

    // The 1 s backstop must not start the queue a second time.
    result.timeouts.find((t) => t.ms === 1000)?.run();
    expect(calls).toHaveLength(2);
  });

  it("picks the mobile files on a portrait screen", () => {
    const result = run(prefetchScript(), { data: gated, innerWidth: 390, innerHeight: 844, fetch: () => new Promise(() => {}) });
    expect(result.registry?.v).toBe("mobile");
    expect(Object.keys(result.registry?.d ?? {})).toEqual(["/a/mobile.mp4", "/b/mobile.mp4"]);
  });

  it("downloads nothing for reduced motion, Save-Data or 2g", () => {
    const fetch = () => new Promise(() => {});
    expect(run(prefetchScript(), { data: gated, reducedMotion: true, fetch }).registry).toBeUndefined();
    expect(run(prefetchScript(), { data: gated, connection: { saveData: true }, fetch }).registry).toBeUndefined();
    expect(run(prefetchScript(), { data: gated, connection: { effectiveType: "2g" }, fetch }).registry).toBeUndefined();
    expect(run(prefetchScript(), { data: gated, connection: { effectiveType: "3g" }, fetch }).registry).toBeDefined();
  });

  it("rejects a failed file and carries on with the next; stops when told to", async () => {
    const calls: string[] = [];
    const result = run(prefetchScript(), {
      data: gated,
      fetch: (url) => {
        calls.push(url);
        return Promise.resolve(calls.length === 1 ? { ok: false, status: 404, body: null } : streamOf([1, 2, 3, 4]));
      },
    });
    const registry = result.registry;
    if (!registry) throw new Error("no registry");
    result.timeouts.find((t) => t.ms === 1000)?.run();
    await expect(registry.d["/a/desktop.mp4"].p).rejects.toThrow(/404/);
    await expect(registry.d["/b/desktop.mp4"].p).resolves.toBeInstanceOf(ArrayBuffer);

    const stopped = run(prefetchScript(), { data: gated, fetch: () => Promise.reject(new Error("never called")) });
    if (!stopped.registry) throw new Error("no registry");
    stopped.registry.x = true;
    stopped.timeouts.find((t) => t.ms === 1000)?.run();
    await expect(stopped.registry.d["/a/desktop.mp4"].p).rejects.toThrow(/stopped/);
    await expect(stopped.registry.d["/b/desktop.mp4"].p).rejects.toThrow(/stopped/);
  });
});
