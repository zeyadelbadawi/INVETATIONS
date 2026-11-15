// Pure scoring helpers. `teamScore` and `chooseN` mirror the SQL function
// `recompute_team_scores` in supabase/migrations/20261115000001_init.sql — the
// database is the source of truth; these exist for previews and tests.
import type { GameKind } from "./types";

// Points per action, keyed by the `score_events.reason` it is recorded under.
export const POINTS = {
  join: 5,
  rsvp: 5,
  wall_post: 3,
  voice_post: 4,
  photo_post: 3,
} as const;
export type PointsReason = keyof typeof POINTS;

// Ledger reasons for game points; with `gameRef` they make each award idempotent
// under `unique (player_id, reason, ref)`.
export const submitReason = (kind: GameKind): string => kind;
export const settleReason = (kind: GameKind): string => `${kind}_settle`;
export const gameRef = (gameId: string, questionId: string): string => `${gameId}:${questionId}`;

export const TEAM_N_MIN = 3;
export const TEAM_N_MAX = 15;

// N = the smallest team's active-player count, clamped to 3..15. Like the SQL,
// teams with no active player are ignored, and with no active team at all N is 3.
export function chooseN(activeCountsPerTeam: readonly number[]): number {
  const active = activeCountsPerTeam.filter((count) => count > 0);
  const smallest = active.length > 0 ? Math.min(...active) : TEAM_N_MIN;
  return Math.max(TEAM_N_MIN, Math.min(TEAM_N_MAX, smallest));
}

// Average of the top n player totals, rounded to 2 decimals. A team with fewer
// than n players is still divided by n: the missing players count as 0.
export function teamScore(playerTotals: readonly number[], n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("n must be a positive integer");
  const top = [...playerTotals].sort((a, b) => b - a).slice(0, n);
  const sum = top.reduce((acc, value) => acc + value, 0);
  // Integer arithmetic, half away from zero — the same result as Postgres round(numeric, 2).
  const cents = Math.floor((2 * Math.abs(sum) * 100 + n) / (2 * n));
  return (Math.sign(sum) * cents) / 100 || 0;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32: small, fast, good enough to shuffle answer options.
function generator(state: number): () => number {
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates driven by the seed: the same seed always gives the same order.
export function deterministicShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  const random = generator(hashSeed(seed));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
