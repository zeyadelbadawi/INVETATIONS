import "server-only";
import { z } from "zod";
import type { AdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { AdminError } from "./errors";

// Refund or dispute of a paid order (security rule 34): the order leaves
// "paid" and the event loses the plan in one transaction (unsettle_order).
// Admins only, audited. Callers revalidate the public page with the slug.
export async function markOrderUnpaid(
  db: AdminClient,
  adminId: string,
  orderId: unknown,
  status: unknown,
): Promise<{ eventId: string; slug: string }> {
  const { data: role } = await db.from("staff_roles").select("role").eq("user_id", adminId).maybeSingle();
  if (role?.role !== "admin") throw new AdminError("forbidden");
  const id = z.uuid().safeParse(orderId);
  const next = z.enum(["refunded", "disputed"]).safeParse(status);
  if (!id.success || !next.success) throw new AdminError("invalid");

  const { data, error } = await db.rpc("unsettle_order", { p_order_id: id.data, p_status: next.data });
  if (error) throw new Error(`unsettle failed: ${error.message}`);
  const row = data?.[0];
  if (!row) throw new AdminError("not_paid");

  await audit({
    actorId: adminId,
    actorKind: "staff",
    action: `order.${next.data}`,
    eventId: row.event_id,
    target: id.data,
    metadata: { plan_id: row.plan_id },
  });
  return { eventId: row.event_id, slug: row.slug };
}
