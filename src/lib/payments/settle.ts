import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import type { VerifiedNotification } from "./provider";

export const CHECKOUT_ACTION = "order.checkout_started";

export type SettlePolicy = { integrationId: number; allowTestMode: boolean };

export type RejectReason =
  | "not_success"
  | "pending"
  | "voided"
  | "refunded"
  | "auth_only"
  | "error_occured"
  | "test_mode"
  | "wrong_integration"
  | "wrong_currency"
  | "unknown_order"
  | "unbound_checkout"
  | "wrong_amount"
  | "not_pending";

export type SettleOutcome = { outcome: "settled"; orderId: string; eventId: string } | { outcome: "duplicate" } | { outcome: "rejected"; reason: RejectReason };

function gate(n: VerifiedNotification, policy: SettlePolicy): RejectReason | null {
  if (!n.success) return "not_success";
  if (n.pending) return "pending";
  if (n.voided) return "voided";
  if (n.refunded) return "refunded";
  if (n.authOnly) return "auth_only";
  if (n.errorOccured) return "error_occured";
  if (!n.live && !policy.allowTestMode) return "test_mode";
  // integration_id is covered by the signature: a sandbox integration cannot pass.
  if (n.integrationId !== policy.integrationId) return "wrong_integration";
  if (n.currency !== "EGP") return "wrong_currency";
  return null;
}

async function alreadyRecorded(db: AdminClient, n: VerifiedNotification): Promise<boolean> {
  const { data } = await db.from("payments").select("id").eq("provider", n.provider).eq("provider_ref", n.providerRef).maybeSingle();
  return Boolean(data);
}

async function reject(n: VerifiedNotification, reason: RejectReason, eventId: string | null): Promise<SettleOutcome> {
  await audit({
    actorKind: "system",
    action: reason === "not_pending" ? "payment.unmatched" : "payment.rejected",
    eventId,
    target: n.providerRef,
    metadata: { provider: n.provider, reason, order_id: n.orderId, provider_order_id: n.providerOrderId, amount_minor: n.amountMinor, currency: n.currency },
  });
  return { outcome: "rejected", reason };
}

// Turns a VERIFIED gateway notification into a settlement, or refuses it.
// Idempotent: payments(provider, provider_ref) is unique and settle_order only
// moves a pending order whose amount equals the snapshot (security P1, rule 33).
export async function settleFromNotification(db: AdminClient, n: VerifiedNotification, policy: SettlePolicy): Promise<SettleOutcome> {
  if (await alreadyRecorded(db, n)) return { outcome: "duplicate" };

  const failed = gate(n, policy);
  if (failed) return reject(n, failed, null);

  if (!n.orderId) return reject(n, "unknown_order", null);
  const { data: order } = await db.from("orders").select("id, event_id, amount_egp, status").eq("id", n.orderId).maybeSingle();
  if (!order) return reject(n, "unknown_order", null);

  // Our reference is not covered by the gateway's signature, but the gateway's
  // order id is: it must be one we created for THIS order.
  const { data: bound } = await db
    .from("audit_log")
    .select("id")
    .eq("action", CHECKOUT_ACTION)
    .eq("event_id", order.event_id)
    .eq("target", order.id)
    .eq("metadata->>provider", n.provider)
    .eq("metadata->>provider_order_id", n.providerOrderId)
    .limit(1);
  if (!bound || bound.length === 0) return reject(n, "unbound_checkout", order.event_id);

  if (n.amountMinor !== order.amount_egp * 100) return reject(n, "wrong_amount", order.event_id);
  if (order.status !== "pending") return reject(n, "not_pending", order.event_id);

  const { data: settled, error } = await db.rpc("settle_order", {
    p_order_id: order.id,
    p_provider: n.provider,
    p_provider_ref: n.providerRef,
    p_amount_egp: order.amount_egp,
    // No staff approver and no receipt: the generated types do not mark them nullable.
    p_approved_by: null as unknown as string,
    p_receipt_media_id: null as unknown as string,
  });
  if (error) {
    // A concurrent delivery of the same transaction won the insert.
    if (error.code === "23505") return { outcome: "duplicate" };
    throw new Error(`settlement failed: ${error.message}`);
  }
  if (settled !== true) {
    if (await alreadyRecorded(db, n)) return { outcome: "duplicate" };
    return reject(n, "not_pending", order.event_id);
  }

  await audit({
    actorKind: "system",
    action: "order.paid",
    eventId: order.event_id,
    target: order.id,
    metadata: { provider: n.provider, provider_ref: n.providerRef, amount_egp: order.amount_egp },
  });
  return { outcome: "settled", orderId: order.id, eventId: order.event_id };
}
