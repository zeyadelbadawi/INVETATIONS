"use client";

// The splash gate (playbook §7.3), with one change: only scenes marked `gate` hold it.
// The lock itself comes from the boot script before the first paint (§7.2); this code decides
// when to let go.

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { SPLASH_ATTR, SPLASH_JS_ATTR } from "./boot-script";
import { getDeviceTier, tierPlaysScenes } from "./device-tier";
import { getSmoothScroll } from "./motion-libs";
import { getVisitVariant, readPageSceneData } from "./page-data";
import { getSceneState, getSceneStatusSnapshot, isStillsVisit, subscribeSceneStatus, switchVisitToStills } from "./scene-status";
import { getPreloader, type VideoPreloader } from "./video-preload";

export type SplashPhase = "hold" | "leaving" | "done";

export type SplashGateOptions = {
  /** Minimum time on a first visit, from navigation start, so the splash animation completes. */
  minMs?: number;
  /** Minimum time when the scenes already loaded earlier in this session. */
  quickMinMs?: number;
  /** Length of the exit on a first visit; the page stays locked until it ends. */
  exitMs?: number;
  quickExitMs?: number;
  /** "Continue without waiting" appears after this long without progress… */
  stallMs?: number;
  /** …or once the whole wait passes this. */
  maxWaitMs?: number;
  /** If the measured line would need longer than this for the rest, the visit switches to stills. */
  slowLineSeconds?: number;
  /** sessionStorage key prefix; the video variant is appended. */
  sessionKeyPrefix?: string;
};

export type SplashGateState = {
  phase: SplashPhase;
  /** 0..1 of the bytes the splash waits for. */
  progress: number;
  /** Same-session return: the quick cover. */
  quick: boolean;
  /** The current exit length, for the panel's fade. */
  exitMs: number;
  /** A way out is offered because loading stalled or took too long. */
  canContinue: boolean;
};

const DEFAULTS: Required<SplashGateOptions> = {
  minMs: 2000,
  quickMinMs: 250,
  exitMs: 600,
  quickExitMs: 400,
  stallMs: 8000,
  maxWaitMs: 30000,
  slowLineSeconds: 30,
  sessionKeyPrefix: "sq-ready-",
};

const SERVER_STATE: SplashGateState = { phase: "hold", progress: 0, quick: false, exitMs: DEFAULTS.exitMs, canContinue: false };
const TICK_MS = 250;
/** After the jump to the release position, how long to wait for the scenes to draw there. */
const SETTLE_MS = 1000;
const SCROLL_KEYS = new Set([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);

function readSession(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSession(key: string): void {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Private modes may refuse storage; the next visit just gets the full splash.
  }
}

/** Top of the page, or the `#hash` target minus `scroll-padding-top`. */
function releasePosition(): number {
  const hash = window.location.hash.slice(1);
  if (!hash) return 0;
  let target: HTMLElement | null = null;
  try {
    target = document.getElementById(decodeURIComponent(hash));
  } catch {
    target = null;
  }
  if (!target) return 0;
  const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  return Math.max(0, target.getBoundingClientRect().top + window.scrollY - padding);
}

/** Makes everything except the panel (and its ancestors) inert. Returns the undo. */
function makeOthersInert(panel: HTMLElement): () => void {
  const changed: HTMLElement[] = [];
  for (let node: HTMLElement | null = panel; node && node !== document.body; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement?.children ?? [])) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      if (sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE" || sibling.tagName === "LINK") continue;
      sibling.inert = true;
      changed.push(sibling);
    }
  }
  return () => {
    for (const element of changed) element.inert = false;
  };
}

