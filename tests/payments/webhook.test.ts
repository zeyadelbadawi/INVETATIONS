// Card gateway (security P2, rule 33; phase 6 gate): forged, replayed,
// wrong-amount, wrong-currency, pending, voided, refunded, test-mode and
// unknown-order notifications are refused; a valid one settles once.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The route refreshes the cached invitation; outside a Next server there is no cache.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { randomBytes, randomInt } from "node:crypto";
import { admin, makeHost } from "../db/helpers";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Actor } from "@/lib/events/access";
import { createEvent } from "@/features/host/lib/events";
import { createOrder, orderStatus, startCardCheckout } from "@/features/host/lib/orders";
import { resetPaymobConfigForTests } from "@/lib/payments/env";
import { hmacString, orderIdFromReference, paymobHmac, paymobProvider } from "@/lib/payments/paymob";
import type { CheckoutRequest, PaymentProvider } from "@/lib/payments/provider";
import { POST } from "@/app/api/webhooks/payments/route";

const db = admin as unknown as AdminClient;
const owner = (userId: string): Actor => ({ userId, kind: "owner", grantId: null });

const SECRET = `hmac-${randomBytes(16).toString("hex")}`;
const INTEGRATION = 4_097_558;
const ENV = {
  PAYMOB_ENABLED: "1",
  PAYMOB_SECRET_KEY: "egy_sk_test_0123456789abcdef",
  PAYMOB_PUBLIC_KEY: "egy_pk_test_0123456789",
  PAYMOB_HMAC_SECRET: SECRET,
  PAYMOB_INTEGRATION_ID: String(INTEGRATION),
  PAYMOB_ALLOW_TEST_MODE: "",
};
const saved: Record<string, string | undefined> = {};

function setEnv(values: Record<string, string>) {
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
  resetPaymobConfigForTests();
}

beforeAll(() => {
  for (const k of Object.keys(ENV)) saved[k] = process.env[k];
});
beforeEach(() => setEnv(ENV));
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetPaymobConfigForTests();
});

// A provider that records what it was asked and answers like Paymob would.
function fakeProvider(): PaymentProvider & { last: { request: CheckoutRequest; providerOrderId: string; reference: string } | null } {
  const fake = {
    id: "paymob" as const,
    last: null as { request: CheckoutRequest; providerOrderId: string; reference: string } | null,
    async createCheckout(request: CheckoutRequest) {
      const providerOrderId = String(randomInt(100_000_000, 999_999_999));
      const reference = `${request.orderId}_${randomBytes(6).toString("hex")}`;
      fake.last = { request, providerOrderId, reference };
      return { redirectUrl: "https://eg.checkout.paymob.com/?publicKey=pk&clientSecret=cs", providerOrderId, reference };
    },
    verifyWebhook() {
      return null;
    },
  };
  return fake;
}

type Checkout = { eventId: string; orderId: string; amountEgp: number; providerOrderId: string; reference: string; hostId: string };

async function checkout(plan: "essential" | "premium" = "premium"): Promise<Checkout> {
  const host = await makeHost("pay-host");
  const event = await createEvent(db, host.id, { kind: "wedding", templateId: "wedding-draft", name: "Card Couple", locale: "en" });
  const order = await createOrder(db, owner(host.id), event.id, plan);
  const provider = fakeProvider();
  const result = await startCardCheckout(
    db,
    owner(host.id),
    event.id,
    provider,
    { returnUrl: "http://localhost:3000/en/app/events/x/publish?payment=card", notifyUrl: "http://localhost:3000/api/webhooks/payments" },
    "en",
  );
  expect(result.redirectUrl).toContain("clientSecret=");
  expect(provider.last!.request.amountEgp).toBe(order.amountEgp);
  return { eventId: event.id, orderId: order.id, amountEgp: order.amountEgp, providerOrderId: provider.last!.providerOrderId, reference: provider.last!.reference, hostId: host.id };
}

