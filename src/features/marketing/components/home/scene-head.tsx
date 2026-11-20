import { prefetchScript, sceneNoScriptCss, splashBootScript } from "@/scenes/boot-script";
import { buildPageSceneData, serializePageSceneData, SCENE_DATA_ID } from "@/scenes/page-data";
import type { MarketingScene } from "../../scenes";

// The scene player's page data and inline scripts (src/scenes/README.md). Page
// order is download order. No scene gates: the home page is not held behind a
// splash, so the boot script returns at once and only the prefetch starts.
// The scripts are constant strings; page data travels in the escaped JSON.
export function SceneHead({ scenes }: { scenes: MarketingScene[] }) {
  if (scenes.length === 0) return null;
  const data = buildPageSceneData(scenes.map((scene) => ({ source: scene.source, manifest: scene.manifest, gate: false })));
  return (
    <>
      <script id={SCENE_DATA_ID} type="application/json" dangerouslySetInnerHTML={{ __html: serializePageSceneData(data) }} />
      <script dangerouslySetInnerHTML={{ __html: splashBootScript() }} />
      <script dangerouslySetInnerHTML={{ __html: prefetchScript() }} />
      <noscript>
        <style>{sceneNoScriptCss()}</style>
      </noscript>
    </>
  );
}
