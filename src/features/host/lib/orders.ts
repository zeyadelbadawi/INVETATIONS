import { z } from "zod";
import type { Actor } from "@/lib/events/access";
import type { AdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { auditActor, loadEventFor } from "./access";
import { HostError } from "./errors";

export const REFERENCE_ACTION = "order.reference_submitted";
const MAX_REFERENCES_PER_ORDER = 5;

export const referenceSchema = z
  .string()
  .trim()
  .min(4)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/);

export type OrderSummary = { id: string; planId: string; amountEgp: number; createdAt: string };

// Starts (or returns) the event's pending order. The amount is copied from the
// plan row here, on the server; the browser only names the plan (security P1).
export async function createOrder(db: AdminClient, actor: Actor, eventId: string, planId: unknown): Promise<OrderSummary> {
  const event = await loadEventFor(db, actor, eventId, { ownerOnly: true });
  if (event.plan_id) throw new HostError("already_paid");
  if (typeof planId !== "string" || !/^[a-z0-9_-]{1,40}$/.test(planId)) throw new HostError("plan_unavailable");

  const { data: plan } = await db
    .from("plans")
    .select("id, price_egp, active")
    .eq("id", planId)
    .maybeSingle();
  if (!plan || !plan.active) throw new HostError("plan_unavailable");

  const { data: existing } = await db
    .from("orders")
    .select("id, plan_id, amount_egp, status, created_at")
    .eq("event_id", event.id)
    .in("status", ["pending", "paid"]);
  if ((existing ?? []).some((o) => o.status === "paid")) throw new HostError("already_paid");

  const pending = (existing ?? []).filter((o) => o.status === "pending");
  const reusable = pending.find((o) => o.plan_id === plan.id && o.amount_egp === plan.price_egp);
  // One pending order per event: anything else that is still pending is closed.
  const stale = pending.filter((o) => o.id !== reusable?.id).map((o) => o.id);
  if (stale.length > 0) {
    const { error } = await db.from("orders").update({ status: "cancelled" }).in("id", stale).eq("status", "pending");
    if (error) throw new Error(`order cancel failed: ${error.message}`);
  }
  if (reusable) {
    return { id: reusable.id, planId: reusable.plan_id, amountEgp: reusable.amount_egp, createdAt: reusable.created_at };
  }

  const { data: order, error } = await db
    .from("orders")
    .insert({ event_id: event.id, user_id: actor.userId, plan_id: plan.id, amount_egp: plan.price_egp })
    .select("id, plan_id, amount_egp, created_at")
    .single();
  if (error || !order) throw new Error(`order insert failed: ${error?.message}`);

  await audit({
    ...auditActor(actor),
    action: "order.created",
    eventId: event.id,
    target: order.id,
    metadata: { plan_id: plan.id, amount_egp: plan.price_egp, replaced: stale },
  });
  return { id: order.id, planId: order.plan_id, amountEgp: order.amount_egp, createdAt: order.created_at };
}

// The host tells us which transfer is theirs. There is no column for it, so it
// is kept as an audit row that the staff queue reads.
export async function submitTransferReference(
  db: AdminClient,
  actor: Actor,
  eventId: string,
  rawReference: unknown,
): Promise<{ orderId: string; reference: string }> {
  const event = await loadEventFor(db, actor, eventId, { ownerOnly: true });
  const reference = referenceSchema.safeParse(rawReference);
  if (!reference.success) throw new HostError("invalid", { field: "reference" });

  const { data: order } = await db
    .from("orders")
    .select("id")
    .eq("event_id", event.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order) throw new HostError("no_pending_order");

  const previous = await submittedReferences(db, [event.id]);
  const forOrder = previous.filter((r) => r.orderId === order.id);
  if (forOrder.some((r) => r.reference === reference.data)) return { orderId: order.id, reference: reference.data };
  if (forOrder.length >= MAX_REFERENCES_PER_ORDER) throw new HostError("too_many_references");

  await audit({
    ...auditActor(actor),
    action: REFERENCE_ACTION,
    eventId: event.id,
    target: order.id,
    metadata: { order_id: order.id, reference: reference.data },
  });
  return { orderId: order.id, reference: reference.data };
}

export type SubmittedReference = { orderId: string; eventId: string; reference: string; at: string };

export async function submittedReferences(db: AdminClient, eventIds: string[]): Promise<SubmittedReference[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await db
    .from("audit_log")
    .select("event_id, metadata, created_at")
    .eq("action", REFERENCE_ACTION)
    .in("event_id", eventIds)
    .order("created_at");
  if (error) throw new Error(`reference lookup failed: ${error.message}`);
  const out: SubmittedReference[] = [];
  for (const row of data ?? []) {
    const meta = row.metadata as { order_id?: unknown; reference?: unknown } | null;
    // Stored text is re-checked on the way out; it is shown to staff.
    const reference = referenceSchema.safeParse(meta?.reference);
    if (row.event_id && typeof meta?.order_id === "string" && reference.success) {
      out.push({ orderId: meta.order_id, eventId: row.event_id, reference: reference.data, at: row.created_at });
    }
  }
  return out;
}

export type PaymentState = {
  planId: string | null;
  pending: (OrderSummary & { references: string[] }) | null;
};

// Orders have no row-level policy, so this runs on the service key after the
// caller has passed requireEventAccess.
export async function paymentState(db: AdminClient, actor: Actor, eventId: string): Promise<PaymentState> {
  const event = await loadEventFor(db, actor, eventId, { ownerOnly: true });
  const { data: order } = await db
    .from("orders")
    .select("id, plan_id, amount_egp, created_at")
    .eq("event_id", event.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order) return { planId: event.plan_id, pending: null };
  const references = (await submittedReferences(db, [event.id])).filter((r) => r.orderId === order.id).map((r) => r.reference);
  return {
    planId: event.plan_id,
    pending: { id: order.id, planId: order.plan_id, amountEgp: order.amount_egp, createdAt: order.created_at, references },
  };
}
