"use client";

// Adapter between the invitation and the scroll-scene player (src/scenes).
// This is the only file that knows the player's API: the template's overlay
// slots become HTML positioned on the frame, the monogram becomes the splash.

import type { CSSProperties, ReactNode } from "react";
import { ScrollScene, SplashGate, type SceneRenderContext, type SceneSource, type VideoManifest } from "@/scenes";
import type { OverlaySlot, SceneRef } from "@/templates/types";
import { Star } from "../Icon";

export type OverlayItem = Pick<OverlaySlot, "role" | "appear" | "position" | "align" | "wash"> & { key: string; text: string };

export type OpeningSceneProps = {
  source: SceneSource;
  manifest: VideoManifest;
  scene: Pick<SceneRef, "scrollVh" | "holdVh" | "leadVh" | "gate">;
  overlays: OverlayItem[];
  monogram: string[];
  labels: { alt: string; splash: string; continue: string };
  // False in the editor preview, where no boot script locked the page.
  splash: boolean;
  // Greeting and language switch: laid over the top of the stage.
  children?: ReactNode;
};

// Long names shrink instead of wrapping into the footage (template contract: fit).
function fitScale(text: string, role: OverlayItem["role"]): number {
  const length = Array.from(text).length;
  const comfortable = role === "title" ? 12 : 30;
  return Math.max(0.55, Math.min(1, comfortable / Math.max(length, 1)));
}

function Overlays({ overlays, context }: { overlays: OverlayItem[]; context: SceneRenderContext }) {
  return (
    <>
      {overlays.some((item) => item.wash) ? <div className="inv-scene__wash" /> : null}
      {overlays.map((item) => {
        const place = item.position[context.variant];
        const style = {
          "--x": place.x,
          "--y": place.y,
          "--w": place.width,
          "--from": item.appear.from,
          "--span": Math.max(0.01, item.appear.to - item.appear.from),
          "--fit": fitScale(item.text, item.role),
        } as CSSProperties;
        return (
          <p key={item.key} className={`inv-ov inv-ov--${item.role}`} data-on={item.appear.on} data-align={item.align} style={style}>
            {item.text}
          </p>
        );
      })}
    </>
  );
}

export function Monogram({ letters }: { letters: string[] }) {
  return (
    <div className="inv-mono" aria-hidden="true">
      <div className="inv-mono__letters">
        {letters.map((letter, index) => (
          <span key={index} className="inv-mono__group">
            {index > 0 ? <Star size={16} className="inv-mono__star" /> : null}
            <span className="inv-mono__letter" style={{ "--i": index } as CSSProperties}>
              {letter}
            </span>
          </span>
        ))}
      </div>
      <span className="inv-mono__line" />
    </div>
  );
}

export function OpeningScene({ source, manifest, scene, overlays, monogram, labels, splash, children }: OpeningSceneProps) {
  return (
    <>
      {splash ? (
        <SplashGate label={labels.splash} continueLabel={labels.continue} className="inv-splash" continueClassName="inv-splash__continue" minMs={1800}>
          <Monogram letters={monogram} />
        </SplashGate>
      ) : null}
      <ScrollScene
        id="opening"
        className="inv-scene"
        source={source}
        manifest={manifest}
        alt={labels.alt}
        gate={scene.gate}
        priority
        leadVh={scene.leadVh ?? 0}
        scrollVh={scene.scrollVh}
        holdVh={scene.holdVh}
        frameOverlay={(context) => <Overlays overlays={overlays} context={context} />}
      >
        <div className="inv-scene__top">{children}</div>
        <span className="inv-scene__cue" aria-hidden="true" />
      </ScrollScene>
    </>
  );
}

// Used when a scene's manifest cannot be loaded: the same words on plain paper.
export function PlainOpening({ overlays, children }: { overlays: OverlayItem[]; children?: ReactNode }) {
  return (
    <section id="opening" className="inv-plain">
      <div className="inv-scene__top">{children}</div>
      {overlays.map((item) => (
        <p key={item.key} className={`inv-plain__line inv-plain__line--${item.role}`}>
          {item.text}
        </p>
      ))}
    </section>
  );
}
