"use client";

// One scroll-scrubbed scene (playbook §6.1, §6.3, §6.8, §6.9): a tall section with a sticky
// stage that holds the poster, the canvas, the fallback video, the frame overlay and the copy.

import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { getDeviceTier, getRingSize, tierPlaysScenes, type DeviceTier } from "./device-tier";
import { clamp01, progressToPosition, sectionHeightVh, sectionProgress, sectionSplit } from "./frame-math";
import { pickVariant, posterUrls, sceneFileUrl, sceneKey, type SceneSource, type VariantName, type VideoManifest } from "./manifest";
import { loadMotionLibs } from "./motion-libs";
import { getVisitVariant } from "./page-data";
import type { SceneDriver } from "./scene-driver";
import { isStillsVisit, registerScene, reportScene, subscribeSceneStatus } from "./scene-status";
import { getPreloader } from "./video-preload";

export type SceneRenderContext = {
  /** False in the still version: overlays must show their final state. */
  animated: boolean;
  /** Which cut of the footage the frame overlay is sized for. */
  variant: VariantName;
};

export type SceneSlot = ReactNode | ((context: SceneRenderContext) => ReactNode);

export type ScrollSceneProps = {
  source: SceneSource;
  manifest: VideoManifest;
  /** Alt text of the poster, the scene's accessible picture. */
  alt: string;
  /** The scene holds the splash until it has drawn its frame. Default false: it shows its poster until ready. */
  gate?: boolean;
  /** First scene of the page: its poster loads eagerly at high priority (the LCP image). */
  priority?: boolean;
  /** Scroll that stays on the first frame, in vh. */
  leadVh?: number;
  /** Scroll of the move, in vh. The first 100 is the screen the section itself fills. */
  scrollVh?: number;
  /** Scroll that stays on the last frame, in vh. */
  holdVh?: number;
  /** Shifts the focal x (0..1) across the move, to follow a subject on narrow screens. */
  panX?: [number, number];
  /** Chained scene (§6.8): starts one screen early and stays invisible until its section reaches the top. */
  continuesPrevious?: boolean;
  /** Marks that sit on the footage, positioned in % of the frame. A function only from client components. */
  frameOverlay?: SceneSlot;
  /** Headlines and CTAs. `children` is used when this is absent. */
  copy?: SceneSlot;
  children?: SceneSlot;
  id?: string;
  className?: string;
  stageClassName?: string;
};

const subscribeNever = () => () => {};
const serverTier = (): DeviceTier | null => null;
const serverVariant = (): VariantName => "desktop";
const serverStills = () => false;

function renderSlot(slot: SceneSlot | undefined, context: SceneRenderContext): ReactNode {
  return typeof slot === "function" ? slot(context) : slot;
}

type ViewTimelineConstructor = new (options: { subject: Element; axis?: string; inset?: string }) => AnimationTimeline;
type ScrollRangeAnimationOptions = KeyframeAnimationOptions & { rangeStart: string; rangeEnd: string };

/** Keeps a chained stage invisible until its section reaches the top of the screen (§6.8). */
function revealAtTop(section: HTMLElement, stage: HTMLElement): () => void {
  const ViewTimeline = (window as unknown as { ViewTimeline?: ViewTimelineConstructor }).ViewTimeline;
  if (typeof ViewTimeline === "function") {
    // inset "0px": the default range is measured inside scroll-padding-top, which reveals the stage early.
    const options: ScrollRangeAnimationOptions = {
      timeline: new ViewTimeline({ subject: section, axis: "block", inset: "0px" }),
      rangeStart: "entry 0%",
      rangeEnd: "entry 100%",
      fill: "backwards",
    };
    const animation = stage.animate({ visibility: ["hidden", "hidden"] }, options);
    return () => animation.cancel();
  }
  const toggle = () => {
    stage.style.visibility = section.getBoundingClientRect().top > 0 ? "hidden" : "";
  };
  toggle();
  window.addEventListener("scroll", toggle, { passive: true });
  window.addEventListener("resize", toggle);
  return () => {
    window.removeEventListener("scroll", toggle);
    window.removeEventListener("resize", toggle);
    stage.style.visibility = "";
  };
}

