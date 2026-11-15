import { listTemplates } from "@/templates/registry";
import { PreviewApp } from "@/features/invite/preview/PreviewApp";
import { loadScene, type LoadedScene } from "@/features/invite/server/scenes";

// Editor preview target, loaded in a sandboxed iframe. The server sends one
// static shell for every event: it looks nothing up and reads nothing from the
// request (the id in the URL only keeps previews of different events apart in
// caches). The draft arrives in the browser by postMessage.
//
// The shell carries the scene manifests of the registered templates, which are
// public build-time data, so the opening can play inside the frame.
async function templateScenes(): Promise<Record<string, LoadedScene>> {
  const scenes: Record<string, LoadedScene> = {};
  for (const template of listTemplates()) {
    for (const ref of template.scenes) {
      if (scenes[ref.id]) continue;
      const loaded = await loadScene(ref);
      if (loaded) scenes[ref.id] = loaded;
    }
  }
  return scenes;
}

export default async function PreviewPage() {
  return <PreviewApp scenes={await templateScenes()} />;
}
