import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import type { GuestContext } from "@/lib/guest/session";

// Adds a ledger row once per (player, reason, ref) and refreshes team totals.
// Returns the points actually awarded (0 when it was a repeat).
export async function award(
  eventId: string,
  player: NonNullable<GuestContext["player"]>,
  reason: string,
  ref: string,
  points: number,
): Promise<number> {
  if (points === 0) return 0;
  const db = adminDb();
  const { data, error } = await db
    .from("score_events")
    .upsert(
      { event_id: eventId, player_id: player.id, team_id: player.teamId, points, reason, ref },
      { onConflict: "player_id,reason,ref", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`score insert failed: ${error.message}`);
  if (!data || data.length === 0) return 0;
  await refreshScores(eventId);
  return points;
}

export async function refreshScores(eventId: string): Promise<void> {
  const { error } = await adminDb().rpc("recompute_team_scores", { p_event_id: eventId });
  if (error) throw new Error(`score recompute failed: ${error.message}`);
}

export const POINTS = { join: 5, rsvp: 5, wallPost: 3 } as const;
