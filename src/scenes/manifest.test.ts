import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeDescription,
  keyframeAtOrBefore,
  manifestUrl,
  parseManifest,
  pickVariant,
  posterUrls,
  sceneFileUrl,
  sceneFolderUrl,
  sceneKey,
  variantForScreen,
  variantUrl,
  type VideoManifest,
} from "./manifest";
import { buildPageSceneData, readPageSceneData, serializePageSceneData, SCENE_DATA_ID } from "./page-data";

const draftJson = (): unknown =>
  JSON.parse(readFileSync(resolve(__dirname, "../../media/drafts/draft.opening/manifest.json"), "utf8"));
const draft = (): VideoManifest => parseManifest(draftJson());

describe("scene URLs", () => {
  it("builds folder and file URLs from the caller's base", () => {
    const source = { id: "brand.hero", baseUrl: "https://media.example.com/videos/" };
    expect(sceneKey(source)).toBe("brand.hero");
    expect(sceneFolderUrl(source)).toBe("https://media.example.com/videos/brand.hero");
    expect(sceneFileUrl(source, "desktop.mp4")).toBe("https://media.example.com/videos/brand.hero/desktop.mp4");
    expect(manifestUrl(source)).toBe("https://media.example.com/videos/brand.hero/manifest.json");
  });

  it("points at the revision folder when a revision is given", () => {
    const source = { id: "brand.hero", rev: 2, baseUrl: "/media" };
    expect(sceneKey(source)).toBe("brand.hero.r2");
    expect(sceneFileUrl(source, "/poster.avif")).toBe("/media/brand.hero.r2/poster.avif");
  });

  it("resolves variant and poster files from the manifest", () => {
    const manifest = draft();
    const source = { id: "draft.opening", baseUrl: "/media/drafts" };
    expect(variantUrl(source, manifest, "desktop")).toBe("/media/drafts/draft.opening/desktop.mp4");
    expect(variantUrl(source, manifest, "mobile")).toBe("/media/drafts/draft.opening/mobile.mp4");
    expect(posterUrls(source, manifest)).toEqual({
      avif: "/media/drafts/draft.opening/poster.avif",
      webp: "/media/drafts/draft.opening/poster.webp",
    });
  });
});

describe("variantForScreen", () => {
  it("gives portrait screens (width/height < 0.9) the mobile cut", () => {
    expect(variantForScreen(390, 844)).toBe("mobile");
    expect(variantForScreen(899, 1000)).toBe("mobile");
    expect(variantForScreen(900, 1000)).toBe("desktop");
    expect(variantForScreen(1440, 900)).toBe("desktop");
    expect(variantForScreen(800, 0)).toBe("desktop");
  });
});

describe("keyframeAtOrBefore", () => {
  it("finds the keyframe that starts a frame's GOP", () => {
    const keys = [0, 6, 12, 18];
    expect(keyframeAtOrBefore(keys, 0)).toBe(0);
    expect(keyframeAtOrBefore(keys, 5)).toBe(0);
    expect(keyframeAtOrBefore(keys, 6)).toBe(6);
    expect(keyframeAtOrBefore(keys, 17)).toBe(12);
    expect(keyframeAtOrBefore(keys, 99)).toBe(18);
  });
});

