import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { releaseIfDue } from "@/lib/reveal/service";
import type { PublicEvent } from "@/lib/events/published";

// Public-safe by construction: phase, times, team ids and numbers. Never names
// (security rule 39). The same object is served to every visitor.
export type LivePayload = {
  v: number;
  status: PublicEvent["status"];
  phase: "idle" | "countdown" | "revealed";
  revealAt: string | null;
  answer: ("boy" | "girl")[] | null;
  scores: { teamId: string; score: number; players: number }[];
};

export async function readLive(event: PublicEvent): Promise<LivePayload> {
  const db = adminDb();
  let { data: live } = await db.from("live_state").select("phase, public_payload, version").eq("event_id", event.id).maybeSingle();

  const payload = (live?.public_payload ?? {}) as { revealAt?: string; answer?: ("boy" | "girl")[] };
  if (live?.phase === "countdown" && payload.revealAt && new Date(payload.revealAt).getTime() <= Date.now() + 1500) {
    // Close to (or past) zero by this server's clock: let the database decide.
    await releaseIfDue(event.id);
    ({ data: live } = await db.from("live_state").select("phase, public_payload, version").eq("event_id", event.id).maybeSingle());
  }

  const current = (live?.public_payload ?? {}) as { revealAt?: string; answer?: ("boy" | "girl")[] };
  const { data: scores } = await db.from("team_scores").select("team_id, score, active_players").eq("event_id", event.id);

  // Gated events expose only phase and time until the passcode is given.
  const gated = event.hasPasscode;
  return {
    v: live?.version ?? 0,
    status: event.status,
    phase: (live?.phase ?? "idle") as LivePayload["phase"],
    revealAt: current.revealAt ?? null,
    answer: live?.phase === "revealed" && !gated ? (current.answer ?? null) : null,
    scores: gated ? [] : (scores ?? []).map((s) => ({ teamId: s.team_id, score: Number(s.score), players: s.active_players })),
  };
}
