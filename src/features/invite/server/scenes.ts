import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { manifestUrl, parseManifest, type SceneSource, type VideoManifest } from "@/scenes/manifest";
import type { SceneRef } from "@/templates/types";

export type LoadedScene = { source: SceneSource; manifest: VideoManifest };

// Scene media lives on the media host in revision folders. Without one
// configured, the committed draft scenes are used; they are expected to be
// served under /media/drafts.
export function sceneSource(scene: Pick<SceneRef, "id" | "rev">): SceneSource {
  const base = process.env.NEXT_PUBLIC_MEDIA_URL;
  return base ? { id: scene.id, rev: scene.rev, baseUrl: base } : { id: scene.id, baseUrl: "/media/drafts" };
}

async function readManifest(id: string, rev: number): Promise<VideoManifest> {
  "use cache";
  cacheLife("days");
  const source = sceneSource({ id, rev });
  if (!/^[a-z0-9]+([.-][a-z0-9]+)*$/.test(id)) throw new Error("bad scene id");
  if (process.env.NEXT_PUBLIC_MEDIA_URL) {
    const response = await fetch(manifestUrl(source));
    if (!response.ok) throw new Error(`scene manifest ${response.status}`);
    return parseManifest(await response.json());
  }
  const file = path.join(process.cwd(), "public", "media", "drafts", id, "manifest.json");
  return parseManifest(JSON.parse(await readFile(file, "utf8")));
}

// Null when the manifest cannot be read; the page then opens without footage.
export async function loadScene(scene: Pick<SceneRef, "id" | "rev">): Promise<LoadedScene | null> {
  try {
    return { source: sceneSource(scene), manifest: await readManifest(scene.id, scene.rev) };
  } catch {
    return null;
  }
}
