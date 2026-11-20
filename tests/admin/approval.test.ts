// Manual approval hardening (security P3, rule 34) and refunds.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { admin, makeHost } from "../db/helpers";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Actor } from "@/lib/events/access";
import { createEvent } from "@/features/host/lib/events";
import { createOrder } from "@/features/host/lib/orders";
import { approveOrder, listPendingOrders, orderRef, queryPendingOrders } from "@/features/admin/lib/orders";
import { createClaim } from "@/features/admin/lib/claims";
import { createEventOnBehalf } from "@/features/admin/lib/events";
import { createGrant } from "@/features/admin/lib/grants";
import { markOrderUnpaid } from "@/features/admin/lib/refunds";
import { auditRows, makeStaff, outcome } from "./helpers";

const db = admin as unknown as AdminClient;
const owner = (userId: string): Actor => ({ userId, kind: "owner", grantId: null });
const ref = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`.toUpperCase();

let approver: Awaited<ReturnType<typeof makeStaff>>;
let creator: Awaited<ReturnType<typeof makeStaff>>;
let claimMaker: Awaited<ReturnType<typeof makeStaff>>;
let granted: Awaited<ReturnType<typeof makeStaff>>;
let support: Awaited<ReturnType<typeof makeStaff>>;

async function hostWithOrder(plan: "essential" | "premium" = "essential") {
  const host = await makeHost("approve-host");
  const event = await createEvent(db, host.id, { kind: "wedding", templateId: "wedding-draft", name: "Nour & Ali", locale: "en" });
  const order = await createOrder(db, owner(host.id), event.id, plan);
  return { host, event, order };
}

// An order on an event held for a customer: created directly, as the holding
// account never signs in to order.
async function heldOrder() {
  const event = await createEventOnBehalf(db, creator.id, { kind: "wedding", templateId: "wedding-draft", name: "Held", locale: "en", email: "held@example.test" });
  const { data: e } = await admin.from("events").select("owner_id").eq("id", event.id).single();
  const { data: order } = await admin
    .from("orders")
    .insert({ event_id: event.id, user_id: e!.owner_id, plan_id: "essential", amount_egp: 350 })
    .select("id, amount_egp")
    .single();
  return { event, order: { id: order!.id, amountEgp: order!.amount_egp } };
}

beforeAll(async () => {
  approver = await makeStaff("approve-admin", "admin");
  creator = await makeStaff("approve-creator", "admin");
  claimMaker = await makeStaff("approve-claimer", "admin");
  granted = await makeStaff("approve-granted", "support");
  support = await makeStaff("approve-support", "support");
});

describe("queue search and pages", () => {
  it("finds an order by its short number, lists newest first and pages by 25", async () => {
    const { order } = await heldOrder();
    const found = await queryPendingOrders(db, approver.id, "en", "admin", { q: orderRef(order.id).toLowerCase() });
    expect(found.orders.map((o) => o.id)).toEqual([order.id]);
    expect(found.orders[0].planName).not.toBe("essential");
    const all = await queryPendingOrders(db, approver.id, "en", "admin", {});
    expect(all.orders.length).toBeLessThanOrEqual(25);
    const times = all.orders.map((o) => o.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    const awaiting = await queryPendingOrders(db, approver.id, "en", "admin", { filter: "reference" });
    expect(awaiting.orders.every((o) => o.references.length > 0)).toBe(true);
  });
});

describe("separation of duties", () => {
  it("the staff member who created the event on a customer's behalf cannot approve it", async () => {
    const { event, order } = await heldOrder();
    expect(await outcome(approveOrder(db, creator.id, { orderId: order.id, reference: ref("TRX"), amountEgp: 350 }))).toBe("self_approval");
    const queue = await listPendingOrders(db, creator.id, "en");
    expect(queue.find((o) => o.id === order.id)?.conflicted).toBe(true);
    expect((await listPendingOrders(db, approver.id, "en")).find((o) => o.id === order.id)?.conflicted).toBe(false);
    expect(await outcome(approveOrder(db, approver.id, { orderId: order.id, reference: ref("TRX"), amountEgp: 350 }))).toBe("resolved");
    const { data } = await admin.from("events").select("plan_id").eq("id", event.id).single();
    expect(data!.plan_id).toBe("essential");
  });

  it("whoever issued the claim link cannot approve it", async () => {
    const { event, order } = await heldOrder();
    await createClaim(db, claimMaker.id, event.id, "held@example.test");
    expect(await outcome(approveOrder(db, claimMaker.id, { orderId: order.id, reference: ref("TRX"), amountEgp: 350 }))).toBe("self_approval");
    expect((await listPendingOrders(db, claimMaker.id, "en")).find((o) => o.id === order.id)?.conflicted).toBe(true);
  });

  it("anyone who holds or held a grant on the event cannot approve it", async () => {
    const { event, order } = await hostWithOrder();
    // An admin with a past (revoked) grant row, and a support member with a live one.
    await admin.from("staff_grants").insert({
      event_id: event.id,
      staff_id: approver.id,
      capabilities: ["view"],
      created_by: creator.id,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      revoked_at: new Date().toISOString(),
    });
    await createGrant(db, creator.id, { eventId: event.id, staffId: granted.id, capabilities: ["view"], days: 1 });
    expect(await outcome(approveOrder(db, approver.id, { orderId: order.id, reference: ref("TRX"), amountEgp: order.amountEgp }))).toBe("self_approval");
    // Support never approves, involved or not.
    expect(await outcome(approveOrder(db, support.id, { orderId: order.id, reference: ref("TRX"), amountEgp: order.amountEgp }))).toBe("forbidden");
    // The grant's creator is not involved by that alone.
    expect(await outcome(approveOrder(db, creator.id, { orderId: order.id, reference: ref("TRX"), amountEgp: order.amountEgp }))).toBe("resolved");
  });

  it("a transfer reference pays for one order only", async () => {
    const first = await hostWithOrder();
    const second = await hostWithOrder();
    const reference = ref("DUP");
    expect(await outcome(approveOrder(db, approver.id, { orderId: first.order.id, reference, amountEgp: first.order.amountEgp }))).toBe("resolved");
    expect(await outcome(approveOrder(db, approver.id, { orderId: second.order.id, reference, amountEgp: second.order.amountEgp }))).toBe(
      "duplicate_reference",
    );
    const { data } = await admin.from("orders").select("status").eq("id", second.order.id).single();
    expect(data!.status).toBe("pending");
  });
});

describe("refunds and disputes", () => {
  it("remove the plan in the same step, admins only, audited", async () => {
    const { event, order } = await hostWithOrder("premium");
    await approveOrder(db, approver.id, { orderId: order.id, reference: ref("RF"), amountEgp: order.amountEgp });
    expect(await outcome(markOrderUnpaid(db, support.id, order.id, "refunded"))).toBe("forbidden");
    expect(await outcome(markOrderUnpaid(db, approver.id, order.id, "cancelled"))).toBe("invalid");

    const result = await markOrderUnpaid(db, approver.id, order.id, "refunded");
    expect(result).toEqual({ eventId: event.id, slug: event.slug });
    const [{ data: o }, { data: e }] = await Promise.all([
      admin.from("orders").select("status").eq("id", order.id).single(),
      admin.from("events").select("plan_id").eq("id", event.id).single(),
    ]);
    expect(o!.status).toBe("refunded");
    expect(e!.plan_id).toBeNull();
    expect(await outcome(markOrderUnpaid(db, approver.id, order.id, "refunded"))).toBe("not_paid");
    expect(await auditRows("order.refunded", { target: order.id })).toHaveLength(1);

    // The host can buy again afterwards.
    const again = await createOrder(db, owner((await admin.from("events").select("owner_id").eq("id", event.id).single()).data!.owner_id), event.id, "essential");
    expect(again.amountEgp).toBe(350);
  });

  it("a disputed order also loses its plan; a pending one cannot be refunded", async () => {
    const { event, order } = await hostWithOrder();
    expect(await outcome(markOrderUnpaid(db, approver.id, order.id, "disputed"))).toBe("not_paid");
    await approveOrder(db, approver.id, { orderId: order.id, reference: ref("DS"), amountEgp: order.amountEgp });
    await markOrderUnpaid(db, approver.id, order.id, "disputed");
    const { data: e } = await admin.from("events").select("plan_id").eq("id", event.id).single();
    expect(e!.plan_id).toBeNull();
    expect(await auditRows("order.disputed", { target: order.id })).toHaveLength(1);
  });
});
