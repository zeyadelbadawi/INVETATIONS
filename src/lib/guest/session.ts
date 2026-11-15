import "server-only";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/env";
import { hashForDb, newSessionToken } from "@/lib/security/tokens";
import type { PublicEvent } from "@/lib/events/published";

// Server-side guest sessions (security S1). The cookie holds an opaque token;
// only its hash is stored, and every request re-checks revocation.

export type GuestContext = {
  sessionId: string;
  eventId: string;
  invitation: {
    id: string;
    kind: "personal" | "group" | "open";
    label: string;
    paxCap: number;
    maxPlayers: number;
    sideTeamId: string | null;
    locale: "ar" | "en" | null;
  };
  player: { id: string; name: string; teamId: string | null; approved: boolean; teamSwitchedAt: string | null } | null;
};

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

// __Host- cookies require HTTPS; browsers treat localhost as secure, so the same
// name works in development.
export function sessionCookieName(eventId: string): string {
  return `__Host-g_${eventId.replace(/-/g, "").slice(0, 10)}`;
}

function expiryFor(event: Pick<PublicEvent, "endsAt" | "startsAt">): Date {
  const anchor = event.endsAt ?? event.startsAt;
  const base = anchor ? Math.max(new Date(anchor).getTime(), Date.now()) : Date.now() + 150 * 24 * 3600 * 1000;
  return new Date(base + THIRTY_DAYS);
}

export type StartResult =
  | { ok: true; locale: "ar" | "en" | null; switched: boolean }
  | { ok: false; reason: "not_found" | "needs_confirmation"; currentLabel?: string };

// Exchanges a link code for a session. If this browser already holds a session
// for the event under a different invitation, nothing changes unless `confirm`
// is set (security S4).
export async function startSession(event: PublicEvent, code: string, confirm: boolean): Promise<StartResult> {
  const db = adminDb();
  const { data: invitation } = await db
    .from("invitations")
    .select("id, locale, opened_at, revoked_at")
    .eq("event_id", event.id)
    .eq("code_hash", hashForDb(code))
    .maybeSingle();
  if (!invitation || invitation.revoked_at) return { ok: false, reason: "not_found" };

  const existing = await currentSession(event.id);
  if (existing) {
    if (existing.invitation.id === invitation.id) {
      return { ok: true, locale: existing.invitation.locale, switched: false };
    }
    if (!confirm) return { ok: false, reason: "needs_confirmation", currentLabel: existing.invitation.label };
    await db.from("guest_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", existing.sessionId);
  }

  const token = newSessionToken();
  const expires = expiryFor(event);
  const { error } = await db.from("guest_sessions").insert({
    token_hash: hashForDb(token),
    event_id: event.id,
    invitation_id: invitation.id,
    expires_at: expires.toISOString(),
  });
  if (error) throw new Error(`session insert failed: ${error.message}`);

  if (!invitation.opened_at) {
    await db.from("invitations").update({ opened_at: new Date().toISOString() }).eq("id", invitation.id).is("opened_at", null);
  }

  const store = await cookies();
  store.set(sessionCookieName(event.id), token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
  return { ok: true, locale: invitation.locale as "ar" | "en" | null, switched: existing !== null };
}

export async function currentSession(eventId: string): Promise<GuestContext | null> {
  const store = await cookies();
  const token = store.get(sessionCookieName(eventId))?.value;
  if (!token || token.length > 64) return null;

  const db = adminDb();
  const { data: session } = await db
    .from("guest_sessions")
    .select("id, event_id, invitation_id, player_id, expires_at, revoked_at, last_seen_at")
    .eq("token_hash", hashForDb(token))
    .maybeSingle();
  if (!session || session.event_id !== eventId || session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: invitation } = await db
    .from("invitations")
    .select("id, kind, label, pax_cap, max_players, side_team_id, locale, revoked_at")
    .eq("event_id", eventId)
    .eq("id", session.invitation_id)
    .maybeSingle();
  if (!invitation || invitation.revoked_at) return null;

  let player: GuestContext["player"] = null;
  if (session.player_id) {
    const { data: p } = await db
      .from("players")
      .select("id, name, team_id, approved, removed_at, team_switched_at")
      .eq("event_id", eventId)
      .eq("id", session.player_id)
      .maybeSingle();
    // A removed player loses the session entirely.
    if (p?.removed_at) return null;
    if (p) player = { id: p.id, name: p.name, teamId: p.team_id, approved: p.approved, teamSwitchedAt: p.team_switched_at };
  }

  if (Date.now() - new Date(session.last_seen_at).getTime() > 5 * 60 * 1000) {
    await db.from("guest_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);
  }

  return {
    sessionId: session.id,
    eventId,
    invitation: {
      id: invitation.id,
      kind: invitation.kind as GuestContext["invitation"]["kind"],
      label: invitation.label,
      paxCap: invitation.pax_cap,
      maxPlayers: invitation.max_players,
      sideTeamId: invitation.side_team_id,
      locale: invitation.locale as "ar" | "en" | null,
    },
    player,
  };
}

export async function attachPlayer(sessionId: string, eventId: string, playerId: string): Promise<void> {
  const { error } = await adminDb()
    .from("guest_sessions")
    .update({ player_id: playerId })
    .eq("id", sessionId)
    .eq("event_id", eventId);
  if (error) throw new Error(`attach player failed: ${error.message}`);
}

export function isSecureOrigin(): boolean {
  const origin = new URL(appOrigin());
  return origin.protocol === "https:" || origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
}
