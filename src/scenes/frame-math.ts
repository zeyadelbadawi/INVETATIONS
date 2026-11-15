// Pure scroll → frame math (playbook §6.3, §6.4). No DOM.

export const WALK_MS = 55;
export const WALK_SNAP = 0.35;
/** A long pause between steps (tab switch) must not turn into one huge ease step. */
export const WALK_MAX_DT_MS = 64;

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export type SectionSplit = {
  /** Pinned travel in vh: the section's height minus one screen. */
  travelVh: number;
  /** Progress (0..1 of the travel) where the move starts and ends. */
  framesStart: number;
  framesEnd: number;
};

export function sectionHeightVh(leadVh: number, scrollVh: number, holdVh: number): number {
  return leadVh + scrollVh + holdVh;
}

/** Lead (stays on the first frame) → move → hold (stays on the last frame). */
export function sectionSplit(leadVh: number, scrollVh: number, holdVh: number): SectionSplit {
  const travelVh = sectionHeightVh(leadVh, scrollVh, holdVh) - 100;
  if (!(travelVh > 0)) return { travelVh: 0, framesStart: 0, framesEnd: 1 };
  const framesStart = clamp01(leadVh / travelVh);
  const framesEnd = holdVh > 0 ? clamp01((leadVh + scrollVh - 100) / travelVh) : 1;
  return { travelVh, framesStart, framesEnd: Math.max(framesStart, framesEnd) };
}

export type SectionProgress = {
  /** 0..1 over the move. */
  frames: number;
  /** 0..1 over the hold; 0 when the section has no hold. */
  hold: number;
};

/** Splits the pinned-travel progress `p` (0..1) into move and hold progress. */
export function sectionProgress(p: number, split: SectionSplit): SectionProgress {
  const { framesStart, framesEnd } = split;
  const span = framesEnd - framesStart;
  const frames = span > 0 ? clamp01((p - framesStart) / span) : p >= framesEnd ? 1 : 0;
  const hold = framesEnd < 1 ? clamp01((p - framesEnd) / (1 - framesEnd)) : 0;
  return { frames, hold };
}

/**
 * Move progress (0..1) → fractional frame position. With a timing curve, finds the last frame
 * whose timing ≤ p and adds the fraction to the next one; without, spreads frames evenly.
 */
export function progressToPosition(p: number, frameCount: number, timing?: readonly number[]): number {
  const last = frameCount - 1;
  if (last <= 0) return 0;
  const t = clamp01(p);
  if (!timing || timing.length !== frameCount) return t * last;

  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timing[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  if (lo >= last) return last;
  const span = timing[lo + 1] - timing[lo];
  const fraction = span > 0 ? clamp01((t - timing[lo]) / span) : 0;
  return lo + fraction;
}

/** One step of the walk toward `want`: a short exponential ease that snaps when close (§6.4). */
export function walkStep(walk: number, want: number, dtMs: number): number {
  const gap = want - walk;
  if (Math.abs(gap) < WALK_SNAP) return want;
  const dt = Math.min(WALK_MAX_DT_MS, Math.max(0, dtMs));
  return walk + gap * (1 - Math.exp(-dt / WALK_MS));
}
