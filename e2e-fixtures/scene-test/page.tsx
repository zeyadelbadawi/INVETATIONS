// Test page for the scene player: three scenes cut from the committed draft footage.
// A gates the splash; B is chained onto A; C stands alone further down and does not gate.

import type { CSSProperties } from "react";
import {
  buildPageSceneData,
  MotionProvider,
  ScrollScene,
  SplashGate,
  type PageSceneData,
  type SceneSource,
  type VideoManifest,
} from "../../src/scenes";

export type HarnessProps = { manifest: VideoManifest; splash?: { stallMs?: number } };

const BASE_URL = "/media";
export const SCENES: { source: SceneSource; gate: boolean }[] = [
  { source: { id: "draft.opening", baseUrl: BASE_URL }, gate: true },
  { source: { id: "draft.second", baseUrl: BASE_URL }, gate: false },
  { source: { id: "draft.third", baseUrl: BASE_URL }, gate: false },
];

export function pageSceneData(manifest: VideoManifest): PageSceneData {
  return buildPageSceneData(SCENES.map((scene) => ({ ...scene, manifest })));
}

const P = "var(--seq-progress, 0)";
const HOLD = "var(--seq-hold, 0)";
const copyStyle: CSSProperties = { position: "absolute", left: "8%", bottom: "12%", color: "#fff", font: "600 40px/1.1 system-ui" };

export function Page({ manifest, splash }: HarnessProps) {
  const [a, b, c] = SCENES;
  return (
    <MotionProvider headerOffset={0}>
      <SplashGate {...splash} />
      <main>
        <ScrollScene
          source={a.source}
          manifest={manifest}
          gate={a.gate}
          priority
          alt="Opening shot"
          scrollVh={300}
          holdVh={80}
          frameOverlay={<span data-testid="mark-a" style={{ position: "absolute", left: "62%", top: "40%", width: 12, height: 12, background: "#fff" }} />}
        >
          <h1 data-testid="copy-a" style={{ ...copyStyle, opacity: `clamp(0, calc(${HOLD} * 3), 1)` }}>
            Scene A
          </h1>
        </ScrollScene>
        <ScrollScene source={b.source} manifest={manifest} gate={b.gate} alt="Second shot" continuesPrevious leadVh={15} scrollVh={300}>
          <p data-testid="copy-b" style={{ ...copyStyle, opacity: `clamp(0, calc((${P} - 0.5) * 4), 1)` }}>
            Scene B
          </p>
        </ScrollScene>
        <section id="after" style={{ height: "160vh", padding: 40, background: "#f4f1ea" }}>
          <h2>After the walk</h2>
          <a href="/other.html">Another page</a>
        </section>
        <ScrollScene source={c.source} manifest={manifest} gate={c.gate} alt="Third shot" scrollVh={250} />
        <footer style={{ height: "60vh", padding: 40 }}>End</footer>
      </main>
    </MotionProvider>
  );
}