/** Blocks wheel, touch and scroll keys in the capture phase, before anything else sees them. */
function blockScrollInput(panel: HTMLElement): () => void {
  const block = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const onKey = (event: KeyboardEvent) => {
    if (!SCROLL_KEYS.has(event.key)) return;
    // Space must still press the panel's own button.
    const target = event.target;
    if (event.key === " " && target instanceof Element && panel.contains(target) && target.closest("button, a[href]")) return;
    event.preventDefault();
  };
  const options: AddEventListenerOptions = { capture: true, passive: false };
  window.addEventListener("wheel", block, options);
  window.addEventListener("touchmove", block, options);
  window.addEventListener("keydown", onKey, options);
  return () => {
    window.removeEventListener("wheel", block, options);
    window.removeEventListener("touchmove", block, options);
    window.removeEventListener("keydown", onKey, options);
  };
}

export class SplashGateController {
  private readonly options: Required<SplashGateOptions>;
  private readonly listeners = new Set<() => void>();
  private state: SplashGateState = SERVER_STATE;
  private released = false;
  private stop: (() => void) | null = null;
  private releaseNow: ((loaded: boolean) => void) | null = null;
  private pendingOpen: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SplashGateOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SplashGateState => this.state;

  /** The visitor chose not to wait. */
  continueNow = (): void => {
    this.releaseNow?.(false);
  };

