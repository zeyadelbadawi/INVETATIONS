"use client";

import { useEffect, useRef } from "react";

// Writes the header's background progress `--hp` (0 transparent → 1 solid
// night) from the first scene on the page: solid once the content after the
// scene reaches the header. Reduced motion still follows scroll here, because
// this is a colour change, not movement.
export function HeaderScroll() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const header = marker.current?.closest<HTMLElement>(".mk-header");
    const scene = document.querySelector<HTMLElement>("[data-seq-scene]");
    if (!header) return;
    if (!scene) {
      header.style.setProperty("--hp", "1");
      return;
    }
    let frame = 0;
    let last = "";
    const measure = () => {
      frame = 0;
      const bottom = scene.getBoundingClientRect().bottom;
      const bar = header.offsetHeight;
      // 0 while the scene's stage is pinned, rising as it scrolls away, 1 once its end reaches the header.
      const start = window.innerHeight;
      const value = Math.min(1, Math.max(0, (start - bottom) / Math.max(1, start - bar)));
      const text = value.toFixed(3);
      if (text !== last) header.style.setProperty("--hp", (last = text));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <span ref={marker} hidden />;
}
