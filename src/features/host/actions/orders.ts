"use server";

import { refresh } from "next/cache";
import { requireEventAccess } from "@/lib/events/access";
import { adminDb } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/env";
import { paymobConfig, paymobEnabled } from "@/lib/payments/env";
import { paymobProvider } from "@/lib/payments/paymob";
import type { CardCheckoutError } from "../messages-payments";
import type { ActionResult } from "../lib/errors";
import * as orders from "../lib/orders";
import { run } from "../lib/run";

// The browser names a plan and nothing else: the price is read from the plan
// row on the server, and nothing here can mark an order paid.

export async function createOrderAction(eventId: string, planId: string): Promise<ActionResult> {
  return run("createOrder", async () => {
    const actor = await requireEventAccess(eventId, "publish");
    await orders.createOrder(adminDb(), actor, eventId, planId);
    refresh();
    return {};
  });
}

export async function submitReferenceAction(eventId: string, reference: string): Promise<ActionResult> {
  return run("submitReference", async () => {
    const actor = await requireEventAccess(eventId, "publish");
    await orders.submitTransferReference(adminDb(), actor, eventId, reference);
    refresh();
    return {};
  });
}

// Card checkout, only when the gateway flag is on. Returns the gateway's hosted
// page; the browser is sent there and comes back to the publish page, which
// only polls (the return grants nothing — security rule 33).
export async function startCardCheckoutAction(
  eventId: string,
  lang: string,
): Promise<{ ok: true; url: string } | { ok: false; error: CardCheckoutError }> {
  const config = paymobConfig();
  if (!config) return { ok: false, error: "card_unavailable" };
  const locale = lang === "en" ? "en" : "ar";
  const result = await run("startCardCheckout", async () => {
    const actor = await requireEventAccess(eventId, "publish");
    const origin = appOrigin();
    const session = await orders.startCardCheckout(
      adminDb(),
      actor,
      eventId,
      paymobProvider(config),
      {
        returnUrl: `${origin}/${locale}/app/events/${eventId}/publish?payment=card`,
        notifyUrl: `${origin}/api/webhooks/payments`,
      },
      locale,
    );
    return { url: session.redirectUrl };
  });
  if (result.ok) return { ok: true, url: result.url };
  if (result.error === "no_pending_order" || result.error === "already_paid" || result.error === "forbidden" || result.error === "unauthenticated") {
    return { ok: false, error: result.error };
  }
  return { ok: false, error: "card_failed" };
}

export async function orderStatusAction(eventId: string): Promise<ActionResult<orders.OrderStatus>> {
  return run("orderStatus", async () => {
    const actor = await requireEventAccess(eventId, "publish");
    return orders.orderStatus(adminDb(), actor, eventId);
  });
}

// Whether the card button is shown. The flag is server-side configuration.
export async function cardCheckoutAvailableAction(): Promise<boolean> {
  return paymobEnabled();
}
