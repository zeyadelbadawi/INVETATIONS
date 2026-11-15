"use server";

import { refresh } from "next/cache";
import { requireEventAccess } from "@/lib/events/access";
import { adminDb } from "@/lib/supabase/admin";
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
