"use client";

// Smooth scroll for the page (playbook §8): one Lenis instance driven by GSAP's ticker,
// loaded when idle after the first paint, on HIGH/MID tiers only.

import { useEffect, type ReactNode } from "react";
import type { LenisOptions } from "lenis";
import { SPLASH_ATTR } from "./boot-script";
import { getDeviceTier, tierPlaysScenes } from "./device-tier";
import { loadMotionLibs, setSmoothScroll } from "./motion-libs";

export type MotionProviderProps = {
  children: ReactNode;
  /** Height of a fixed header in px; anchor links stop this far above their target. */
  headerOffset?: number;
  /** Extra Lenis options. `autoRaf` and `anchors` are set by the provider. Read once, on mount. */
  lenisOptions?: Omit<LenisOptions, "autoRaf" | "anchors">;
};

const IDLE_TIMEOUT_MS = 2000;
const IDLE_FALLBACK_MS = 200;

/** Runs `task` when the browser is idle, after the first paint. Returns a cancel. */
function whenIdle(task: () => void): () => void {
  let idle = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const frame = requestAnimationFrame(() => {
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    else timer = setTimeout(task, IDLE_FALLBACK_MS);
  });
  return () => {
    cancelAnimationFrame(frame);
    if (idle) window.cancelIdleCallback(idle);
    clearTimeout(timer);
  };
}

export function MotionProvider({ children, headerOffset = 0, lenisOptions }: MotionProviderProps) {
  useEffect(() => {
    // STATIC loads no motion library at all; LOW keeps native scrolling.
    if (!tierPlaysScenes(getDeviceTier())) return;
    let disposed = false;
    let teardown = () => {};

    const boot = async () => {
      const [{ gsap, ScrollTrigger }, { default: Lenis }] = await Promise.all([loadMotionLibs(), import("lenis")]);
      if (disposed) return;

      const lenis = new Lenis({ ...lenisOptions, autoRaf: false, anchors: { offset: -headerOffset } });
      const unsubscribe = lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      // While the splash is up the page must not glide; the gate starts the engine on release.
      const splash = document.documentElement.getAttribute(SPLASH_ATTR);
      if (splash === "hold" || splash === "leaving") lenis.stop();
      setSmoothScroll(lenis);

      // Fonts change the layout, and with it every trigger's start and end.
      void document.fonts?.ready.then(() => {
        if (!disposed) ScrollTrigger.refresh();
      });

      // A link clicked while the page still glides: Lenis would keep easing toward its old
      // target after the router has put the new page at the top. Drop the glide.
      const onClick = (event: MouseEvent) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
        if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
        lenis.scrollTo(lenis.scroll, { immediate: true, force: true });
      };
      document.addEventListener("click", onClick, { capture: true });

      teardown = () => {
        document.removeEventListener("click", onClick, { capture: true });
        setSmoothScroll(null);
        gsap.ticker.remove(tick);
        gsap.ticker.lagSmoothing(500, 33);
        unsubscribe();
        lenis.destroy();
      };
    };

    const cancelIdle = whenIdle(() => {
      // If the libraries fail to load the page keeps native scrolling.
      boot().catch(() => {});
    });
    return () => {
      disposed = true;
      cancelIdle();
      teardown();
    };
    // Options are read once: re-creating the scroll engine mid-visit would drop the scroll position's glide state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return children;
}
