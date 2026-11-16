import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { AdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { eventName } from "@/features/host/lib/display";
import { AdminError } from "./errors";
import { dbNow } from "./grants";
import { isHoldingEmail } from "./events";

// Claim links hand an event built by staff (owned by a holding account) to the
// customer (security A4). The token is 128 random bits, travels only in the
// URL fragment, is stored only as SHA-256, is single-use, expires after 7 days
// on database time, and works only for a signed-in account whose VERIFIED
// email equals the one the admin entered.

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function newClaimToken(): string {
  return randomBytes(16).toString("base64url");
}

export function claimTokenHash(token: string): string {
  return `\\x${createHash("sha256").update(token).digest("hex")}`;
}

export type ClaimIdentity = { userId: string; email: string | null | undefined; emailConfirmed: boolean };

function verifiedEmail(who: ClaimIdentity): string {
  if (typeof who.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(who.userId)) throw new AdminError("unauthenticated");
  if (!who.emailConfirmed || !who.email) throw new AdminError("email_unverified");
  return who.email.trim().toLowerCase();
}

function tokenOrFail(raw: unknown): string {
  if (typeof raw !== "string" || !TOKEN.test(raw)) throw new AdminError("claim_unavailable");
  return raw;
}

export async function createClaim(db: AdminClient, adminId: string, eventId: unknown, email: unknown): Promise<{ claimId: string; token: string }> {
  const { data: role } = await db.from("staff_roles").select("role").eq("user_id", adminId).maybeSingle();
  if (role?.role !== "admin") throw new AdminError("forbidden");
  const id = z.uuid().safeParse(eventId);
  const mail = z.email().max(320).safeParse(typeof email === "string" ? email.trim() : email);
  if (!id.success || !mail.success) throw new AdminError("invalid");
  const emailLower = mail.data.toLowerCase();

  const { data: event } = await db.from("events").select("id, owner_id").eq("id", id.data).maybeSingle();
  if (!event) throw new AdminError("not_found");
  // Only events still held for a customer can be handed over: a claim link must
  // never move an event away from a real customer's account.
  const { data: owner } = await db.rpc("staff_user_emails", { p_ids: [event.owner_id] });
  if (!isHoldingEmail(owner?.[0]?.email)) throw new AdminError("forbidden");

  // One live link per event: earlier unclaimed links stop working.
  const now = await dbNow(db);
  await db.from("event_claims").update({ expires_at: now.toISOString() }).eq("event_id", event.id).is("claimed_at", null).gt("expires_at", "now");

  const token = newClaimToken();
  const { data: claim, error } = await db
    .from("event_claims")
    .insert({ event_id: event.id, email_lower: emailLower, token_hash: claimTokenHash(token), created_by: adminId })
    .select("id")
    .single();
  if (error || !claim) throw new Error(`claim insert failed: ${error?.message}`);

  await audit({
    actorId: adminId,
    actorKind: "staff",
    action: "claim.created",
    eventId: event.id,
    target: claim.id,
    metadata: { email_domain: emailLower.slice(emailLower.lastIndexOf("@") + 1) },
  });
  return { claimId: claim.id, token };
}

export type ClaimPreview = { eventName: string };

// Shown before the customer confirms. Reveals the event's name only to the
// account the link was made for.
export async function previewClaim(db: AdminClient, who: ClaimIdentity, rawToken: unknown, locale: "ar" | "en"): Promise<ClaimPreview> {
  const email = verifiedEmail(who);
  const token = tokenOrFail(rawToken);
  const { data: claim } = await db
    .from("event_claims")
    .select("event_id, email_lower, claimed_at, expires_at")
    .eq("token_hash", claimTokenHash(token))
    .maybeSingle();
  if (!claim || claim.claimed_at) throw new AdminError("claim_unavailable");
  if (claim.email_lower !== email) throw new AdminError("claim_wrong_email");
  const now = await dbNow(db);
  if (new Date(claim.expires_at).getTime() <= now.getTime()) throw new AdminError("claim_unavailable");
  const { data: event } = await db.from("events").select("slug, content").eq("id", claim.event_id).maybeSingle();
  if (!event) throw new AdminError("claim_unavailable");
  return { eventName: eventName(event.content, locale, event.slug) };
}

// The transfer is one database statement guarded by "not claimed", "not
// expired" (database time) and the verified email, so of two concurrent
// attempts exactly one moves the event.
export async function acceptClaim(db: AdminClient, who: ClaimIdentity, rawToken: unknown): Promise<{ eventId: string }> {
  const email = verifiedEmail(who);
  const token = tokenOrFail(rawToken);
  const hash = claimTokenHash(token);
  const { data, error } = await db.rpc("claim_event", { p_token_hash: hash, p_user_id: who.userId, p_email_lower: email });
  if (error) throw new Error(`claim failed: ${error.message}`);
  const row = data?.[0];
  if (!row) {
    const { data: claim } = await db.from("event_claims").select("email_lower, claimed_at").eq("token_hash", hash).maybeSingle();
    if (claim && !claim.claimed_at && claim.email_lower !== email) throw new AdminError("claim_wrong_email");
    throw new AdminError("claim_unavailable");
  }
  await audit({
    actorId: who.userId,
    actorKind: "host",
    action: "claim.accepted",
    eventId: row.event_id,
    target: row.claim_id,
    metadata: { previous_owner: row.previous_owner },
  });
  return { eventId: row.event_id };
}
