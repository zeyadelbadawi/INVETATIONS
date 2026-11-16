import { revalidateTag } from "next/cache";
import { eventTag } from "@/lib/events/published";
import { paymobConfig } from "@/lib/payments/env";
import { paymobProvider } from "@/lib/payments/paymob";
import { settleFromNotification } from "@/lib/payments/settle";
import { adminDb } from "@/lib/supabase/admin";

const headers = { "Cache-Control": "no-store" };

// Gateway notifications (security rule 33). Only a delivery whose signature
// verifies is looked at; settlement re-checks success, live mode, integration,
// amount and currency against OUR order snapshot and is idempotent on
// payments(provider, provider_ref). Nothing from the request body is logged.
//
// Responses: 404 while the gateway is switched off; 401 for a bad signature;
// 200 for every verified delivery, settled or refused (a refusal is final and
// audited, so the gateway should not retry it); 500 only for our own failure,
// so the gateway retries.
export async function POST(request: Request) {
  const config = paymobConfig();
  if (!config) return new Response("Not found", { status: 404, headers });

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 200_000) return new Response("Payload too large", { status: 413, headers });
  const rawBody = await request.text();
  const query = new URL(request.url).searchParams;

  const notification = paymobProvider(config).verifyWebhook({ rawBody, query });
  if (!notification) return new Response("Unauthorized", { status: 401, headers });

  try {
    const db = adminDb();
    const result = await settleFromNotification(db, notification, {
      integrationId: config.integrationId,
      allowTestMode: config.allowTestMode,
    });
    if (result.outcome === "settled") {
      // Entitlements on a live page come from the plan; refresh it if published.
      const { data: event } = await db.from("events").select("slug").eq("id", result.eventId).maybeSingle();
      if (event) revalidateTag(eventTag(event.slug), "max");
    }
    return Response.json({ received: true }, { status: 200, headers });
  } catch (error) {
    console.error(`[webhook] payment settlement failed: ${error instanceof Error ? error.name : "unknown error"}`);
    return new Response("Error", { status: 500, headers });
  }
}

export function GET() {
  return new Response("Method not allowed", { status: 405, headers: { ...headers, Allow: "POST" } });
}
