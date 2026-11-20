"use client";

// Adapter between the invitation and the scroll-scene player (src/scenes).
// This is the only file that knows the player's API: the template's overlay
// slots become HTML positioned on the frame, the monogram becomes the splash.

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { ScrollScene, SplashGate, type SceneRenderContext, type SceneSource, type VideoManifest } from "@/scenes";
import type { OverlaySlot, SceneRef } from "@/templates/types";

export type OverlayItem = Pick<OverlaySlot, "role" | "appear" | "position" | "align" | "wash"> & { key: string; text: string };

export type OpeningSceneProps = {
  source: SceneSource;
  manifest: VideoManifest;
  scene: Pick<SceneRef, "scrollVh" | "holdVh" | "leadVh" | "gate">;
  overlays: OverlayItem[];
  // The first screen's words: shown from the start, they give way as the scene moves.
  intro?: { eyebrow: string; title: string };
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

type Placed = { item: OverlayItem; x: number; y: number; w: number };

// Lines whose places sit close together on the frame are one block of copy: they
// are set as a column (so a long line pushes its neighbours instead of running
// into them) and share one scrim. A line far from the others (the reveal's date
// on phones) is a block of its own.
const BAND_GAP = 20;
function bands(overlays: OverlayItem[], variant: SceneRenderContext["variant"]): Placed[][] {
  const placed = overlays
    .map((item) => ({ item, x: item.position[variant].x, y: item.position[variant].y, w: item.position[variant].width }))
    .sort((a, b) => a.y - b.y);
  const groups: Placed[][] = [];
  for (const entry of placed) {
    const last = groups[groups.length - 1];
    if (last && entry.y - last[last.length - 1].y <= BAND_GAP) last.push(entry);
    else groups.push([entry]);
  }
  return groups;
}

const windowStyle = (from: number, to: number) => ({ "--from": from, "--span": Math.max(0.01, to - from) });

function Band({ group }: { group: Placed[] }) {
  const top = group[0].y;
  const bottom = group[group.length - 1].y;
  // A block in the upper half hangs from its first line; one in the lower half stands on its last.
  const anchor = (top + bottom) / 2 < 50 ? "top" : "bottom";
  const style = {
    "--x": group.reduce((sum, entry) => sum + entry.x, 0) / group.length,
    "--y": anchor === "top" ? top : bottom,
    "--w": Math.max(...group.map((entry) => entry.w)),
  } as CSSProperties;
  return (
    <div className="inv-ov-band" data-anchor={anchor} style={style}>
      {group.some((entry) => entry.item.wash) ? <div className="inv-ov-scrim" aria-hidden="true" /> : null}
      {group.map(({ item }, index) => {
        const before = group[index - 1]?.item;
        // Two names in a row: a hairline between them, drawn once the second name is in.
        const seam = before?.role === "title" && item.role === "title" ? Math.min(0.9, item.appear.from + 0.12) : null;
        return (
          <Fragment key={item.key}>
            {seam !== null ? <span className="inv-ov-rule" data-on={item.appear.on} style={windowStyle(seam, Math.min(1, seam + 0.22)) as CSSProperties} aria-hidden="true" /> : null}
            <p
              className={`inv-ov inv-ov--${item.role}`}
              data-on={item.appear.on}
              data-align={item.align}
              style={{ ...windowStyle(item.appear.from, item.appear.to), "--fit": fitScale(item.text, item.role) } as CSSProperties}
            >
              <span className="inv-ov__text">{item.text}</span>
            </p>
          </Fragment>
        );
      })}
    </div>
  );
}

// The frame layer is the whole frame at "cover" size, so parts of it can be off screen. The
// blocks are kept between the language switch and the Details button whatever the screen shape.
function Overlays({ overlays, context, manifest }: { overlays: OverlayItem[]; context: SceneRenderContext; manifest: VideoManifest }) {
  const variant = manifest.variants.find((v) => v.name === context.variant) ?? manifest.variants[0];
  const style = { "--aspect": variant.width / variant.height, "--fy": manifest.focal.y } as CSSProperties;
  return (
    <div className="inv-ov-layer" style={style}>
      {bands(overlays, context.variant).map((group) => (
        <Band key={group[0].item.key} group={group} />
      ))}
    </div>
  );
}

// The splash: the initials, with the same hairline that later sits between the names.
export function Monogram({ letters }: { letters: string[] }) {
  return (
    <div className="inv-mono" aria-hidden="true">
      <div className="inv-mono__letters">
        {letters.map((letter, index) => (
          <span key={index} className="inv-mono__group">
            {index > 0 ? <span className="inv-mono__seam" /> : null}
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

export function OpeningScene({ source, manifest, scene, overlays, intro, monogram, labels, splash, children }: OpeningSceneProps) {
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
        frameOverlay={(context) => <Overlays overlays={overlays} context={context} manifest={manifest} />}
      >
        <div className="inv-scene__top">{children}</div>
        {intro && (intro.eyebrow || intro.title) ? (
          // Decorative duplicate of the hold copy (which carries the words for screen readers).
          <div className="inv-scene__intro" aria-hidden="true">
            <span className="inv-scene__cue" />
            {intro.eyebrow ? <p className="inv-scene__eyebrow">{intro.eyebrow}</p> : null}
            {intro.title ? <p className="inv-scene__title">{intro.title}</p> : null}
          </div>
        ) : (
          <span className="inv-scene__cue" aria-hidden="true" />
        )}
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
