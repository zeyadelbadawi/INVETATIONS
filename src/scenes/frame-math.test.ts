import { describe, expect, it } from "vitest";
import { progressToPosition, sectionHeightVh, sectionProgress, sectionSplit, walkStep, WALK_MS, WALK_SNAP } from "./frame-math";

describe("progressToPosition", () => {
  it("spreads frames evenly without a timing curve", () => {
    expect(progressToPosition(0, 241)).toBe(0);
    expect(progressToPosition(0.5, 241)).toBe(120);
    expect(progressToPosition(1, 241)).toBe(240);
  });

  it("clamps progress outside 0..1", () => {
    expect(progressToPosition(-0.2, 10)).toBe(0);
    expect(progressToPosition(1.7, 10)).toBe(9);
  });

  it("handles a single-frame scene", () => {
    expect(progressToPosition(0.6, 1, [0])).toBe(0);
  });

  it("finds the last frame whose timing is at or below p and adds the fraction to the next", () => {
    const timing = [0, 0.1, 0.5, 0.6, 1];
    expect(progressToPosition(0, 5, timing)).toBe(0);
    expect(progressToPosition(0.05, 5, timing)).toBeCloseTo(0.5);
    expect(progressToPosition(0.1, 5, timing)).toBe(1);
    expect(progressToPosition(0.3, 5, timing)).toBeCloseTo(1.5);
    expect(progressToPosition(0.8, 5, timing)).toBeCloseTo(3.5);
    expect(progressToPosition(1, 5, timing)).toBe(4);
  });

  it("is monotonic over a curve with flat stretches", () => {
    const timing = [0, 0, 0.2, 0.2, 0.2, 0.9, 1, 1];
    let previous = -1;
    for (let step = 0; step <= 1000; step++) {
      const position = progressToPosition(step / 1000, timing.length, timing);
      expect(position).toBeGreaterThanOrEqual(previous);
      expect(position).toBeLessThanOrEqual(timing.length - 1);
      previous = position;
    }
    expect(progressToPosition(1, timing.length, timing)).toBe(timing.length - 1);
  });

  it("gives the same position for the same progress (scroll is the only clock)", () => {
    const timing = Array.from({ length: 144 }, (_, i) => Math.round((i / 143) ** 1.3 * 1e4) / 1e4);
    for (const p of [0, 0.123, 0.5, 0.777, 1]) {
      expect(progressToPosition(p, 144, timing)).toBe(progressToPosition(p, 144, timing));
    }
  });

  it("falls back to even spacing when the curve does not match the frame count", () => {
    expect(progressToPosition(0.5, 11, [0, 1])).toBe(5);
  });
});

describe("sectionSplit / sectionProgress", () => {
  it("follows the playbook formula for move + hold", () => {
    const split = sectionSplit(0, 300, 80);
    expect(sectionHeightVh(0, 300, 80)).toBe(380);
    expect(split.travelVh).toBe(280);
    expect(split.framesStart).toBe(0);
    expect(split.framesEnd).toBeCloseTo(200 / 280);
  });

  it("lets the move run to the end when there is no hold", () => {
    const split = sectionSplit(0, 300, 0);
    expect(split.framesEnd).toBe(1);
    expect(sectionProgress(1, split)).toEqual({ frames: 1, hold: 0 });
    expect(sectionProgress(0.5, split)).toEqual({ frames: 0.5, hold: 0 });
  });

  it("keeps the first frame during the lead and the last during the hold", () => {
    const split = sectionSplit(15, 300, 80);
    const travel = 15 + 300 + 80 - 100;
    expect(split.framesStart).toBeCloseTo(15 / travel);
    expect(sectionProgress(0, split)).toEqual({ frames: 0, hold: 0 });
    expect(sectionProgress(split.framesStart / 2, split).frames).toBe(0);

    const midMove = (split.framesStart + split.framesEnd) / 2;
    expect(sectionProgress(midMove, split).frames).toBeCloseTo(0.5);
    expect(sectionProgress(midMove, split).hold).toBe(0);

    const midHold = (split.framesEnd + 1) / 2;
    expect(sectionProgress(midHold, split).frames).toBe(1);
    expect(sectionProgress(midHold, split).hold).toBeCloseTo(0.5);
    expect(sectionProgress(1, split)).toEqual({ frames: 1, hold: 1 });
  });

  it("does not divide by zero on a section no taller than the screen", () => {
    const split = sectionSplit(0, 100, 0);
    expect(split).toEqual({ travelVh: 0, framesStart: 0, framesEnd: 1 });
    expect(sectionProgress(0.4, split).frames).toBeCloseTo(0.4);
  });

  it("handles a section that is all hold", () => {
    const split = sectionSplit(0, 100, 100);
    expect(split.framesEnd).toBe(0);
    expect(sectionProgress(0, split)).toEqual({ frames: 1, hold: 0 });
    expect(sectionProgress(0.5, split)).toEqual({ frames: 1, hold: 0.5 });
  });
});

describe("walkStep", () => {
  it("snaps onto the target when close", () => {
    expect(walkStep(10, 10 + WALK_SNAP - 0.01, 16)).toBe(10 + WALK_SNAP - 0.01);
    expect(walkStep(10, 10, 16)).toBe(10);
  });

  it("eases exponentially toward the target", () => {
    const next = walkStep(0, 100, WALK_MS);
    expect(next).toBeCloseTo(100 * (1 - Math.exp(-1)));
  });

  it("moves both ways and never overshoots", () => {
    let walk = 200;
    for (let i = 0; i < 200; i++) {
      const next = walkStep(walk, 20, 16);
      expect(next).toBeLessThanOrEqual(walk);
      expect(next).toBeGreaterThanOrEqual(20);
      walk = next;
    }
    expect(walk).toBe(20);
  });

  it("caps a long pause so the step stays an ease", () => {
    expect(walkStep(0, 100, 5000)).toBe(walkStep(0, 100, 64));
    expect(walkStep(0, 100, 5000)).toBeLessThan(100);
  });

  it("does not move on a zero or negative time step", () => {
    expect(walkStep(0, 100, 0)).toBe(0);
    expect(walkStep(0, 100, -5)).toBe(0);
  });
});
