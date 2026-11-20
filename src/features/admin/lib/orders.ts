import { z } from "zod";
import type { AdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { inBatches } from "@/lib/db/batch";
import { HostError } from "@/features/host/lib/errors";
import { eventName } from "@/features/host/lib/display";
import { referenceSchema, submittedReferences } from "@/features/host/lib/orders";
import { latinDigits } from "@/features/host/lib/text";
import { maskEmail } from "./events";

export type PendingOrder = {
  id: string;
  // The short number the customer sees on their Publish page.
  ref: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  ownerEmail: string;
  planId: string;
  planName: string;
  amountEgp: number;
  createdAt: string;
  references: { reference: string; at: string }[];
  // The signed-in staff member owns this event or holds a grant on it, so they may not approve it.
  conflicted: boolean;
};

// The approver must be uninvolved with the event (security rule 34): not its
// owner or buyer, not the staff member who created it on a customer's behalf,
// not anyone who holds or ever held a grant on it, and not whoever issued its
// claim link.
export async function hasConflict(db: AdminClient, staffId: string, eventId: string, ownerId: string, buyerId: string) {
  if (ownerId === staffId || buyerId === staffId) return true;
  const [grants, claims, created] = await Promise.all([
    db.from("staff_grants").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("staff_id", staffId),
    db.from("event_claims").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("created_by", staffId),
    db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("actor_id", staffId)
      .eq("action", "event.created_on_behalf"),
  ]);
  if (grants.error || claims.error || created.error) throw new Error("conflict check failed");
  return (grants.count ?? 0) + (claims.count ?? 0) + (created.count ?? 0) > 0;
}

async function involvedEvents(db: AdminClient, staffId: string, eventIds: string[]): Promise<Set<string>> {
  const [grants, claims, created] = await Promise.all([
    inBatches(eventIds, (ids) => db.from("staff_grants").select("event_id").eq("staff_id", staffId).in("event_id", ids), "grant lookup"),
    inBatches(eventIds, (ids) => db.from("event_claims").select("event_id").eq("created_by", staffId).in("event_id", ids), "claim lookup"),
    inBatches(
      eventIds,
      (ids) => db.from("audit_log").select("event_id").eq("actor_id", staffId).eq("action", "event.created_on_behalf").in("event_id", ids),
      "creator lookup",
    ),
  ]);
  const out = new Set<string>();
  for (const row of [...grants, ...claims, ...created]) if (row.event_id) out.add(row.event_id);
  return out;
}

const MAX_QUEUE = 1000;

export function orderRef(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

// The queue, newest first. Shows no guest data and no phone numbers; owner
// emails are masked for support (security A3).
export async function listPendingOrders(db: AdminClient, staffId: string, locale: "ar" | "en", role: string = "support"): Promise<PendingOrder[]> {
  const { data: orders, error } = await db
    .from("orders")
    .select("id, event_id, user_id, plan_id, amount_egp, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(MAX_QUEUE);
  if (error) throw new Error(`order queue failed: ${error.message}`);
  if (!orders || orders.length === 0) return [];

  const eventIds = [...new Set(orders.map((o) => o.event_id))];
  const [events, references, granted, { data: plans }] = await Promise.all([
    inBatches(eventIds, (ids) => db.from("events").select("id, slug, owner_id, content").in("id", ids), "event lookup"),
    submittedReferences(db, eventIds),
    involvedEvents(db, staffId, eventIds),
    db.from("plans").select("id, name_ar, name_en"),
  ]);
  const byId = new Map(events.map((e) => [e.id, e]));
  const ownerIds = [...new Set(events.map((e) => e.owner_id))];
  const { data: emails } = ownerIds.length > 0 ? await db.rpc("staff_user_emails", { p_ids: ownerIds }) : { data: [] };
  const emailOf = new Map((emails ?? []).map((row) => [row.id, row.email]));
  const planName = new Map((plans ?? []).map((plan) => [plan.id, locale === "ar" ? plan.name_ar : plan.name_en]));

  return orders.map((order) => {
    const event = byId.get(order.event_id);
    return {
      id: order.id,
      ref: orderRef(order.id),
      eventId: order.event_id,
      // Draft content is schema-parsed before it is shown to staff (security C1).
      eventName: event ? eventName(event.content, locale, event.slug) : order.event_id,
      eventSlug: event?.slug ?? "",
      ownerEmail: maskEmail(event ? emailOf.get(event.owner_id) : null, role),
      planId: order.plan_id,
      planName: planName.get(order.plan_id) ?? order.plan_id,
      amountEgp: order.amount_egp,
      createdAt: order.created_at,
      references: references.filter((r) => r.orderId === order.id).map((r) => ({ reference: r.reference, at: r.at })),
      conflicted: event?.owner_id === staffId || order.user_id === staffId || granted.has(order.event_id),
    };
  });
}

export const approveSchema = z.object({
  orderId: z.uuid(),
  reference: referenceSchema,
  amountEgp: z.number().int().min(0).max(10_000_000),
});

// Manual settlement (security rule 34): an admin who is not involved with the
// event confirms the transfer reference and the amount seen on the statement.
// The database function re-checks status and amount and grants the plan in one
// transaction.
export async function approveOrder(db: AdminClient, staffId: string, raw: unknown): Promise<{ eventId: string }> {
  const { data: role } = await db.from("staff_roles").select("role").eq("user_id", staffId).maybeSingle();
  if (role?.role !== "admin") throw new HostError("forbidden");

  const parsed = approveSchema.safeParse(raw);
  if (!parsed.success) throw new HostError("invalid");
  const input = parsed.data;

  const { data: order } = await db
    .from("orders")
    .select("id, event_id, user_id, plan_id, amount_egp, status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (!order) throw new HostError("not_found");
  const { data: event } = await db.from("events").select("id, owner_id").eq("id", order.event_id).maybeSingle();
  if (!event) throw new HostError("not_found");

  if (await hasConflict(db, staffId, event.id, event.owner_id, order.user_id)) throw new HostError("self_approval");
  if (order.status !== "pending") throw new HostError("not_pending");
  if (order.amount_egp !== input.amountEgp) throw new HostError("amount_mismatch");

  // A transfer reference pays for one order only. The unique index on
  // payments(provider, provider_ref) is the guarantee; this check gives the
  // friendly answer first, and also refuses a reference used with any provider.
  const { count: used } = await db.from("payments").select("id", { count: "exact", head: true }).eq("provider_ref", input.reference);
  if ((used ?? 0) > 0) throw new HostError("duplicate_reference");

  const { data: settled, error } = await db.rpc("settle_order", {
    p_order_id: order.id,
    p_provider: "manual",
    p_provider_ref: input.reference,
    p_amount_egp: input.amountEgp,
    p_approved_by: staffId,
    // No receipt upload yet; the generated type does not mark the argument nullable.
    p_receipt_media_id: null as unknown as string,
  });
  if (error) {
    // The same transfer reference cannot pay for two orders.
    if (error.code === "23505") throw new HostError("duplicate_reference");
    throw new Error(`settlement failed: ${error.message}`);
  }
  if (settled !== true) throw new HostError("not_pending");

  await audit({
    actorId: staffId,
    actorKind: "staff",
    action: "order.approved",
    eventId: event.id,
    target: order.id,
    metadata: { plan_id: order.plan_id, amount_egp: input.amountEgp, provider: "manual", reference: input.reference },
  });
  return { eventId: event.id };
}

export const QUEUE_PAGE_SIZE = 25;
export type QueueFilter = "all" | "reference" | "awaiting";
export type QueuePage = { orders: PendingOrder[]; total: number; page: number; pages: number; waiting: number };

// One page of the queue, after search and filter. Search matches the order
// number, a transfer reference, the event name or link, and (for admins, whose
// view is unmasked) the owner's email.
export async function queryPendingOrders(
  db: AdminClient,
  staffId: string,
  locale: "ar" | "en",
  role: string,
  options: { q?: string; filter?: QueueFilter; page?: number },
): Promise<QueuePage> {
  const all = await listPendingOrders(db, staffId, locale, role);
  const q = latinDigits(options.q ?? "").trim().toLowerCase().slice(0, 120);
  const filter = options.filter ?? "all";
  const matches = all.filter((order) => {
    if (filter === "reference" && order.references.length === 0) return false;
    if (filter === "awaiting" && order.references.length > 0) return false;
    if (q === "") return true;
    const haystack = [order.ref, order.eventName, order.eventSlug, ...order.references.map((r) => r.reference), role === "admin" ? order.ownerEmail : ""];
    return haystack.some((value) => value.toLowerCase().includes(q));
  });
  const pages = Math.max(1, Math.ceil(matches.length / QUEUE_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pages);
  return {
    orders: matches.slice((page - 1) * QUEUE_PAGE_SIZE, page * QUEUE_PAGE_SIZE),
    total: matches.length,
    page,
    pages,
    waiting: all.filter((order) => order.references.length > 0).length,
  };
}

// Plan ids ("essential", "premium") as the plan names customers see.
export async function planNames(db: AdminClient, locale: "ar" | "en"): Promise<Map<string, string>> {
  const { data } = await db.from("plans").select("id, name_ar, name_en");
  return new Map((data ?? []).map((plan) => [plan.id, locale === "ar" ? plan.name_ar : plan.name_en]));
}
