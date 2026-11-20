import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { manifestUrl, parseManifest, type SceneSource, type VideoManifest } from "@/scenes/manifest";

// The three scenes of the public site. The footage is fixed (redesign plan):
// only these files are used, in this order on the home page.
export type MarketingSceneId = "wedding.doors" | "reveal.box" | "corporate.stage";

const REV = 1;

export type MarketingScene = { source: SceneSource; manifest: VideoManifest };

// With a media host the revision folder `<id>.r1` is used; without one, the
// committed drafts in public/media/drafts (served as /media/drafts), whose
// folders carry no revision suffix.
export function marketingSceneSource(id: MarketingSceneId): SceneSource {
  const base = process.env.NEXT_PUBLIC_MEDIA_URL;
  return base ? { id, rev: REV, baseUrl: base } : { id, baseUrl: "/media/drafts" };
}

async function readManifest(id: MarketingSceneId): Promise<VideoManifest> {
  "use cache";
  cacheLife("days");
  const source = marketingSceneSource(id);
  if (process.env.NEXT_PUBLIC_MEDIA_URL) {
    const response = await fetch(manifestUrl(source));
    if (!response.ok) throw new Error(`scene manifest ${response.status}`);
    return parseManifest(await response.json());
  }
  const file = path.join(process.cwd(), "public", "media", "drafts", id, "manifest.json");
  return parseManifest(JSON.parse(await readFile(file, "utf8")));
}

/** Null when the manifest cannot be read: the section then shows its still. */
export async function loadMarketingScene(id: MarketingSceneId): Promise<MarketingScene | null> {
  try {
    return { source: marketingSceneSource(id), manifest: await readManifest(id) };
  } catch {
    return null;
  }
}

/** Last-frame still of a scene, for closing shots and backdrops. */
export function sceneStill(id: MarketingSceneId): { avif: string; webp: string } {
  const base = process.env.NEXT_PUBLIC_MEDIA_URL;
  const folder = base ? `${base.replace(/\/+$/, "")}/${id}.r${REV}` : `/media/drafts/${id}`;
  return { avif: `${folder}/last.avif`, webp: `${folder}/last.webp` };
}
