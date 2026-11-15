import { describe, expect, it } from "vitest";
import { POINTS, chooseN, deterministicShuffle, gameRef, settleReason, submitReason, teamScore } from "./scoring";

describe("teamScore", () => {
  it("averages the top n players", () => {
    expect(teamScore([10, 50, 30, 20], 3)).toBe(33.33);
    expect(teamScore([30, 20, 10], 3)).toBe(20);
  });

  it("counts missing players as zero", () => {
    expect(teamScore([30], 3)).toBe(10);
    expect(teamScore([], 3)).toBe(0);
  });

  it("ignores players below the top n, so casual joiners do not drag a team down", () => {
    expect(teamScore([40, 40, 40, 0, 0, 0, 0], 3)).toBe(40);
  });

  it("rounds half away from zero to 2 decimals, like Postgres round(numeric, 2)", () => {
    expect(teamScore([1, 0, 0, 0, 0, 0, 0, 0], 8)).toBe(0.13); // 0.125
    expect(teamScore([-1], 8)).toBe(-0.13);
    expect(teamScore([2, 0, 0], 3)).toBe(0.67);
  });

  it("rejects a bad n", () => {
    expect(() => teamScore([1], 0)).toThrow(RangeError);
  });
});

describe("chooseN", () => {
  it("is the smallest team's active count, clamped to 3..15", () => {
    expect(chooseN([8, 5, 12])).toBe(5);
    expect(chooseN([2, 9])).toBe(3);
    expect(chooseN([40, 22])).toBe(15);
  });

  it("ignores teams with no active players and defaults to 3", () => {
    expect(chooseN([0, 7, 9])).toBe(7);
    expect(chooseN([])).toBe(3);
    expect(chooseN([0, 0])).toBe(3);
  });
});

describe("deterministicShuffle", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("is stable per seed and leaves the input alone", () => {
    const first = deterministicShuffle(items, "game:player-1");
    expect(deterministicShuffle(items, "game:player-1")).toEqual(first);
    expect(items).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect([...first].sort()).toEqual(items);
  });

  it("differs across seeds", () => {
    const orders = new Set(Array.from({ length: 20 }, (_, i) => deterministicShuffle(items, `seed-${i}`).join("")));
    expect(orders.size).toBeGreaterThan(15);
  });

  it("handles empty and single-item lists", () => {
    expect(deterministicShuffle([], "x")).toEqual([]);
    expect(deterministicShuffle([1], "x")).toEqual([1]);
  });
});

describe("ledger helpers", () => {
  it("uses reasons and refs the score_events checks accept", () => {
    for (const reason of [...Object.keys(POINTS), submitReason("quiz"), settleReason("prediction")]) {
      expect(reason).toMatch(/^[a-z_]{1,32}$/);
    }
    expect(gameRef("3f0e8a52-6f0b-4c62-9d0e-2a4f1f6f7b11", "q".repeat(40)).length).toBeLessThanOrEqual(120);
    expect(POINTS).toMatchObject({ rsvp: 5, join: 5, wall_post: 3 });
  });
});
