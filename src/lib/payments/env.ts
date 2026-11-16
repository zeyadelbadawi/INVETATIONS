import "server-only";
import { z } from "zod";

// Card gateway settings. Kept apart from src/lib/env.ts so the rest of the app
// starts without them: the gateway is off unless PAYMOB_ENABLED=1, and only
// then are the keys required (and validated) — a half-configured gateway fails
// loudly instead of half-working.

const enabledSchema = z.object({
  PAYMOB_ENABLED: z.literal("1"),
  PAYMOB_SECRET_KEY: z.string().min(16),
  PAYMOB_PUBLIC_KEY: z.string().min(8),
  PAYMOB_HMAC_SECRET: z.string().min(16),
  PAYMOB_INTEGRATION_ID: z.coerce.number().int().positive(),
  // Optional overrides. Defaults are Paymob Egypt's hosts (see paymob.ts for
  // which parts were verified against the official docs).
  PAYMOB_API_BASE: z.url().default("https://accept.paymob.com"),
  PAYMOB_CHECKOUT_BASE: z.url().default("https://eg.checkout.paymob.com"),
  // Accept test-mode transactions (is_live = false). Ignored in production builds.
  PAYMOB_ALLOW_TEST_MODE: z.enum(["", "0", "1"]).default(""),
});

export type PaymobConfig = {
  secretKey: string;
  publicKey: string;
  hmacSecret: string;
  integrationId: number;
  apiBase: string;
  checkoutBase: string;
  allowTestMode: boolean;
};

let cached: PaymobConfig | null | undefined;

export function paymobEnabled(): boolean {
  return process.env.PAYMOB_ENABLED === "1";
}

// Null when the gateway is switched off.
export function paymobConfig(): PaymobConfig | null {
  if (cached !== undefined) return cached;
  if (!paymobEnabled()) {
    cached = null;
    return cached;
  }
  const parsed = enabledSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid payment environment variables: ${names}`);
  }
  const e = parsed.data;
  cached = {
    secretKey: e.PAYMOB_SECRET_KEY,
    publicKey: e.PAYMOB_PUBLIC_KEY,
    hmacSecret: e.PAYMOB_HMAC_SECRET,
    integrationId: e.PAYMOB_INTEGRATION_ID,
    apiBase: new URL(e.PAYMOB_API_BASE).origin,
    checkoutBase: new URL(e.PAYMOB_CHECKOUT_BASE).origin,
    allowTestMode: e.PAYMOB_ALLOW_TEST_MODE === "1" && process.env.NODE_ENV !== "production",
  };
  return cached;
}

// Tests only.
export function resetPaymobConfigForTests(): void {
  cached = undefined;
}
