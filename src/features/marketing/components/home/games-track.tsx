"use client";

import type { FocusEvent, ReactNode } from "react";
import { getSmoothScroll } from "@/scenes/motion-libs";

// The row of game panels. The row itself moves with the pinned stage's `--p`
// (CSS). Keyboard focus landing in a panel scrolls the page to the point of the
// track where that panel is in view, so focus is never off-screen.
export function GamesTrack({ count, children }: { count: number; children: ReactNode }) {
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const panel = (event.target as HTMLElement).closest<HTMLElement>("[data-panel]");
    const pin = event.currentTarget.closest<HTMLElement>(".mo-pin");
    if (!panel || !pin || pin.hasAttribute("data-still")) return;
    const index = Number(panel.dataset.panel ?? 0);
    const top = pin.getBoundingClientRect().top + window.scrollY;
    const travel = Math.max(0, pin.offsetHeight - window.innerHeight);
    const target = Math.round(top + (count > 1 ? (travel * index) / (count - 1) : 0));
    if (Math.abs(window.scrollY - target) < 2) return;
    const smooth = getSmoothScroll();
    if (smooth) smooth.scrollTo(target, { immediate: true, force: true });
    else window.scrollTo({ top: target, behavior: "instant" });
  };
  return (
    <div className="mk-games__row" onFocus={onFocus}>
      {children}
    </div>
  );
}
