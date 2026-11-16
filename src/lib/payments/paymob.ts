import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PaymobConfig } from "./env";
import type { CheckoutRequest, CheckoutSession, PaymentProvider, VerifiedNotification, WebhookInput } from "./provider";

// Paymob (Egypt) hosted checkout: Intention API + Unified Checkout, and the
// "Transaction Processed Callback" webhook.
//
// Checked against Paymob's official developer docs on 2026-11-16:
//  - Create Intention: POST, header `Authorization: Token <secret key>`, body
//    fields amount (in cents), currency, payment_methods (integration ids or
//    names), items (name, amount), billing_data (phone_number required),
//    special_reference ("returned in the transaction callback under
//    merchant_order_id"), notification_url (receives the POST with full
//    transaction details), redirection_url, expiration, extras; 201 response
//    carries client_secret, id, intention_order_id ("Paymob order ID, which
//    will be received in the transaction callback").
//    https://developers.paymob.com/paymob-docs/developers/intention-apis/create-intention
//    https://developers.paymob.com/paymob-docs/developers/intention-apis/update-intention
//  - Unified Checkout redirect (Egypt):
//    https://eg.checkout.paymob.com/?publicKey={public_key}&clientSecret={client_secret}
//    https://developers.paymob.com/paymob-docs/developers/checkout-experiences/unified-checkout-redirection
//  - Callback body: JSON { type: "TRANSACTION", obj: { id, success, pending,
//    amount_cents, currency, is_live, is_refunded, is_voided, integration_id,
//    order: { id, merchant_order_id, ... }, source_data: { type, pan, sub_type } ... } }
//    https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/transaction-callbacks
//  - HMAC: SHA-512 keyed with the HMAC secret over the concatenation (no
//    separator) of these values in this order, sent as the `hmac` query
//    parameter:
//    https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback
//    https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac
//
// UNVERIFIED (not stated in the official pages; confirm with a sandbox
// delivery before switching the flag on in production):
//  - The intention host. The official reference leaves the base URL blank;
//    `https://accept.paymob.com/v1/intention/` is the commonly documented
//    Egypt host. Overridable with PAYMOB_API_BASE.
//  - The HMAC digest encoding (we compare lowercase hex; the doc's sample is hex)
//    and how null values are written into the string (we write "").
//    Booleans are written "true"/"false" as in the doc's sample string.
//  - That the POST processed callback carries `hmac` in the query string (the
//    HMAC page says every callback does; the callback page does not repeat it).
//  - The unit of `expiration` (we send seconds) and the billing_data fields
//    besides phone_number (we send "NA" for what we do not collect).

export const HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

function pick(obj: Record<string, unknown>, path: string): unknown {
  let value: unknown = obj;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "string") return String(value);
  return "";
}

export function hmacString(obj: Record<string, unknown>): string {
  return HMAC_FIELDS.map((field) => asText(pick(obj, field))).join("");
}

export function paymobHmac(obj: Record<string, unknown>, secret: string): string {
  return createHmac("sha512", secret).update(hmacString(obj), "utf8").digest("hex");
}

// Constant-time comparison of two hex digests.
export function hmacMatches(expectedHex: string, receivedHex: string | null): boolean {
  if (!receivedHex) return false;
  const received = receivedHex.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(received)) return false;
  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const REFERENCE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_[0-9a-f]{12}$/;

// special_reference must be unique per intention, and a host may retry a
// checkout for the same order, so a random suffix follows our order id.
export function newReference(orderId: string): string {
  return `${orderId}_${randomBytes(6).toString("hex")}`;
}

export function orderIdFromReference(reference: unknown): string | null {
  if (typeof reference !== "string") return null;
  const match = REFERENCE.exec(reference.toLowerCase());
  return match ? match[1] : null;
}

const bool = (value: unknown) => value === true;

export function verifyPaymobCallback(input: WebhookInput, hmacSecret: string): VerifiedNotification | null {
  if (input.rawBody.length === 0 || input.rawBody.length > 200_000) return null;
  let body: unknown;
  try {
    body = JSON.parse(input.rawBody);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const { type, obj } = body as { type?: unknown; obj?: unknown };
  if (type !== "TRANSACTION" || !obj || typeof obj !== "object") return null;
  const tx = obj as Record<string, unknown>;

  if (!hmacMatches(paymobHmac(tx, hmacSecret), input.query.get("hmac"))) return null;

  const id = tx.id;
  const orderId = pick(tx, "order.id");
  const amount = tx.amount_cents;
  const integration = tx.integration_id;
  if ((typeof id !== "number" && typeof id !== "string") || String(id).length === 0) return null;
  if ((typeof orderId !== "number" && typeof orderId !== "string") || String(orderId).length === 0) return null;
  if (typeof amount !== "number" || !Number.isInteger(amount)) return null;
  if (typeof integration !== "number" && typeof integration !== "string") return null;

  return {
    provider: "paymob",
    providerRef: String(id),
    providerOrderId: String(orderId),
    orderId: orderIdFromReference(pick(tx, "order.merchant_order_id")),
    amountMinor: amount,
    currency: typeof tx.currency === "string" ? tx.currency : "",
    success: bool(tx.success),
    pending: tx.pending !== false,
    voided: tx.is_voided !== false,
    refunded: tx.is_refunded !== false,
    authOnly: bool(tx.is_auth),
    errorOccured: tx.error_occured !== false,
    live: bool(tx.is_live),
    integrationId: Number(integration),
  };
}

type IntentionResponse = { client_secret?: unknown; intention_order_id?: unknown; id?: unknown };

export function paymobProvider(config: PaymobConfig, fetcher: typeof fetch = fetch): PaymentProvider {
  return {
    id: "paymob",

    async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
      const reference = newReference(request.orderId);
      const cents = request.amountEgp * 100;
      const response = await fetcher(`${config.apiBase}/v1/intention/`, {
        method: "POST",
        headers: { Authorization: `Token ${config.secretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: cents,
          currency: "EGP",
          payment_methods: [config.integrationId],
          items: [{ name: request.itemName.slice(0, 50), amount: cents, quantity: 1, description: request.itemName.slice(0, 50) }],
          billing_data: {
            first_name: "NA",
            last_name: "NA",
            email: request.customerEmail,
            phone_number: "NA",
            apartment: "NA",
            floor: "NA",
            street: "NA",
            building: "NA",
            city: "NA",
            country: "EG",
            state: "NA",
          },
          special_reference: reference,
          notification_url: request.notifyUrl,
          redirection_url: request.returnUrl,
          expiration: 3600,
          extras: { order_id: request.orderId },
        }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (response.status !== 201 && response.status !== 200) {
        // The body may echo customer data; only the status is reported.
        throw new Error(`paymob intention failed with status ${response.status}`);
      }
      const data = (await response.json()) as IntentionResponse;
      const clientSecret = typeof data.client_secret === "string" ? data.client_secret : null;
      const providerOrderId =
        typeof data.intention_order_id === "number" || typeof data.intention_order_id === "string" ? String(data.intention_order_id) : null;
      if (!clientSecret || !providerOrderId) throw new Error("paymob intention response incomplete");

      const url = new URL("/", config.checkoutBase);
      url.searchParams.set("publicKey", config.publicKey);
      url.searchParams.set("clientSecret", clientSecret);
      return { redirectUrl: url.toString(), providerOrderId, reference };
    },

    verifyWebhook(input: WebhookInput) {
      return verifyPaymobCallback(input, config.hmacSecret);
    },
  };
}