function transaction(c: Checkout, over: Record<string, unknown> = {}) {
  return {
    id: randomInt(100_000_000, 999_999_999),
    pending: false,
    amount_cents: c.amountEgp * 100,
    success: true,
    is_auth: false,
    is_capture: false,
    is_standalone_payment: true,
    is_voided: false,
    is_refunded: false,
    is_3d_secure: true,
    integration_id: INTEGRATION,
    profile_id: 164295,
    has_parent_transaction: false,
    order: { id: Number(c.providerOrderId), merchant_order_id: c.reference, amount_cents: c.amountEgp * 100, currency: "EGP" },
    created_at: "2026-11-16T11:33:44.592345",
    currency: "EGP",
    error_occured: false,
    is_live: true,
    owner: 302852,
    source_data: { type: "card", pan: "2346", sub_type: "MasterCard" },
    ...over,
  };
}

async function deliver(obj: Record<string, unknown>, opts: { secret?: string; hmac?: string; tamper?: (o: Record<string, unknown>) => void } = {}) {
  const signature = opts.hmac ?? paymobHmac(obj, opts.secret ?? SECRET);
  const body = structuredClone(obj);
  opts.tamper?.(body);
  const request = new Request(`http://localhost:3000/api/webhooks/payments?hmac=${signature}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "TRANSACTION", obj: body, issuer_bank: null }),
  });
  return POST(request);
}

async function state(c: Checkout) {
  const [{ data: order }, { data: event }, { data: payments }] = await Promise.all([
    admin.from("orders").select("status").eq("id", c.orderId).single(),
    admin.from("events").select("plan_id").eq("id", c.eventId).single(),
    admin.from("payments").select("provider, provider_ref, amount_egp").eq("order_id", c.orderId),
  ]);
  return { status: order!.status, plan: event!.plan_id, payments: payments ?? [] };
}

async function rejection(c: Checkout, providerRef: string) {
  const { data } = await admin.from("audit_log").select("action, metadata").eq("target", providerRef).in("action", ["payment.rejected", "payment.unmatched"]);
  return (data ?? []).map((r) => (r.metadata as { reason?: string }).reason);
}

describe("Paymob HMAC", () => {
  it("concatenates the documented fields in the documented order", () => {
    // The sample string on Paymob's HMAC page begins with these values.
    const obj = {
      amount_cents: 100000,
      created_at: "2024-06-13T11:33:44.592345",
      currency: "EGP",
      error_occured: false,
      has_parent_transaction: false,
      id: 192036465,
      integration_id: 4097558,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 217503754 },
      owner: 302852,
      pending: false,
      source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
      success: true,
    };
    expect(hmacString(obj).startsWith("1000002024-06-13T11:33:44.592345EGPfalsefalse1920364654097558truefalsefalsefalsetruefalse")).toBe(true);
    expect(hmacString(obj)).toBe(
      "1000002024-06-13T11:33:44.592345EGPfalsefalse1920364654097558truefalsefalsefalsetruefalse217503754302852false2346MasterCardcardtrue",
    );
    expect(paymobHmac(obj, "k")).toMatch(/^[0-9a-f]{128}$/);
  });

  it("reads our order id back from the reference only in our format", () => {
    const id = "0b6f6a43-6f43-4d8b-9b0b-6a7a0e0b9a11";
    expect(orderIdFromReference(`${id}_0123456789ab`)).toBe(id);
    expect(orderIdFromReference(id)).toBeNull();
    expect(orderIdFromReference(`${id}_0123456789ab'`)).toBeNull();
    expect(orderIdFromReference(null)).toBeNull();
  });
});

