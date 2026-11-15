import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";

type AuditEntry = {
  actorId?: string | null;
  actorKind: "host" | "staff" | "keeper" | "system";
  action: string;
  eventId?: string | null;
  target?: string | null;
  grantId?: string | null;
  metadata?: Json;
};

// Append-only. Never put secrets, link codes or reveal answers in metadata.
export async function audit(entry: AuditEntry): Promise<void> {
  const { error } = await adminDb().from("audit_log").insert({
    actor_id: entry.actorId ?? null,
    actor_kind: entry.actorKind,
    action: entry.action,
    event_id: entry.eventId ?? null,
    target: entry.target ?? null,
    grant_id: entry.grantId ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) throw new Error(`audit write failed: ${error.message}`);
}
