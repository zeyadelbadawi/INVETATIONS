import { admin, makeHost } from "../db/helpers";
import { AdminError } from "@/features/admin/lib/errors";
import { HostError } from "@/features/host/lib/errors";
import { AccessError } from "@/lib/events/access";

export async function makeStaff(label: string, role: "admin" | "support" | "designer") {
  const user = await makeHost(label);
  const { error } = await admin.from("staff_roles").insert({ user_id: user.id, role });
  if (error) throw error;
  return user;
}

// The code an expected failure carries, or "resolved".
export async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "resolved";
  } catch (error) {
    if (error instanceof AdminError || error instanceof HostError) return error.code;
    if (error instanceof AccessError) return error.reason;
    return `unexpected: ${String(error)}`;
  }
}

export async function auditRows(action: string, filter: { eventId?: string; grantId?: string; target?: string }) {
  let q = admin.from("audit_log").select("actor_id, actor_kind, action, event_id, target, grant_id, metadata").eq("action", action);
  if (filter.eventId) q = q.eq("event_id", filter.eventId);
  if (filter.grantId) q = q.eq("grant_id", filter.grantId);
  if (filter.target) q = q.eq("target", filter.target);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
