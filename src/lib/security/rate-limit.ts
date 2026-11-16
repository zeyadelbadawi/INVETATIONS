import "server-only";
import { adminDb } from "@/lib/supabase/admin";

export type Limit = { windowSeconds: number; max: number };

// Postgres-backed fixed-window limiter. Keys identify a session, player,
// invitation or event; IP is used only before a session exists, with high
// ceilings, because a whole wedding hall shares one address.
export async function withinLimit(key: string, limit: Limit): Promise<boolean> {
  const { data, error } = await adminDb().rpc("rate_limit_hit", {
    p_key: key,
    p_window_seconds: limit.windowSeconds,
    p_max: limit.max,
  });
  if (error) throw new Error(`rate limiter unavailable: ${error.message}`);
  return data === true;
}

// Gives back one slot of the current window: for checks that reserve a slot
// before a slow comparison and count only failures (passcodes, sign-in).
export async function refundLimit(key: string, limit: Limit): Promise<void> {
  const { error } = await adminDb().rpc("rate_limit_refund", { p_key: key, p_window_seconds: limit.windowSeconds });
  if (error) throw new Error(`rate limiter unavailable: ${error.message}`);
}

export const limits = {
  sessionCreatePerIp: { windowSeconds: 60, max: 600 },
  sessionCreatePerCode: { windowSeconds: 60, max: 120 },
  guestWritePerSession: { windowSeconds: 60, max: 60 },
  // Joins and re-claims: per session first; the invitation ceiling is high so a
  // stranger with the open link cannot use it up for the whole hall.
  joinPerSession: { windowSeconds: 600, max: 10 },
  joinPerInvitation: { windowSeconds: 600, max: 1000 },
  claimPerTarget: { windowSeconds: 600, max: 20 },
  wallPerPlayer: { windowSeconds: 600, max: 12 },
  uploadPerPlayer: { windowSeconds: 3600, max: 20 },
  passcodePerEvent: { windowSeconds: 600, max: 60 },
  keeperPerCode: { windowSeconds: 600, max: 20 },
} satisfies Record<string, Limit>;
