// Drives one scene: the walk toward the scroll position (playbook §6.4) and the renderer under
// it, which is the WebCodecs engine or, failing that, the video element.
// Loaded lazily, after the page, so none of this is in the first bundle (§6.7, §9).

import { FrameEngine, isEngineSupported } from "./frame-engine";
import { walkStep } from "./frame-math";
import type { VideoManifest, VideoVariant } from "./manifest";
import { getSceneState, reportScene } from "./scene-status";
import { VideoScrubber } from "./video-fallback";

export type SceneDriverOptions = {
  sceneKey: string;
  manifest: VideoManifest;
  variant: VideoVariant;
  /** The variant's whole MP4. */
  bytes: ArrayBuffer;
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  ringSize: number;
};

type Renderer = {
  present(target: number): number;
  setNear(near: boolean): void;
  destroy(): void;
};

export class SceneDriver {
  private readonly options: SceneDriverOptions;
  private renderer: Renderer | null = null;
  private surface: HTMLElement | null = null;
  private want = 0;
  private walk = 0;
  private walking = false;
  private presented = -1;
  private lastStepAt = 0;
  private frameRequest = 0;
  private near = true;
  private destroyed = false;

  constructor(options: SceneDriverOptions) {
    this.options = options;
  }

  /** Picks the renderer. Until this resolves, `setWant` only records the position. */
  async start(): Promise<void> {
    const { variant } = this.options;
    const engine = await isEngineSupported(variant.decode, variant.width, variant.height);
    if (this.destroyed) return;
    if (engine) this.useEngine();
    else this.useVideo();
  }

  /** The fractional frame the scroll position asks for. */
  setWant(position: number): void {
    this.want = position;
    reportScene(this.options.sceneKey, { want: position });
    this.requestStep();
  }

  setNear(near: boolean): void {
    this.near = near;
    this.renderer?.setNear(near);
    this.requestStep();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameRequest);
    this.renderer?.destroy();
    this.renderer = null;
    this.hide();
  }

  private useEngine(): void {
    const { manifest, variant, bytes, canvas, ringSize } = this.options;
    try {
      this.renderer = new FrameEngine({
        bytes,
        index: variant.decode,
        width: variant.width,
        height: variant.height,
        fps: manifest.fps,
        frameCount: manifest.frameCount,
        canvas,
        ringSize,
        onFrameAvailable: () => this.requestStep(),
        onFail: () => {
          if (!this.destroyed) this.useVideo();
        },
      });
    } catch {
      this.useVideo();
      return;
    }
    this.adopt(canvas, "engine");
  }

  private useVideo(): void {
    const { manifest, bytes, video } = this.options;
    this.hide();
    this.renderer = new VideoScrubber({
      video,
      bytes,
      fps: manifest.fps,
      frameCount: manifest.frameCount,
      onFrame: () => this.requestStep(),
      onFail: () => {
        if (!this.destroyed) this.useStill();
      },
    });
    this.adopt(video, "video");
  }

  /** Nothing can play the file: the poster stays, and the scene counts as settled. */
  private useStill(): void {
    this.hide();
    this.renderer = null;
    reportScene(this.options.sceneKey, { mode: "still", ready: true, shown: false });
  }

  private adopt(surface: HTMLElement, mode: "engine" | "video"): void {
    this.surface = surface;
    this.presented = -1;
    this.walking = false;
    this.renderer?.setNear(this.near);
    reportScene(this.options.sceneKey, { mode, shown: false, presented: -1 });
    this.requestStep();
  }

  private hide(): void {
    if (this.surface) this.surface.style.opacity = "0";
    this.surface = null;
  }

  private requestStep(): void {
    if (this.destroyed || this.frameRequest !== 0 || !this.renderer) return;
    this.frameRequest = requestAnimationFrame((now) => {
      this.frameRequest = 0;
      this.step(now);
    });
  }

  private step(now: number): void {
    const renderer = this.renderer;
    if (!renderer) return;
    // The first picture is the frame for the position itself; after that the walk eases there.
    this.walk = this.walking ? walkStep(this.walk, this.want, now - this.lastStepAt) : this.want;
    this.lastStepAt = now;

    const target = Math.round(this.walk);
    const presented = renderer.present(target);
    // A failure inside present() swaps the renderer; the new one starts its own steps.
    if (renderer !== this.renderer) return;

    if (presented !== this.presented) {
      const state = getSceneState(this.options.sceneKey);
      const jump = this.presented < 0 ? 0 : Math.abs(presented - this.presented);
      this.presented = presented;
      reportScene(this.options.sceneKey, { presented, maxStep: Math.max(state?.maxStep ?? 0, jump) });
    }
    if (presented >= 0) {
      this.walking = true;
      if (this.surface && this.surface.style.opacity !== "1") {
        // Fade in over the poster only once a frame has been painted (§6.1).
        this.surface.style.opacity = "1";
        reportScene(this.options.sceneKey, { shown: true });
      }
      if (presented === Math.round(this.want)) reportScene(this.options.sceneKey, { ready: true });
    }
    if (this.walk !== this.want || presented !== target) this.requestStep();
  }
}