export function ScrollScene({
  source,
  manifest,
  alt,
  gate = false,
  priority = false,
  leadVh = 0,
  scrollVh = 300,
  holdVh = 0,
  panX,
  continuesPrevious = false,
  frameOverlay,
  copy,
  children,
  id,
  className,
  stageClassName,
}: ScrollSceneProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Before hydration the tier is unknown and the scroll layout stays, so the page doesn't jump (§6.2).
  const tier = useSyncExternalStore(subscribeNever, getDeviceTier, serverTier);
  const variantName = useSyncExternalStore(subscribeNever, getVisitVariant, serverVariant);
  const stills = useSyncExternalStore(subscribeSceneStatus, isStillsVisit, serverStills);
  const animated = !stills && (tier === null || tierPlaysScenes(tier));
  const hydrated = tier !== null;

  const key = sceneKey(source);
  const variant = pickVariant(manifest, variantName);
  const videoUrl = sceneFileUrl(source, variant.src);
  // The still version shows the final frame, under the overlays in their final state.
  const poster = posterUrls(source, manifest, animated ? "first" : "last");
  const panFrom = panX?.[0];
  const panTo = panX?.[1];

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!hydrated || !animated || !section || !stage || !canvas || !video) return;

    let disposed = false;
    let driver: SceneDriver | null = null;
    let near = true;
    let want = 0;
    let lastProgress = "";
    let lastHold = "";
    let lastPan = "";
    const split = sectionSplit(leadVh, scrollVh, holdVh);
    const unregister = registerScene(key, gate);

    // Two custom properties drive every overlay; nothing here re-renders React (§6.9).
    const apply = (p: number) => {
      const { frames, hold } = sectionProgress(clamp01(p), split);
      const progressText = frames.toFixed(4);
      const holdText = hold.toFixed(4);
      if (progressText !== lastProgress) stage.style.setProperty("--seq-progress", (lastProgress = progressText));
      if (holdText !== lastHold) stage.style.setProperty("--seq-hold", (lastHold = holdText));
      if (panFrom !== undefined && panTo !== undefined) {
        const panText = (panFrom + (panTo - panFrom) * frames).toFixed(4);
        if (panText !== lastPan) stage.style.setProperty("--seq-fx", (lastPan = panText));
      }
      want = progressToPosition(frames, manifest.frameCount, manifest.timing);
      if (driver) driver.setWant(want);
      else reportScene(key, { want });
    };

    // The range is the stage's real pinned travel, not "bottom bottom" (§6.1).
    const pinnedTravel = () => Math.max(1, section.offsetHeight - stage.offsetHeight);
    const measure = () => apply(-section.getBoundingClientRect().top / pinnedTravel());

    // A plain scroll listener works from the first moment; ScrollTrigger takes over once it
    // has loaded, and if it never loads the listener simply stays.
    let stopTracking = () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    measure();
    loadMotionLibs().then(
      ({ ScrollTrigger }) => {
        if (disposed) return;
        stopTracking();
        const trigger = ScrollTrigger.create({
          trigger: section,
          start: "top top",
          end: () => `+=${pinnedTravel()}`,
          invalidateOnRefresh: true,
          onUpdate: (self) => apply(self.progress),
          onRefresh: (self) => apply(self.progress),
        });
        apply(trigger.progress);
        stopTracking = () => trigger.kill();
      },
      () => {},
    );

    const stopReveal = continuesPrevious ? revealAtTop(section, stage) : () => {};

    // More than one screen away, the driver frees its decoder and frames (§6.5).
    const observer = new IntersectionObserver(
      (entries) => {
        near = entries[entries.length - 1].isIntersecting;
        driver?.setNear(near);
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(section);

    const settleOnPoster = () => {
      if (!disposed) reportScene(key, { mode: "still", ready: true, shown: false });
    };
    getPreloader()
      .add({ key, url: videoUrl, bytes: variant.bytes, gate })
      .then(async (bytes) => {
        const { SceneDriver } = await import("./scene-driver");
        if (disposed) return;
        driver = new SceneDriver({ sceneKey: key, manifest, variant, bytes, canvas, video, ringSize: getRingSize() });
        driver.setNear(near);
        driver.setWant(want);
        await driver.start();
      })
      .catch(settleOnPoster);

    return () => {
      disposed = true;
      stopTracking();
      stopReveal();
      observer.disconnect();
      driver?.destroy();
      unregister();
      // --seq-progress / --seq-hold are left as they are: when the scene turns still, React has
      // already written their final values by the time this cleanup runs.
      if (lastPan !== "") stage.style.setProperty("--seq-fx", String(manifest.focal.x));
    };
  }, [hydrated, animated, key, gate, manifest, variant, videoUrl, leadVh, scrollVh, holdVh, panFrom, panTo, continuesPrevious]);

  const context: SceneRenderContext = { animated, variant: variantName };
  const aspect = variant.width / variant.height;
  const focalY = `${manifest.focal.y * 100}%`;
  const objectPosition = `calc(var(--seq-fx) * 100%) ${focalY}`;

  const sectionStyle: CSSProperties = animated
    ? {
        position: "relative",
        // lvh, not svh or vh: the stage keeps the largest height while phone browser bars move (§6.1).
        height: `calc(${sectionHeightVh(leadVh, scrollVh, holdVh)} * 1lvh)`,
        marginTop: continuesPrevious ? "-100lvh" : undefined,
      }
    : { position: "relative" };

  const stageStyle = {
    position: animated ? "sticky" : "relative",
    top: 0,
    height: "100lvh",
    width: "100%",
    overflow: "hidden",
    containerType: "size",
    "--seq-fx": manifest.focal.x,
    // The still version shows every overlay in its final state (§6.9).
    ...(animated ? {} : { "--seq-progress": 1, "--seq-hold": 1 }),
  } as CSSProperties;

  const mediaStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition,
  };
  const playerStyle: CSSProperties = { ...mediaStyle, opacity: 0, transition: "opacity 200ms linear", pointerEvents: "none" };

  // The full frame at "cover" size, placed like the picture, so a mark at x% / y% stays on the
  // same spot of the footage at every screen shape (§6.1).
  const frameStyle = {
    "--seq-fw": `max(100cqw, calc(100cqh * ${aspect}))`,
    position: "absolute",
    width: "var(--seq-fw)",
    height: `calc(var(--seq-fw) / ${aspect})`,
    left: "calc((100cqw - var(--seq-fw)) * var(--seq-fx))",
    top: `calc((100cqh - var(--seq-fw) / ${aspect}) * ${manifest.focal.y})`,
  } as CSSProperties;

  return (
    <section ref={sectionRef} id={id} className={className} style={sectionStyle} data-seq-scene="">
      <div ref={stageRef} className={stageClassName} style={stageStyle} data-seq-stage="" data-animated={animated ? "true" : "false"}>
        <picture>
          <source type="image/avif" srcSet={poster.avif} />
          <img
            src={poster.webp}
            alt={alt}
            width={manifest.poster.width}
            height={manifest.poster.height}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            style={mediaStyle}
          />
        </picture>
        {animated ? (
          <>
            <canvas ref={canvasRef} aria-hidden="true" width={variant.width} height={variant.height} style={playerStyle} />
            <video ref={videoRef} aria-hidden="true" tabIndex={-1} muted playsInline preload="none" disablePictureInPicture style={playerStyle} />
          </>
        ) : null}
        <div style={frameStyle} data-seq-frame="">
          {renderSlot(frameOverlay, context)}
        </div>
        <div style={{ position: "absolute", inset: 0 }} data-seq-copy="">
          {renderSlot(copy ?? children, context)}
        </div>
      </div>
    </section>
  );
}
