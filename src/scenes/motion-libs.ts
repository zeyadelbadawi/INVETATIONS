// GSAP + ScrollTrigger, loaded on demand so they stay out of the first bundle (playbook §8, §9).

import type { gsap as Gsap } from "gsap";
import type { ScrollTrigger as ScrollTriggerPlugin } from "gsap/ScrollTrigger";

export type MotionLibs = { gsap: typeof Gsap; ScrollTrigger: typeof ScrollTriggerPlugin };

let pending: Promise<MotionLibs> | null = null;

export function loadMotionLibs(): Promise<MotionLibs> {
  if (!pending) {
    pending = Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([core, plugin]) => {
        core.gsap.registerPlugin(plugin.ScrollTrigger);
        return { gsap: core.gsap, ScrollTrigger: plugin.ScrollTrigger };
      },
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
  }
  return pending;
}

/** The part of the smooth-scroll engine the splash gate needs. */
export type SmoothScroll = {
  stop(): void;
  start(): void;
  scrollTo(target: number, options: { immediate: boolean; force: boolean }): void;
};

let smoothScroll: SmoothScroll | null = null;

export function setSmoothScroll(engine: SmoothScroll | null): void {
  smoothScroll = engine;
}

export function getSmoothScroll(): SmoothScroll | null {
  return smoothScroll;
}
