// Per-page scene data shared by the inline head scripts and the client code.
// The scripts in boot-script.ts are constant strings; everything page-specific reaches them
// through the JSON element described here, never through string interpolation.

import { pickVariant, sceneKey, variantForScreen, variantUrl, type SceneSource, type VariantName, type VideoManifest } from "./manifest";

/** id of the `<script type="application/json">` element that lists the page's scenes. */
export const SCENE_DATA_ID = "sq-data";
/** Global that holds the downloads started by the inline prefetch script. */
export const PREFETCH_GLOBAL = "__sq";

/** One scene, with short keys because it ships in every page's HTML. */
export type PageSceneEntry = {
  /** Scene key (`sceneKey(source)`). */
  k: string;
  /** 1 when the scene holds the splash. */
  g: 0 | 1;
  /** Desktop file: [url, bytes]. */
  d: [string, number];
  /** Mobile file: [url, bytes]. */
  m: [string, number];
};

export type PageSceneData = { s: PageSceneEntry[] };

export type PageSceneInput = { source: SceneSource; manifest: VideoManifest; gate: boolean };

/** Scenes in page order (the download order, §6.7). */
export function buildPageSceneData(scenes: readonly PageSceneInput[]): PageSceneData {
  return {
    s: scenes.map(({ source, manifest, gate }) => ({
      k: sceneKey(source),
      g: gate ? 1 : 0,
      d: [variantUrl(source, manifest, "desktop"), pickVariant(manifest, "desktop").bytes],
      m: [variantUrl(source, manifest, "mobile"), pickVariant(manifest, "mobile").bytes],
    })),
  };
}

/** JSON that is safe inside a `<script type="application/json">` element (no `</script>` or `<!--` can form). */
export function serializePageSceneData(data: PageSceneData): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function isEntry(value: unknown): value is PageSceneEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Partial<PageSceneEntry>;
  const isFile = (f: unknown) => Array.isArray(f) && typeof f[0] === "string" && typeof f[1] === "number";
  return typeof e.k === "string" && (e.g === 0 || e.g === 1) && isFile(e.d) && isFile(e.m);
}

/** Reads the page's scene list from the JSON element; an absent or malformed element gives an empty list. */
export function readPageSceneData(doc: Document): PageSceneData {
  try {
    const parsed: unknown = JSON.parse(doc.getElementById(SCENE_DATA_ID)?.textContent ?? "null");
    const list = typeof parsed === "object" && parsed !== null ? (parsed as { s?: unknown }).s : null;
    return { s: Array.isArray(list) ? list.filter(isEntry) : [] };
  } catch {
    return { s: [] };
  }
}

/** A download started by the inline prefetch script. */
export type PrefetchEntry = {
  /** URL. */
  u: string;
  /** Expected bytes. */
  n: number;
  /** Bytes loaded so far. */
  l: number;
  /** `performance.now()` when the first bytes arrived; 0 before that. */
  s: number;
  c: AbortController;
  p: Promise<ArrayBuffer>;
  /** Progress callback, set by whoever adopts the download. */
  f: (() => void) | null;
};

export type PrefetchRegistry = {
  /** Variant picked by screen shape when the page opened. */
  v: VariantName;
  /** Set to stop the queue before the next file. */
  x: boolean;
  /** Downloads by URL. */
  d: Record<string, PrefetchEntry>;
};

export function getPrefetchRegistry(win: Window): PrefetchRegistry | null {
  const registry = (win as unknown as Record<string, unknown>)[PREFETCH_GLOBAL];
  return typeof registry === "object" && registry !== null ? (registry as PrefetchRegistry) : null;
}

let visitVariant: VariantName | null = null;

/**
 * Browser only. The video variant for this visit: the one the prefetch script picked, else by
 * screen shape now. Chosen once, so a resize never triggers a new download (§4.1).
 */
export function getVisitVariant(): VariantName {
  if (!visitVariant) {
    visitVariant = getPrefetchRegistry(window)?.v ?? variantForScreen(window.innerWidth, window.innerHeight);
  }
  return visitVariant;
}
