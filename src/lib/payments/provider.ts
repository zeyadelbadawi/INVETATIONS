// The gateway contract. A provider creates a hosted checkout for one of OUR
// orders and turns a webhook delivery into a verified notification. It never
// decides that an order is paid: settlement (src/lib/payments/settle.ts)
// re-checks the notification against the order snapshot and settles through
// the settle_order database function (security P1, rule 33).

export type CheckoutRequest = {
  orderId: string;
  amountEgp: number;
  itemName: string;
  customerEmail: string;
  // Where the browser lands afterwards. It grants nothing.
  returnUrl: string;
  // Where the gateway posts the server-to-server notification.
  notifyUrl: string;
};

export type CheckoutSession = {
  redirectUrl: string;
  // The gateway's own order id for this checkout; bound to our order and
  // checked on the webhook (it is covered by the signature, our reference is not).
  providerOrderId: string;
  // Our reference as sent to the gateway (carries our order id).
  reference: string;
};

export type VerifiedNotification = {
  provider: "paymob";
  // Unique per gateway transaction: payments(provider, provider_ref).
  providerRef: string;
  providerOrderId: string;
  // Our order id, read from the reference we sent.
  orderId: string | null;
  amountMinor: number;
  currency: string;
  success: boolean;
  pending: boolean;
  voided: boolean;
  refunded: boolean;
  authOnly: boolean;
  errorOccured: boolean;
  live: boolean;
  integrationId: number;
};

export type WebhookInput = {
  rawBody: string;
  query: URLSearchParams;
};

export interface PaymentProvider {
  readonly id: "paymob";
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  // Null when the signature does not verify or the body is not a transaction.
  verifyWebhook(input: WebhookInput): VerifiedNotification | null;
}
