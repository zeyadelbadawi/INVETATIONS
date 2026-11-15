"use server";

import "server-only";
import { z } from "zod";
import { requireEventAccess, requireStaff } from "@/lib/events/access";
import { addStarterGames, saveGame, setGameState, setTruth, settleGame } from "@/features/control/games";
import { removePlayer, renamePlayer, setPlayerApproved, setPostStatus, staffTakedown } from "@/features/control/lib";
import { cancelReveal, issueKeeperLink, startReveal } from "@/lib/reveal/service";
import { adminDb } from "@/lib/supabase/admin";
import { entitlementsSchema } from "@/lib/events/published";

const id = z.uuid();

export async function moderatePost(eventId: string, postId: string, status: "visible" | "hidden") {
  const actor = await requireEventAccess(id.parse(eventId), "moderate");
  return setPostStatus(eventId, actor, id.parse(postId), z.enum(["visible", "hidden"]).parse(status));
}

export async function approvePlayer(eventId: string, playerId: string, approved: boolean) {
  const actor = await requireEventAccess(id.parse(eventId), "manage_invitations");
  return setPlayerApproved(eventId, actor, id.parse(playerId), z.boolean().parse(approved));
}

export async function kickPlayer(eventId: string, playerId: string) {
  const actor = await requireEventAccess(id.parse(eventId), "manage_invitations");
  return removePlayer(eventId, actor, id.parse(playerId));
}

export async function changePlayerName(eventId: string, playerId: string, name: string) {
  const actor = await requireEventAccess(id.parse(eventId), "manage_invitations");
  return renamePlayer(eventId, actor, id.parse(playerId), z.string().max(80).parse(name));
}

async function revealAllowed(eventId: string): Promise<boolean> {
  const db = adminDb();
  const { data: event } = await db.from("events").select("kind, plan_id, status").eq("id", eventId).maybeSingle();
  if (!event || event.kind !== "gender_reveal" || event.status !== "published" || !event.plan_id) return false;
  const { data: plan } = await db.from("plans").select("entitlements").eq("id", event.plan_id).maybeSingle();
  const parsed = entitlementsSchema.safeParse(plan?.entitlements);
  return parsed.success && parsed.data.reveal;
}

// Only the owner controls the reveal: "manage_reveal" is never granted to
// moderators or staff (security rule 28).
export async function createKeeperLink(eventId: string): Promise<{ code: string } | { error: "not_allowed" | "locked" }> {
  const actor = await requireEventAccess(id.parse(eventId), "manage_reveal");
  if (!(await revealAllowed(eventId))) return { error: "not_allowed" };
  const code = await issueKeeperLink(eventId, actor.userId);
  return code ? { code } : { error: "locked" };
}

export async function beginReveal(eventId: string, leadSeconds: number): Promise<{ revealAt: string } | { error: "not_allowed" | "not_sealed" }> {
  const actor = await requireEventAccess(id.parse(eventId), "manage_reveal");
  if (!(await revealAllowed(eventId))) return { error: "not_allowed" };
  const revealAt = await startReveal(eventId, actor.userId, z.number().int().min(60).max(86400 * 60).parse(leadSeconds));
  return revealAt ? { revealAt } : { error: "not_sealed" };
}

export async function abortReveal(eventId: string): Promise<boolean> {
  const actor = await requireEventAccess(id.parse(eventId), "manage_reveal");
  return cancelReveal(eventId, actor.userId);
}

export async function takedownPost(postId: string): Promise<boolean> {
  const staff = await requireStaff(["admin", "support"]);
  return staffTakedown(staff.userId, id.parse(postId));
}

// --- Games -----------------------------------------------------------------


const occasionOf = { wedding: "wedding", gender_reveal: "gender_reveal", corporate: "corporate" } as const;

export async function seedGames(eventId: string) {
  const actor = await requireEventAccess(id.parse(eventId), "manage_play");
  const { data: event } = await adminDb().from("events").select("kind").eq("id", eventId).maybeSingle();
  if (!event || !(event.kind in occasionOf)) return 0;
  return addStarterGames(eventId, actor, occasionOf[event.kind as keyof typeof occasionOf]);
}

export async function upsertGame(eventId: string, input: { id?: string; kind: string; config: unknown }) {
  const actor = await requireEventAccess(id.parse(eventId), "manage_play");
  const parsed = z.object({ id: id.optional(), kind: z.string().max(20), config: z.unknown() }).parse(input);
  return saveGame(eventId, actor, parsed);
}

// Correct answers are entered by the owner only; staff working on a grant never see or set them.
export async function saveGameTruth(eventId: string, gameId: string, truth: unknown) {
  await requireEventAccess(id.parse(eventId), "publish");
  return setTruth(eventId, id.parse(gameId), truth);
}

export async function changeGameState(eventId: string, gameId: string, state: "hidden" | "open" | "closed") {
  const actor = await requireEventAccess(id.parse(eventId), "manage_play");
  return setGameState(eventId, actor, id.parse(gameId), z.enum(["hidden", "open", "closed"]).parse(state));
}

export async function settle(eventId: string, gameId: string) {
  const actor = await requireEventAccess(id.parse(eventId), "publish");
  return settleGame(eventId, actor, id.parse(gameId));
}
