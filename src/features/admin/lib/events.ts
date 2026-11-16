import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { AdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { createEvent, createEventSchema } from "@/features/host/lib/events";
import { HostError } from "@/features/host/lib/errors";
import { eventName } from "@/features/host/lib/display";
import { AdminError } from "./errors";

// Back-office view of events: search, summary and "made on behalf of" a
// customer who has no account yet (technical design §4, security A4).

// Holding accounts own events staff build for customers without an account,
// until the customer claims them. They can never sign in (banned for ~100
// years, random password, undeliverable .invalid address). They are created
// only here, with the service key, and recorded by id in the server-only
// `holding_accounts` table. They are never looked up by email: anyone can sign
// up with any address, so an email proves nothing (review F1). Before an
// account is used it is re-checked with the auth server: app_metadata (which
// only the service key can write) must say `holding` and the ban must hold.
const HOLDING_DOMAIN = "no-reply.invalid";
const MAX_HOLDING_ACCOUNTS = 50;

export function holdingEmail(tag: string): string {
  return `holding-${tag}@${HOLDING_DOMAIN}`;
}

// A recorded holding account that the auth server still reports as a banned
// server-made account. Anything else is refused.
export async function isHoldingAccount(db: AdminClient, userId: string | null | undefined): Promise<boolean> {
  if (typeof userId !== "string" || !z.uuid().safeParse(userId).success) return false;
  const { data: row } = await db.from("holding_accounts").select("user_id").eq("user_id", userId).maybeSingle();
  if (!row) return false;
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) return false;
  const banned = data.user.banned_until ? new Date(data.user.banned_until).getTime() > Date.now() : false;
  return data.user.app_metadata?.holding === true && banned;
}

// Which of these users are recorded holding accounts (for display only).
async function holdingIds(db: AdminClient, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data } = await db.from("holding_accounts").select("user_id").in("user_id", ids);
  return new Set((data ?? []).map((r) => r.user_id));
}

async function createHolding(db: AdminClient): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email: holdingEmail(randomBytes(9).toString("hex")),
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    ban_duration: "876000h",
    app_metadata: { holding: true },
  });
  if (!data?.user) throw new Error(`holding account unavailable: ${error?.code ?? "unknown"}`);
  const { error: recordError } = await db.from("holding_accounts").insert({ user_id: data.user.id });
  if (recordError) {
    await db.auth.admin.deleteUser(data.user.id);
    throw new Error(`holding account not recorded: ${recordError.message}`);
  }
  return data.user.id;
}

// The holding accounts to try, oldest first, then a fresh one while there is room.
async function* holdingAccounts(db: AdminClient): AsyncGenerator<string> {
  const { data: rows, error } = await db
    .from("holding_accounts")
    .select("user_id")
    .order("created_at")
    .order("user_id")
    .limit(MAX_HOLDING_ACCOUNTS);
  if (error) throw new Error(`holding lookup failed: ${error.message}`);
  for (const row of rows ?? []) {
    if (await isHoldingAccount(db, row.user_id)) yield row.user_id;
  }
  if ((rows ?? []).length < MAX_HOLDING_ACCOUNTS) yield await createHolding(db);
}

export type MaskRole = "admin" | "support" | "designer" | string;

// Support sees only the domain of a customer's email; admins see it in full.
export function maskEmail(email: string | null | undefined, role: MaskRole): string {
  if (!email) return "—";
  if (role === "admin") return email;
  const at = email.lastIndexOf("@");
  return at < 0 ? "•••" : `•••${email.slice(at)}`;
}

export type EventHit = {
  id: string;
  slug: string;
  kind: string;
  status: string;
  planId: string | null;
  createdAt: string;
  ownerEmail: string;
  holding: boolean;
};

export async function searchEvents(db: AdminClient, query: unknown, role: MaskRole): Promise<EventHit[]> {
  const q = typeof query === "string" ? query.trim().slice(0, 320) : "";
  if (q.length < 3) return [];
  const { data, error } = await db.rpc("staff_find_events", { p_query: q, p_limit: 50 });
  if (error) throw new Error(`event search failed: ${error.message}`);
  const rows = data ?? [];
  const holding = await holdingIds(db, [...new Set(rows.map((row) => row.owner_id))]);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    status: row.status,
    planId: row.plan_id,
    createdAt: row.created_at,
    ownerEmail: maskEmail(row.owner_email, role),
    holding: holding.has(row.owner_id),
  }));
}

