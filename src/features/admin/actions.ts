"use server";

import { refresh } from "next/cache";
import { adminDb } from "@/lib/supabase/admin";
import type { ActionResult } from "@/features/host/lib/errors";
import { run } from "@/features/host/lib/run";
import { approveOrder } from "./lib/orders";
import { requireStaffSession } from "./lib/session";

// Approval is for admins only; support can read the queue but not settle.
export async function approveOrderAction(orderId: string, reference: string, amountEgp: number): Promise<ActionResult> {
  return run("approveOrder", async () => {
    const staff = await requireStaffSession(["admin"]);
    await approveOrder(adminDb(), staff.userId, { orderId, reference: String(reference).trim(), amountEgp });
    refresh();
    return {};
  });
}
