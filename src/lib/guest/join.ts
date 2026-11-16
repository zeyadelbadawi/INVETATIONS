import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { attachPlayer, type GuestContext } from "@/lib/guest/session";
import type { PublicEvent } from "@/lib/events/published";
import { getTemplate } from "@/templates/registry";
import { bytea, hmac, newRejoinCode, parseBytea, safeEqual } from "@/lib/security/tokens";
import { normaliseName } from "@/lib/security/names";
import { award, POINTS } from "@/lib/guest/scores";

export type JoinInput = { name: string; teamKey?: string };
export type JoinResult =
  | { ok: true; player: NonNullable<GuestContext["player"]>; rejoinCode: string | null }
  | { ok: false; reason: "invalid_name" | "full" | "bad_team" };

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

async function chooseTeam(event: PublicEvent, guest: GuestContext, teamKey: string | undefined): Promise<string | null | false> {
  const db = adminDb();
  const { data: teams } = await db.from("teams").select("id, key").eq("event_id", event.id).order("position");
  if (!teams || teams.length === 0) return null;

  const template = getTemplate(event.templateId, event.templateVersion);
  if (template?.teamJoin === "assigned" || event.settings.lockTeams) {
    if (guest.invitation.sideTeamId) return guest.invitation.sideTeamId;
    // Deal the player into the team with the fewest members.
    const { data: players } = await db.from("players").select("team_id").eq("event_id", event.id).is("removed_at", null);
    const counts = new Map<string, number>(teams.map((t) => [t.id, 0]));
    for (const p of players ?? []) if (p.team_id) counts.set(p.team_id, (counts.get(p.team_id) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
  }

  if (teamKey) {
    const picked = teams.find((t) => t.key === teamKey);
    return picked ? picked.id : false;
  }
  return guest.invitation.sideTeamId;
}

export async function joinAsNewPlayer(event: PublicEvent, guest: GuestContext, input: JoinInput): Promise<JoinResult> {
  const name = normaliseName(input.name);
  if (name.length < 2) return { ok: false, reason: "invalid_name" };

  const db = adminDb();
  const teamId = await chooseTeam(event, guest, input.teamKey);
  if (teamId === false) return { ok: false, reason: "bad_team" };

  // Walk-ins from the open link wait for the host when approval is on.
  const approved = !(guest.invitation.kind === "open" && event.settings.openLinkApproval);

  // One statement locks the invitation, counts its players and inserts only
  // under the cap, so parallel joins cannot overshoot it (review F9).
  const { data: rows, error } = await db.rpc("join_player", {
    p_event_id: event.id,
    p_invitation_id: guest.invitation.id,
    p_name: name,
    p_team_id: teamId as string,
    p_approved: approved,
  });
  if (error) throw new Error(`player insert failed: ${error.message}`);
  const row = rows?.[0];
  if (!row) return { ok: false, reason: "full" };

  // Household members re-claim by name; everyone else needs a code to come back
  // on another browser (security S2).
  let rejoinCode: string | null = null;
  if (guest.invitation.kind !== "personal") {
    rejoinCode = newRejoinCode();
    await db.from("player_secrets").insert({ player_id: row.id, rejoin_hmac: bytea(hmac(`rejoin:${row.id}`, rejoinCode)) });
  }

  await attachPlayer(guest.sessionId, event.id, row.id);
  const player = { id: row.id, name: row.name, teamId: row.team_id, approved: row.approved, teamSwitchedAt: row.team_switched_at };
  if (event.entitlements.games && approved) await award(event.id, player, "join", row.id, POINTS.join);
  return { ok: true, player, rejoinCode };
}

export type ClaimResult =
  | { ok: true; player: NonNullable<GuestContext["player"]> }
  | { ok: false; reason: "not_found" | "bad_code" | "locked" };

// Take over an existing player from another browser.
export async function claimPlayer(event: PublicEvent, guest: GuestContext, playerId: string, code: string | undefined): Promise<ClaimResult> {
  const db = adminDb();
  const { data: p } = await db
    .from("players")
    .select("id, name, team_id, approved, team_switched_at, removed_at, invitation_id")
    .eq("event_id", event.id)
    .eq("id", playerId)
    .maybeSingle();
  if (!p || p.removed_at || p.invitation_id !== guest.invitation.id) return { ok: false, reason: "not_found" };

  if (guest.invitation.kind !== "personal") {
    // The attempt is counted before the code is checked, in one statement, so
    // a burst of parallel guesses locks after MAX_FAILED like a slow one does
    // (review F2). 'last' means this attempt locks the player unless it is right.
    const { data: slot, error } = await db.rpc("rejoin_reserve", {
      p_player_id: p.id,
      p_max: MAX_FAILED,
      p_lock_seconds: LOCK_MINUTES * 60,
    });
    if (error) throw new Error(`rejoin check failed: ${error.message}`);
    if (slot === "not_found") return { ok: false, reason: "not_found" };
    if (slot !== "ok" && slot !== "last") return { ok: false, reason: "locked" };

    const { data: secret } = await db.from("player_secrets").select("rejoin_hmac").eq("player_id", p.id).maybeSingle();
    if (!secret) return { ok: false, reason: "not_found" };
    const expected = parseBytea(secret.rejoin_hmac as unknown as string);
    const given = hmac(`rejoin:${p.id}`, code ?? "");
    if (!code || !safeEqual(expected, given)) return { ok: false, reason: slot === "last" ? "locked" : "bad_code" };
    const { error: resetError } = await db.rpc("rejoin_success", { p_player_id: p.id });
    if (resetError) throw new Error(`rejoin reset failed: ${resetError.message}`);
  }

  await attachPlayer(guest.sessionId, event.id, p.id);
  return { ok: true, player: { id: p.id, name: p.name, teamId: p.team_id, approved: p.approved, teamSwitchedAt: p.team_switched_at } };
}