export type OrderRow = { id: string; status: string; planId: string; amountEgp: number; createdAt: string; paidAt: string | null };
export type ClaimRow = { id: string; email: string; createdAt: string; expiresAt: string; claimedAt: string | null; status: "open" | "claimed" | "expired" };

export type EventSummary = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  status: string;
  planId: string | null;
  createdAt: string;
  ownerEmail: string;
  holding: boolean;
  orders: OrderRow[];
  claims: ClaimRow[];
};

export async function eventSummary(db: AdminClient, eventId: string, role: MaskRole, locale: "ar" | "en"): Promise<EventSummary | null> {
  if (!z.uuid().safeParse(eventId).success) return null;
  const { data: event } = await db
    .from("events")
    .select("id, slug, kind, status, plan_id, created_at, owner_id, content")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return null;
  const [{ data: emails }, { data: orders }, { data: claims }, { data: now }, holding] = await Promise.all([
    db.rpc("staff_user_emails", { p_ids: [event.owner_id] }),
    db.from("orders").select("id, status, plan_id, amount_egp, created_at, paid_at").eq("event_id", event.id).order("created_at", { ascending: false }).limit(50),
    db
      .from("event_claims")
      .select("id, email_lower, created_at, expires_at, claimed_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false })
      .limit(20),
    db.rpc("db_now"),
    holdingIds(db, [event.owner_id]),
  ]);
  const ownerEmail = emails?.[0]?.email ?? null;
  const clock = typeof now === "string" ? new Date(now).getTime() : Date.now();
  return {
    id: event.id,
    slug: event.slug,
    // Draft content is schema-parsed before it is shown to staff (security C1).
    name: eventName(event.content, locale, event.slug),
    kind: event.kind,
    status: event.status,
    planId: event.plan_id,
    createdAt: event.created_at,
    ownerEmail: maskEmail(ownerEmail, role),
    holding: holding.has(event.owner_id),
    orders: (orders ?? []).map((o) => ({ id: o.id, status: o.status, planId: o.plan_id, amountEgp: o.amount_egp, createdAt: o.created_at, paidAt: o.paid_at })),
    claims: (claims ?? []).map((c) => ({
      id: c.id,
      email: maskEmail(c.email_lower, role),
      createdAt: c.created_at,
      expiresAt: c.expires_at,
      claimedAt: c.claimed_at,
      status: c.claimed_at ? "claimed" : new Date(c.expires_at).getTime() > clock ? "open" : "expired",
    })),
  };
}

export const onBehalfSchema = createEventSchema.extend({ email: z.email().max(320) });

// Admin creates an event for a customer who has no account yet. It is owned by
// a holding account until the customer claims it (see claims.ts). The creator
// is recorded so they can never approve its payment (security rule 34).
export async function createEventOnBehalf(db: AdminClient, adminId: string, raw: unknown): Promise<{ id: string; slug: string }> {
  const { data: role } = await db.from("staff_roles").select("role").eq("user_id", adminId).maybeSingle();
  if (role?.role !== "admin") throw new AdminError("forbidden");
  const parsed = onBehalfSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError("invalid");
  const { email, ...input } = parsed.data;

  for await (const holdingId of holdingAccounts(db)) {
    try {
      const event = await createEvent(db, holdingId, input);
      await audit({
        actorId: adminId,
        actorKind: "staff",
        action: "event.created_on_behalf",
        eventId: event.id,
        target: event.id,
        metadata: { customer_email_domain: email.slice(email.lastIndexOf("@") + 1).toLowerCase() },
      });
      return { id: event.id, slug: event.slug };
    } catch (error) {
      if (error instanceof HostError && error.code === "too_many_events") continue;
      if (error instanceof HostError) throw new AdminError("invalid");
      throw error;
    }
  }
  throw new AdminError("holding_full");
}
