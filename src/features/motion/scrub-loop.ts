// One shared scroll loop that writes each registered element's scroll progress
// into the CSS variable `--p` (0…1). Visuals are plain CSS reading `--p`, so the
// page needs one listener and one layout read per frame, whatever the number of
// sections. Lenis moves the native scroll position, so this follows it as is.
//
// Static guarantees (redesign plan §5):
// - Before this runs (no JS, or before hydration) `--p` is unset and CSS falls
//   back to `var(--p, 1)`: the final, readable state.
// - Under prefers-reduced-motion every element is pinned to `--p: 1` and marked
//   `data-still`, so CSS can drop sticky stages and show the complete content.

export type ScrubRange =
  /** A tall wrapper around a sticky stage: 0 when its top meets the viewport top, 1 when its bottom meets the viewport bottom. */
  | "pin"
  /** From the element's top entering at the bottom of the viewport to its bottom leaving at the top. */
  | "through"
  /** From the element's top entering at the bottom of the viewport to its top reaching `span` of the viewport height higher. */
  | "enter";

export type ScrubOptions = { range: ScrubRange; span?: number };

type Entry = { element: HTMLElement; options: ScrubOptions; last: number };

const entries = new Set<Entry>();
let frame = 0;
let listening = false;
let still = false;
let motionQuery: MediaQueryList | null = null;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

export function progressFor(range: ScrubRange, top: number, height: number, viewport: number, span = 0.75): number {
  switch (range) {
    case "pin": {
      const travel = height - viewport;
      return travel <= 0 ? (top <= 0 ? 1 : 0) : clamp01(-top / travel);
    }
    case "through":
      return clamp01((viewport - top) / (viewport + height));
    case "enter":
      return clamp01((viewport - top) / Math.max(1, viewport * span));
  }
}

function write(entry: Entry, value: number) {
  const rounded = Math.round(value * 10000) / 10000;
  if (rounded === entry.last) return;
  entry.last = rounded;
  entry.element.style.setProperty("--p", String(rounded));
}

function measure() {
  frame = 0;
  const viewport = window.innerHeight;
  for (const entry of entries) {
    if (still) {
      write(entry, 1);
      continue;
    }
    const box = entry.element.getBoundingClientRect();
    write(entry, progressFor(entry.options.range, box.top, box.height, viewport, entry.options.span));
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(measure);
}

function applyStill() {
  still = Boolean(motionQuery?.matches);
  for (const entry of entries) entry.element.toggleAttribute("data-still", still);
  schedule();
}

function start() {
  if (listening) return;
  listening = true;
  motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  motionQuery.addEventListener("change", applyStill);
  still = motionQuery.matches;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  // Fonts and late images move every section.
  void document.fonts?.ready.then(schedule);
  window.addEventListener("load", schedule);
}

function stop() {
  if (!listening || entries.size > 0) return;
  listening = false;
  motionQuery?.removeEventListener("change", applyStill);
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", schedule);
  window.removeEventListener("load", schedule);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
}

/** Registers an element; returns the cleanup. The first value is written synchronously. */
export function registerScrub(element: HTMLElement, options: ScrubOptions): () => void {
  start();
  const entry: Entry = { element, options, last: -1 };
  entries.add(entry);
  element.toggleAttribute("data-still", still);
  if (still) write(entry, 1);
  else {
    const box = element.getBoundingClientRect();
    write(entry, progressFor(options.range, box.top, box.height, window.innerHeight, options.span));
  }
  return () => {
    entries.delete(entry);
    element.style.removeProperty("--p");
    element.removeAttribute("data-still");
    stop();
  };
}