describe("parseManifest (real draft scene)", () => {
  it("accepts the manifest written by build-video.mjs", () => {
    const manifest = draft();
    expect(manifest.id).toBe("draft.opening");
    expect(manifest.frameCount).toBe(144);
    expect(manifest.timing).toHaveLength(144);
    expect(manifest.timing[0]).toBe(0);
    expect(manifest.timing[143]).toBe(1);
    expect(pickVariant(manifest, "desktop").width).toBe(960);
    expect(pickVariant(manifest, "mobile").width).toBe(432);
    for (const variant of manifest.variants) {
      expect(variant.decode.samples).toHaveLength(144);
      expect(variant.decode.keys[0]).toBe(0);
      // GOP 6: any frame is at most 5 decodes from a keyframe.
      expect(variant.decode.keys.every((key, i) => key === i * 6)).toBe(true);
    }
  });

  it("decodes the avcC record and it matches the codec string", () => {
    const { decode } = pickVariant(draft(), "desktop");
    const avcc = decodeDescription(decode);
    expect(avcc[0]).toBe(1);
    const fromRecord = [avcc[1], avcc[2], avcc[3]].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(decode.codec).toBe(`avc1.${fromRecord}`);
  });

  it("falls back to the first variant when the asked one is missing", () => {
    const manifest = draft();
    const desktopOnly = { ...manifest, variants: manifest.variants.filter((v) => v.name === "desktop") };
    expect(pickVariant(desktopOnly, "mobile").name).toBe("desktop");
  });

  it("rejects manifests the player could not play", () => {
    const base = draftJson() as VideoManifest;
    expect(() => parseManifest(null)).toThrow(/not an object/);
    expect(() => parseManifest({ ...base, kind: "frames" })).toThrow(/kind/);
    expect(() => parseManifest({ ...base, timing: base.timing.slice(1) })).toThrow(/timing/);
    expect(() => parseManifest({ ...base, variants: [] })).toThrow(/variants/);
    const shortIndex = { ...base.variants[0], decode: { ...base.variants[0].decode, samples: base.variants[0].decode.samples.slice(1) } };
    expect(() => parseManifest({ ...base, variants: [shortIndex] })).toThrow(/samples/);
    const noLeadingKey = { ...base.variants[0], decode: { ...base.variants[0].decode, keys: [6, 12] } };
    expect(() => parseManifest({ ...base, variants: [noLeadingKey] })).toThrow(/keyframe/);
    const outside = { ...base.variants[0], bytes: 100 };
    expect(() => parseManifest({ ...base, variants: [outside] })).toThrow(/outside the file/);
  });
});

describe("page scene data", () => {
  const manifest = draft();
  const scenes = [
    { source: { id: "draft.opening", baseUrl: "/media/drafts" }, manifest, gate: true },
    { source: { id: "draft.opening", rev: 3, baseUrl: "https://cdn.example.com/v" }, manifest, gate: false },
  ];

  it("lists scenes in page order with both variants", () => {
    expect(buildPageSceneData(scenes)).toEqual({
      s: [
        { k: "draft.opening", g: 1, d: ["/media/drafts/draft.opening/desktop.mp4", 84936], m: ["/media/drafts/draft.opening/mobile.mp4", 42698] },
        {
          k: "draft.opening.r3",
          g: 0,
          d: ["https://cdn.example.com/v/draft.opening.r3/desktop.mp4", 84936],
          m: ["https://cdn.example.com/v/draft.opening.r3/mobile.mp4", 42698],
        },
      ],
    });
  });

  it("serializes so no markup can break out of the script element", () => {
    const hostile = { s: [{ k: "</script><script>alert(1)</script><!--", g: 1 as const, d: ["/a&b.mp4", 1] as [string, number], m: ["/m.mp4", 1] as [string, number] }] };
    const text = serializePageSceneData(hostile);
    expect(text).not.toMatch(/[<>&]/);
    expect(JSON.parse(text)).toEqual(hostile);
  });

  it("reads the list back from the JSON element and ignores malformed input", () => {
    const data = buildPageSceneData(scenes);
    const doc = (text: string | null) =>
      ({ getElementById: (id: string) => (id === SCENE_DATA_ID && text !== null ? { textContent: text } : null) }) as unknown as Document;
    expect(readPageSceneData(doc(serializePageSceneData(data)))).toEqual(data);
    expect(readPageSceneData(doc(null))).toEqual({ s: [] });
    expect(readPageSceneData(doc("{not json"))).toEqual({ s: [] });
    expect(readPageSceneData(doc('{"s":[{"k":1},{"k":"ok","g":0,"d":["/d",1],"m":["/m",1]}]}'))).toEqual({
      s: [{ k: "ok", g: 0, d: ["/d", 1], m: ["/m", 1] }],
    });
  });
});
