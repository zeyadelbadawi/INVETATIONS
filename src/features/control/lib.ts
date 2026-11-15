import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/events/access";
import { refreshScores } from "@/lib/guest/scores";
import { normaliseName } from "@/lib/security/names";

// Host-side controls over guests and the wall. Callers authorise first
// (requireEventAccess) and pass the resulting actor.

const actorKind = (actor: Actor) => (actor.kind === "staff" ? "staff" : "host");

// Hosts and moderators can show or hide a post. A staff takedown cannot be undone here (security A7).
export async function setPostStatus(eventId: string, actor: Actor, postId: string, status: "visible" | "hidden"): Promise<boolean> {
  const { data, error } = await adminDb()
    .from("wall_posts")
    .update({ status })
    .eq("event_id", eventId)
    .eq("id", postId)
    .is("removed_by_staff_at", null)
    .select("id");
  if (error) throw new Error(`moderation failed: ${error.message}`);
  if (!data || data.length === 0) return false;
  await audit({ actorId: actor.userId, actorKind: actorKind(actor), action: `wall.${status}`, eventId, target: postId, grantId: actor.grantId });
  return true;
}

export async function setPlayerApproved(eventId: string, actor: Actor, playerId: string, approved: boolean): Promise<boolean> {
  const { data, error } = await adminDb()
    .from("players")
    .update({ approved })
    .eq("event_id", eventId)
    .eq("id", playerId)
    .select("id");
  if (error) throw new Error(`approval failed: ${error.message}`);
  if (!data || data.length === 0) return false;
  await refreshScores(eventId);
  await audit({ actorId: actor.userId, actorKind: actorKind(actor), action: approved ? "player.approved" : "player.unapproved", eventId, target: playerId, grantId: actor.grantId });
  return true;
}

// Removing a player ends their sessions, hides their posts and frees their place.
export async function removePlayer(eventId: string, actor: Actor, playerId: string): Promise<boolean> {
  const db = adminDb();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("players")
    .update({ removed_at: now })
    .eq("event_id", eventId)
    .eq("id", playerId)
    .is("removed_at", null)
    .select("id");
  if (error) throw new Error(`remove failed: ${error.message}`);
  if (!data || data.length === 0) return false;
  await db.from("guest_sessions").update({ revoked_at: now }).eq("event_id", eventId).eq("player_id", playerId).is("revoked_at", null);
  await db.from("wall_posts").update({ status: "hidden" }).eq("event_id", eventId).eq("player_id", playerId);
  await refreshScores(eventId);
  await audit({ actorId: actor.userId, actorKind: actorKind(actor), action: "player.removed", eventId, target: playerId, grantId: actor.grantId });
  return true;
}

export async function renamePlayer(eventId: string, actor: Actor, playerId: string, name: string): Promise<boolean> {
  const clean = normaliseName(name);
  if (clean.length < 2) return false;
  const { data, error } = await adminDb().from("players").update({ name: clean }).eq("event_id", eventId).eq("id", playerId).select("id");
  if (error) throw new Error(`rename failed: ${error.message}`);
  if (!data || data.length === 0) return false;
  await audit({ actorId: actor.userId, actorKind: actorKind(actor), action: "player.renamed", eventId, target: playerId, grantId: actor.grantId });
  return true;
}

// Revoking an invitation kills its link and every session opened from it.
export async function revokeInvitationSessions(eventId: string, invitationId: string): Promise<void> {
  await adminDb()
    .from("guest_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("invitation_id", invitationId)
    .is("revoked_at", null);
}

// Staff takedown: hidden for everyone and not reversible by the host.
export async function staffTakedown(staffId: string, postId: string): Promise<boolean> {
  const { data, error } = await adminDb()
    .from("wall_posts")
    .update({ removed_by_staff_at: new Date().toISOString(), status: "hidden" })
    .eq("id", postId)
    .select("event_id");
  if (error) throw new Error(`takedown failed: ${error.message}`);
  if (!data || data.length === 0) return false;
  await audit({ actorId: staffId, actorKind: "staff", action: "wall.takedown", eventId: data[0].event_id, target: postId });
  return true;
}
