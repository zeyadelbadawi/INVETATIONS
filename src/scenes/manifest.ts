// Scene manifest types and URL helpers (playbook §4.4, §4.5, §5).

export type VideoDecodeIndex = {
  /** WebCodecs codec string, e.g. "avc1.640032". */
  codec: string;
  /** The avcC decoder configuration record, base64. */
  description: string;
  /** Indices of keyframes, ascending. */
  keys: number[];
  /** Per frame: [byte offset, byte size] in the MP4. */
  samples: [number, number][];
};

export type VariantName = "desktop" | "mobile";

export type VideoVariant = {
  name: VariantName;
  width: number;
  height: number;
  src: string;
  /** File size, so download progress is known before headers arrive. */
  bytes: number;
  decode: VideoDecodeIndex;
};

export type VideoManifest = {
  id: string;
  kind: "video";
  fps: number;
  frameCount: number;
  /** 0..1, the crop / object-position centre. */
  focal: { x: number; y: number };
  /** `last` is the final frame: what the still version shows, so end-state copy sits on the right picture. */
  poster: { avif: string; webp: string; width: number; height: number; last?: { avif: string; webp: string } };
  variants: VideoVariant[];
  /** One number per frame, rising 0..1. */
  timing: number[];
};

export type SceneSource = {
  id: string;
  /** Revision folder `<id>.r<N>`; files in a revision never change (§5). */
  rev?: number;
  /** Folder that holds the scene folders, e.g. "https://media.example.com/videos" or "/media/drafts". */
  baseUrl: string;
};

/** Portrait screens (width/height < 0.9) get the 4:5 file (§4.1). */
export const PORTRAIT_RATIO = 0.9;

export function variantForScreen(width: number, height: number): VariantName {
  return height > 0 && width / height < PORTRAIT_RATIO ? "mobile" : "desktop";
}

/** Stable key of a scene on a page: the id, plus the revision when there is one. */
export function sceneKey(source: Pick<SceneSource, "id" | "rev">): string {
  return source.rev === undefined ? source.id : `${source.id}.r${source.rev}`;
}

export function sceneFolderUrl(source: SceneSource): string {
  return `${source.baseUrl.replace(/\/+$/, "")}/${sceneKey(source)}`;
}

export function sceneFileUrl(source: SceneSource, file: string): string {
  return `${sceneFolderUrl(source)}/${file.replace(/^\/+/, "")}`;
}

export function manifestUrl(source: SceneSource): string {
  return sceneFileUrl(source, "manifest.json");
}

export function pickVariant(manifest: VideoManifest, name: VariantName): VideoVariant {
  const variant = manifest.variants.find((v) => v.name === name) ?? manifest.variants[0];
  if (!variant) throw new Error(`Scene ${manifest.id} has no video variants`);
  return variant;
}

export function variantUrl(source: SceneSource, manifest: VideoManifest, name: VariantName): string {
  return sceneFileUrl(source, pickVariant(manifest, name).src);
}

export function posterUrls(source: SceneSource, manifest: VideoManifest, frame: "first" | "last" = "first"): { avif: string; webp: string } {
  const last = manifest.poster.last;
  if (frame === "last" && last) return { avif: sceneFileUrl(source, last.avif), webp: sceneFileUrl(source, last.webp) };
  return {
    avif: sceneFileUrl(source, manifest.poster.avif),
    webp: sceneFileUrl(source, manifest.poster.webp),
  };
}

/** The avcC record as bytes, for `VideoDecoderConfig.description`. */
export function decodeDescription(index: VideoDecodeIndex): Uint8Array<ArrayBuffer> {
  const binary = atob(index.description);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Index of the keyframe at or before `frame` (binary search over `keys`). */
export function keyframeAtOrBefore(keys: readonly number[], frame: number): number {
  let lo = 0;
  let hi = keys.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] <= frame) {
      found = keys[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Checks the parts of a manifest the player depends on, and returns it typed. */
export function parseManifest(input: unknown): VideoManifest {
  const fail = (why: string): never => {
    throw new Error(`Invalid scene manifest: ${why}`);
  };
  if (typeof input !== "object" || input === null) return fail("not an object");
  const m = input as Partial<VideoManifest>;
  if (m.kind !== "video") return fail('kind must be "video"');
  if (typeof m.id !== "string" || m.id === "") return fail("missing id");
  if (typeof m.fps !== "number" || !(m.fps > 0)) return fail("fps must be positive");
  if (typeof m.frameCount !== "number" || !Number.isInteger(m.frameCount) || m.frameCount < 1) {
    return fail("frameCount must be a positive integer");
  }
  if (!m.poster || typeof m.poster.avif !== "string" || typeof m.poster.webp !== "string") return fail("missing poster");
  if (m.poster.last !== undefined && (typeof m.poster.last?.avif !== "string" || typeof m.poster.last?.webp !== "string")) return fail("poster.last is incomplete");
  if (!m.focal || typeof m.focal.x !== "number" || typeof m.focal.y !== "number") return fail("missing focal");
  if (!Array.isArray(m.timing) || m.timing.length !== m.frameCount) return fail("timing must have one entry per frame");
  if (!Array.isArray(m.variants) || m.variants.length === 0) return fail("no variants");
  for (const v of m.variants) {
    if (v.name !== "desktop" && v.name !== "mobile") return fail("unknown variant name");
    if (!(v.width > 0) || !(v.height > 0) || typeof v.src !== "string" || !(v.bytes > 0)) return fail(`variant ${v.name} is incomplete`);
    const d = v.decode;
    if (!d || typeof d.codec !== "string" || typeof d.description !== "string") return fail(`variant ${v.name} has no decode index`);
    if (!Array.isArray(d.samples) || d.samples.length !== m.frameCount) return fail(`variant ${v.name}: samples must have one entry per frame`);
    // The engine can only start decoding at a keyframe, so frame 0 must be one.
    if (!Array.isArray(d.keys) || d.keys[0] !== 0) return fail(`variant ${v.name}: frame 0 must be a keyframe`);
    for (const [offset, size] of d.samples) {
      if (!(offset >= 0) || !(size > 0) || offset + size > v.bytes) return fail(`variant ${v.name}: sample outside the file`);
    }
  }
  return m as VideoManifest;
}