describe("hosted checkout request", () => {
  it("creates an intention with the order snapshot and returns the Unified Checkout URL", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response(JSON.stringify({ id: "pi_test", client_secret: "egy_csk_test_abc", intention_order_id: 123456789 }), { status: 201 });
    }) as typeof fetch;
    const provider = paymobProvider(
      { secretKey: "sk_live_x", publicKey: "pk_live_y", hmacSecret: SECRET, integrationId: INTEGRATION, apiBase: "https://accept.paymob.com", checkoutBase: "https://eg.checkout.paymob.com", allowTestMode: false },
      fetcher,
    );
    const orderId = "0b6f6a43-6f43-4d8b-9b0b-6a7a0e0b9a11";
    const session = await provider.createCheckout({
      orderId,
      amountEgp: 750,
      itemName: "Premium",
      customerEmail: "c@example.test",
      returnUrl: "https://app.example/en/app/events/e/publish?payment=card",
      notifyUrl: "https://app.example/api/webhooks/payments",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://accept.paymob.com/v1/intention/");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Token sk_live_x");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ amount: 75000, currency: "EGP", payment_methods: [INTEGRATION], notification_url: "https://app.example/api/webhooks/payments" });
    expect(orderIdFromReference(body.special_reference)).toBe(orderId);
    expect(session).toEqual({
      redirectUrl: "https://eg.checkout.paymob.com/?publicKey=pk_live_y&clientSecret=egy_csk_test_abc",
      providerOrderId: "123456789",
      reference: body.special_reference,
    });
  });

  it("fails without leaking the gateway's answer", async () => {
    const provider = paymobProvider(
      { secretKey: "s", publicKey: "p", hmacSecret: SECRET, integrationId: 1, apiBase: "https://accept.paymob.com", checkoutBase: "https://eg.checkout.paymob.com", allowTestMode: false },
      (async () => new Response('{"billing_data":{"phone_number":["This field is required."]}}', { status: 400 })) as typeof fetch,
    );
    await expect(
      provider.createCheckout({ orderId: "0b6f6a43-6f43-4d8b-9b0b-6a7a0e0b9a11", amountEgp: 1, itemName: "x", customerEmail: "a@b.c", returnUrl: "x", notifyUrl: "y" }),
    ).rejects.toThrow("paymob intention failed with status 400");
  });
});

