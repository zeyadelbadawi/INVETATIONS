import { z } from "zod";
import type { AdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { HostError } from "@/features/host/lib/errors";
import { eventName } from "@/features/host/lib/display";
import { referenceSchema, submittedReferences } from "@/features/host/lib/orders";

export type PendingOrder = {
  id: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  planId: string;
  amountEgp: number;
  createdAt: string;
  references: { reference: string; at: string }[];
  // The signed-in staff member owns this event or holds a grant on it, so they may not approve it.
  conflicted: boolean;
};

async function hasConflict(db: AdminClient, staffId: string, eventId: string, ownerId: string, buyerId: string) {
  if (ownerId === staffId || buyerId === staffId) return true;
  // Any grant on the event counts, live or not: the approver must be uninvolved (security rule 34).
  const { count } = await db
    .from("staff_grants")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("staff_id", staffId);
  return (count ?? 0) > 0;
}

// The queue. Shows no guest data and no phone numbers.
export async function listPendingOrders(db: AdminClient, staffId: string, locale: "ar" | "en"): Promise<PendingOrder[]> {
  const { data: orders, error } = await db
    .from("orders")
    .select("id, event_id, user_id, plan_id, amount_egp, created_at")
    .eq("status", "pending")
    .order("created_at")
    .limit(200);
  if (error) throw new Error(`order queue failed: ${error.message}`);
  if (!orders || orders.length === 0) return [];

  const eventIds = [...new Set(orders.map((o) => o.event_id))];
  const [{ data: events }, references, { data: grants }] = await Promise.all([
    db.from("events").select("id, slug, owner_id, content").in("id", eventIds),
    submittedReferences(db, eventIds),
    db.from("staff_grants").select("event_id").eq("staff_id", staffId).in("event_id", eventIds),
  ]);
  const byId = new Map((events ?? []).map((e) => [e.id, e]));
  const granted = new Set((grants ?? []).map((g) => g.event_id));

  return orders.map((order) => {
    const event = byId.get(order.event_id);
    return {
      id: order.id,
      eventId: order.event_id,
      // Draft content is schema-parsed before it is shown to staff (security C1).
      eventName: event ? eventName(event.content, locale, event.slug) : order.event_id,
      eventSlug: event?.slug ?? "",
      planId: order.plan_id,
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