  /** Takes over the lock the boot script set. Returns the cleanup. */
  start(panel: HTMLElement | null): () => void {
    const root = document.documentElement;
    if (this.pendingOpen !== null) clearTimeout(this.pendingOpen);
    this.pendingOpen = null;
    // No lock means no gating scene, a tier without scenes, or the 10 s failsafe already let the
    // page open. In none of those cases may the page be covered again.
    if (this.released || !panel || root.getAttribute(SPLASH_ATTR) !== "hold") {
      this.patch({ phase: "done" });
      return () => {};
    }
    root.setAttribute(SPLASH_JS_ATTR, "1");
    if (!tierPlaysScenes(getDeviceTier())) {
      root.setAttribute(SPLASH_ATTR, "seen");
      this.patch({ phase: "done" });
      return () => {};
    }

    const { options } = this;
    const sessionKey = options.sessionKeyPrefix + getVisitVariant();
    const quick = readSession(sessionKey);
    const minMs = quick ? options.quickMinMs : options.minMs;
    const exitMs = quick ? options.quickExitMs : options.exitMs;
    this.patch({ quick, exitMs });

    const pageGateKeys = readPageSceneData(document).s.filter((scene) => scene.g === 1).map((scene) => scene.k);
    const preloader: VideoPreloader = getPreloader();
    const undoInert = makeOthersInert(panel);
    const undoBlock = blockScrollInput(panel);
    getSmoothScroll()?.stop();

    const timers = new Set<ReturnType<typeof setTimeout>>();
    let frameRequest = 0;
    let stopped = false;
    let fontsReady = !("fonts" in document);
    let lastSignature = "";
    let lastProgressAt = performance.now();

    const gateKeys = (): string[] => {
      const keys = new Set(pageGateKeys);
      for (const [key, scene] of Object.entries(getSceneStatusSnapshot().scenes)) if (scene.gate) keys.add(key);
      return [...keys];
    };
    const sceneSettled = (key: string): boolean => {
      const scene = getSceneState(key);
      return !!scene && (scene.mode === "still" ? scene.ready : scene.presented === Math.round(scene.want));
    };

    const unlock = () => {
      undoInert();
      undoBlock();
      unsubscribePreloader();
      unsubscribeScenes();
      clearInterval(ticker);
      for (const timer of timers) clearTimeout(timer);
      cancelAnimationFrame(frameRequest);
    };

    const finish = (y: number) => {
      unlock();
      root.setAttribute(SPLASH_ATTR, "seen");
      window.scrollTo({ top: y, behavior: "instant" });
      // Move the smooth-scroll engine there too, so nothing it picked up meanwhile carries the page on.
      const smooth = getSmoothScroll();
      smooth?.start();
      smooth?.scrollTo(y, { immediate: true, force: true });
      this.stop = null;
      this.patch({ phase: "done" });
    };

    const leave = (y: number) => {
      // The lock stays on through the exit; scrolling must not reopen while the panel fades (§7.2).
      root.setAttribute(SPLASH_ATTR, "leaving");
      this.patch({ phase: "leaving", progress: 1, canContinue: false });
      timers.add(setTimeout(() => finish(y), exitMs));
    };

    const release = (loaded: boolean) => {
      if (this.released || stopped) return;
      this.released = true;
      this.releaseNow = null;
      if (loaded) writeSession(sessionKey);
      const y = releasePosition();
      window.scrollTo({ top: y, behavior: "instant" });
      // The scenes now draw the frame for that position; leave once they have, or after a short wait.
      const deadline = performance.now() + (loaded ? SETTLE_MS : 0);
      const waitForFrames = () => {
        if (performance.now() >= deadline || gateKeys().every(sceneSettled)) leave(y);
        else frameRequest = requestAnimationFrame(waitForFrames);
      };
      frameRequest = requestAnimationFrame(waitForFrames);
    };
    this.releaseNow = release;

    const check = () => {
      if (this.released || stopped) return;
      const now = performance.now();
      const progress = preloader.getProgress();
      const keys = gateKeys();
      const readyCount = keys.filter((key) => getSceneState(key)?.ready).length;

      const signature = `${progress.blockingLoaded}:${readyCount}`;
      if (signature !== lastSignature) {
        lastSignature = signature;
        lastProgressAt = now;
      }
      const fraction = progress.blockingTotal > 0 ? progress.blockingLoaded / progress.blockingTotal : 1;
      this.patch({ progress: Math.max(this.state.progress, Math.min(1, fraction)) });

      // A slow line: stop downloading and show the still version instead of keeping the visitor here.
      const estimate = preloader.getEstimate();
      if (estimate && estimate.remainingSeconds > options.slowLineSeconds && !isStillsVisit()) {
        preloader.abort();
        switchVisitToStills();
      }

      const stills = isStillsVisit();
      const scenesReady = stills || (progress.blockingDone && readyCount === keys.length);
      if (scenesReady && fontsReady && now >= minMs) release(!stills);
      else if (now - lastProgressAt >= options.stallMs || now >= options.maxWaitMs) this.patch({ canContinue: true });
    };

    const unsubscribePreloader = preloader.subscribe(check);
    const unsubscribeScenes = subscribeSceneStatus(check);
    const ticker = setInterval(check, TICK_MS);
    if (!fontsReady) {
      const done = () => {
        fontsReady = true;
        check();
      };
      document.fonts.ready.then(done, done);
    }
    check();

    this.stop = () => {
      stopped = true;
      this.stop = null;
      this.releaseNow = null;
      unlock();
      // Unmounted mid-wait (route change): the page must not stay locked. Deferred, because
      // React's development double-mount runs this cleanup and then starts the gate again.
      this.pendingOpen = setTimeout(() => {
        if (root.getAttribute(SPLASH_ATTR) !== "seen") root.setAttribute(SPLASH_ATTR, "seen");
        getSmoothScroll()?.start();
      }, 0);
    };
    return () => this.stop?.();
  }

  private patch(change: Partial<SplashGateState>): void {
    const next = { ...this.state, ...change };
    const same = (Object.keys(next) as (keyof SplashGateState)[]).every((key) => next[key] === this.state[key]);
    if (same) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }
}

const getServerState = (): SplashGateState => SERVER_STATE;

export type SplashGate = SplashGateState & { continueNow: () => void };

/** Runs the gate for the panel in `panelRef`. Options are read once, on mount. */
export function useSplashGate(panelRef: RefObject<HTMLElement | null>, options?: SplashGateOptions): SplashGate {
  const [controller] = useState(() => new SplashGateController(options));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, getServerState);
  useEffect(() => controller.start(panelRef.current), [controller, panelRef]);
  return { ...state, continueNow: controller.continueNow };
}