describe("payment webhook", () => {
  it("settles a valid notification once; the return page alone grants nothing", async () => {
    const c = await checkout();
    expect(await orderStatus(db, owner(c.hostId), c.eventId)).toEqual({ paid: false, pending: true });

    const tx = transaction(c);
    const response = await deliver(tx);
    expect(response.status).toBe(200);
    const after = await state(c);
    expect(after.status).toBe("paid");
    expect(after.plan).toBe("premium");
    expect(after.payments).toEqual([{ provider: "paymob", provider_ref: String(tx.id), amount_egp: c.amountEgp }]);
    expect(await orderStatus(db, owner(c.hostId), c.eventId)).toEqual({ paid: true, pending: false });

    // Duplicate delivery: 200, nothing new.
    expect((await deliver(tx)).status).toBe(200);
    expect((await deliver(tx)).status).toBe(200);
    expect((await state(c)).payments).toHaveLength(1);
    const { count } = await admin.from("audit_log").select("id", { count: "exact", head: true }).eq("action", "order.paid").eq("target", c.orderId);
    expect(count).toBe(1);
  });

  it("concurrent duplicate deliveries settle once", async () => {
    const c = await checkout("essential");
    const tx = transaction(c);
    const responses = await Promise.all(Array.from({ length: 5 }, () => deliver(tx)));
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect((await state(c)).payments).toHaveLength(1);
    expect((await state(c)).status).toBe("paid");
  });

  it("refuses a forged or tampered signature with 401", async () => {
    const c = await checkout();
    const tx = transaction(c);
    expect((await deliver(tx, { secret: "not-the-secret-at-all" })).status).toBe(401);
    expect((await deliver(tx, { hmac: "" })).status).toBe(401);
    expect((await deliver(tx, { hmac: "00".repeat(64) })).status).toBe(401);
    expect((await deliver(tx, { hmac: "zz" })).status).toBe(401);
    // Signed for 1 EGP, body says the full amount.
    expect((await deliver({ ...tx, amount_cents: 100 }, { tamper: (o) => (o.amount_cents = c.amountEgp * 100) })).status).toBe(401);
    // Signed as pending, body flipped to settled.
    expect((await deliver({ ...tx, pending: true }, { tamper: (o) => (o.pending = false) })).status).toBe(401);
    const bad = new Request(`http://localhost:3000/api/webhooks/payments?hmac=${paymobHmac(tx, SECRET)}`, { method: "POST", body: "not json" });
    expect((await POST(bad)).status).toBe(401);
    expect((await state(c)).status).toBe("pending");
  });

  it("refuses replaying a settled transaction onto another order", async () => {
    const first = await checkout("essential");
    const second = await checkout("essential");
    const tx = transaction(first);
    expect((await deliver(tx)).status).toBe(200);
    // Same signed transaction, our (unsigned) reference swapped to the second order.
    const replay = await deliver(tx, { tamper: (o) => ((o.order as Record<string, unknown>).merchant_order_id = second.reference) });
    expect(replay.status).toBe(200);
    expect((await state(second)).status).toBe("pending");
    // A different signed transaction for the first checkout's gateway order, pointed at the second order.
    const crossed = transaction(first, { order: { id: Number(first.providerOrderId), merchant_order_id: second.reference } });
    expect((await deliver(crossed)).status).toBe(200);
    expect((await state(second)).status).toBe("pending");
    expect(await rejection(second, String(crossed.id))).toEqual(["unbound_checkout"]);
  });

  const refusals: [string, Record<string, unknown> | ((c: Checkout) => Record<string, unknown>), string][] = [
    ["wrong amount", (c) => ({ amount_cents: c.amountEgp * 100 - 100 }), "wrong_amount"],
    ["wrong currency", { currency: "USD" }, "wrong_currency"],
    ["pending", { pending: true }, "pending"],
    ["voided", { is_voided: true }, "voided"],
    ["refunded", { is_refunded: true }, "refunded"],
    ["declined", { success: false }, "not_success"],
    ["auth only", { is_auth: true }, "auth_only"],
    ["error", { error_occured: true }, "error_occured"],
    ["test mode", { is_live: false }, "test_mode"],
    ["other integration", { integration_id: 111 }, "wrong_integration"],
    ["unknown order", (c) => ({ order: { id: Number(c.providerOrderId), merchant_order_id: `${crypto.randomUUID()}_0123456789ab` } }), "unknown_order"],
    ["no reference", (c) => ({ order: { id: Number(c.providerOrderId), merchant_order_id: null } }), "unknown_order"],
    ["gateway order not ours", (c) => ({ order: { id: 1, merchant_order_id: c.reference } }), "unbound_checkout"],
  ];

  for (const [name, change, reason] of refusals) {
    it(`refuses a correctly signed ${name} notification`, async () => {
      const c = await checkout();
      const over = typeof change === "function" ? change(c) : change;
      const tx = transaction(c, over);
      expect((await deliver(tx)).status).toBe(200);
      const s = await state(c);
      expect(s.status).toBe("pending");
      expect(s.plan).toBeNull();
      expect(s.payments).toEqual([]);
      expect(await rejection(c, String(tx.id))).toEqual([reason]);
    });
  }

  it("accepts test mode only when allowed outside production", async () => {
    setEnv({ ...ENV, PAYMOB_ALLOW_TEST_MODE: "1" });
    const c = await checkout("essential");
    expect((await deliver(transaction(c, { is_live: false }))).status).toBe(200);
    expect((await state(c)).status).toBe("paid");
  });

  it("an order the host abandoned is not settled, and is flagged for staff", async () => {
    const c = await checkout("essential");
    await admin.from("orders").update({ status: "cancelled" }).eq("id", c.orderId);
    const tx = transaction(c);
    expect((await deliver(tx)).status).toBe(200);
    expect((await state(c)).payments).toEqual([]);
    expect(await rejection(c, String(tx.id))).toEqual(["not_pending"]);
  });

  it("does not exist while the flag is off", async () => {
    setEnv({ ...ENV, PAYMOB_ENABLED: "" });
    const c = await checkout();
    expect((await deliver(transaction(c))).status).toBe(404);
    expect((await state(c)).status).toBe("pending");
  });
});
