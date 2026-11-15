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

export const limits = {
  sessionCreatePerIp: { windowSeconds: 60, max: 600 },
  sessionCreatePerCode: { windowSeconds: 60, max: 120 },
  guestWritePerSession: { windowSeconds: 60, max: 60 },
  joinPerInvitation: { windowSeconds: 600, max: 80 },
  wallPerPlayer: { windowSeconds: 600, max: 12 },
  uploadPerPlayer: { windowSeconds: 3600, max: 20 },
  passcodePerEvent: { windowSeconds: 600, max: 60 },
  keeperPerCode: { windowSeconds: 600, max: 20 },
} satisfies Record<string, Limit>;
