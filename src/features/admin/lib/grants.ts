import "server-only";
import { z } from "zod";
import type { Capability } from "@/lib/events/access";
import { adminDb, type AdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { eventName } from "@/features/host/lib/display";
import { AdminError } from "./errors";

// Time-boxed staff access to one event (security A3, technical design §4).
// requireEventAccess honours a grant only for these capabilities; reveal
// control, exports, deletion, members and payments are never grantable.
export const GRANTABLE_CAPABILITIES = ["view", "edit_content", "manage_invitations", "manage_play", "moderate"] as const satisfies readonly Capability[];
export type GrantableCapability = (typeof GRANTABLE_CAPABILITIES)[number];

export const DEFAULT_GRANT_DAYS = 14;
export const MAX_GRANT_DAYS = 30;
const DAY_MS = 86_400_000;

export type GrantStatus = "active" | "expired" | "revoked";

export function grantStatus(row: { revoked_at: string | null; expires_at: string }, dbNow: Date): GrantStatus {
  if (row.revoked_at) return "revoked";
  return new Date(row.expires_at).getTime() > dbNow.getTime() ? "active" : "expired";
}

// The database clock: expiry is never judged on the app server's time.
export async function dbNow(db: AdminClient): Promise<Date> {
  const { data, error } = await db.rpc("db_now");
  if (error || typeof data !== "string") throw new Error("database clock unavailable");
  return new Date(data);
}

async function requireAdminRole(db: AdminClient, userId: string) {
  const { data } = await db.from("staff_roles").select("role").eq("user_id", userId).maybeSingle();
  if (data?.role !== "admin") throw new AdminError("forbidden");
}

const grantSchema = z.object({
  eventId: z.uuid(),
  staffId: z.uuid(),
  capabilities: z.array(z.string()).min(1).max(10),
  days: z.number().int(),
});

// Capabilities requested by the form, checked against the grantable set. Any
// capability outside it refuses the whole request rather than being dropped.
// "view" is always included: every host page needs it.
export function normaliseCapabilities(requested: readonly string[]): GrantableCapability[] {
  const allowed = new Set<string>(GRANTABLE_CAPABILITIES);
  for (const c of requested) if (!allowed.has(c)) throw new AdminError("bad_capability");
  const set = new Set<string>(["view", ...requested]);
  return GRANTABLE_CAPABILITIES.filter((c) => set.has(c));
}

export type CreatedGrant = { id: string; expiresAt: string; capabilities: GrantableCapability[] };

export async function createGrant(db: AdminClient, adminId: string, raw: unknown): Promise<CreatedGrant> {
  await requireAdminRole(db, adminId);
  const parsed = grantSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError("invalid");
  const input = parsed.data;
  const capabilities = normaliseCapabilities(input.capabilities);
  if (input.days < 1 || input.days > MAX_GRANT_DAYS) throw new AdminError("bad_duration");
  if (input.staffId === adminId) throw new AdminError("self_grant");

  const [{ data: role }, { data: event }] = await Promise.all([
    db.from("staff_roles").select("role").eq("user_id", input.staffId).maybeSingle(),
    db.from("events").select("id").eq("id", input.eventId).maybeSingle(),
  ]);
  if (!role || (role.role !== "designer" && role.role !== "support")) throw new AdminError("not_staff");
  if (!event) throw new AdminError("not_found");

  const now = await dbNow(db);
  const expiresAt = new Date(now.getTime() + input.days * DAY_MS).toISOString();
  const { data: grant, error } = await db
    .from("staff_grants")
    .insert({ event_id: event.id, staff_id: input.staffId, capabilities, created_by: adminId, expires_at: expiresAt })
    .select("id, expires_at")
    .single();
  if (error || !grant) throw new Error(`grant insert failed: ${error?.message}`);

  await audit({
    actorId: adminId,
    actorKind: "staff",
    action: "grant.created",
    eventId: event.id,
    target: input.staffId,
    grantId: grant.id,
    metadata: { capabilities, expires_at: grant.expires_at, days: input.days },
  });
  // The customer is told whenever staff get access (security A4). There is no
  // email provider yet: the notice is recorded here and shown in the host
  // dashboard through pendingStaffAccessNotice().
  await audit({
    actorId: adminId,
    actorKind: "staff",
    action: "grant.owner_notified_pending",
    eventId: event.id,
    target: grant.id,
    grantId: grant.id,
    metadata: { channel: "dashboard" },
  });
  return { id: grant.id, expiresAt: grant.expires_at, capabilities };
}

export async function revokeGrant(db: AdminClient, adminId: string, grantId: unknown): Promise<void> {
  await requireAdminRole(db, adminId);
  const id = z.uuid().safeParse(grantId);
  if (!id.success) throw new AdminError("invalid");
  const now = await dbNow(db);
  const { data, error } = await db
    .from("staff_grants")
    .update({ revoked_at: now.toISOString() })
    .eq("id", id.data)
    .is("revoked_at", null)
    .select("id, event_id, staff_id");
  if (error) throw new Error(`grant revoke failed: ${error.message}`);
  if (!data || data.length === 0) throw new AdminError("not_active");
  await audit({
    actorId: adminId,
    actorKind: "staff",
    action: "grant.revoked",
    eventId: data[0].event_id,
    target: data[0].staff_id,
    grantId: data[0].id,
  });
}

export type GrantView = {
  id: string;
  staffId: string;
  staffEmail: string | null;
  staffRole: string | null;
  capabilities: string[];
  createdAt: string;
  expiresAt: string;
  status: GrantStatus;
};

export async function listEventGrants(db: AdminClient, eventId: string): Promise<GrantView[]> {
  const [now, { data, error }] = await Promise.all([
    dbNow(db),
    db
      .from("staff_grants")
      .select("id, staff_id, capabilities, created_at, expires_at, revoked_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (error) throw new Error(`grant list failed: ${error.message}`);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.staff_id))];
  const [{ data: emails }, { data: roles }] = await Promise.all([
    ids.length ? db.rpc("staff_user_emails", { p_ids: ids }) : Promise.resolve({ data: [] as { id: string; email: string }[] }),
    ids.length ? db.from("staff_roles").select("user_id, role").in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string; role: string }[] }),
  ]);
  const emailOf = new Map((emails ?? []).map((e) => [e.id, e.email]));
  const roleOf = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
  return rows.map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    staffEmail: emailOf.get(r.staff_id) ?? null,
    staffRole: roleOf.get(r.staff_id) ?? null,
    capabilities: r.capabilities,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    status: grantStatus(r, now),
  }));
}

export type Assignment = { grantId: string; eventId: string; eventName: string; slug: string; capabilities: string[]; expiresAt: string };

// A staff member's own live grants, for "My assignments".
export async function listMyAssignments(db: AdminClient, staffId: string, locale: "ar" | "en"): Promise<Assignment[]> {
  const { data, error } = await db
    .from("staff_grants")
    .select("id, event_id, capabilities, expires_at")
    .eq("staff_id", staffId)
    .is("revoked_at", null)
    .gt("expires_at", "now")
    .order("expires_at")
    .limit(100);
  if (error) throw new Error(`assignment list failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: events } = await db
    .from("events")
    .select("id, slug, content")
    .in(
      "id",
      rows.map((r) => r.event_id),
    );
  const byId = new Map((events ?? []).map((e) => [e.id, e]));
  return rows.flatMap((r) => {
    const event = byId.get(r.event_id);
    if (!event) return [];
    return [
      {
        grantId: r.id,
        eventId: r.event_id,
        // Draft content is schema-parsed before it is shown (security C1).
        eventName: eventName(event.content, locale, event.slug),
        slug: event.slug,
        capabilities: r.capabilities,
        expiresAt: r.expires_at,
      },
    ];
  });
}

export type StaffAccessNotice = {
  grantId: string;
  role: "designer" | "support" | "staff";
  capabilities: string[];
  createdAt: string;
  expiresAt: string;
};

// For the HOST dashboard (security A4: the customer is told whenever staff get
// access). Lists the event's live grants, on database time. Callers must have
// authorised the host for this event first (requireEventAccess(eventId, "view")).
// Staff identities are not exposed, only their role.
export async function pendingStaffAccessNotice(eventId: string, db: AdminClient = adminDb()): Promise<StaffAccessNotice[]> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return [];
  const { data, error } = await db
    .from("staff_grants")
    .select("id, staff_id, capabilities, created_at, expires_at")
    .eq("event_id", eventId)
    .is("revoked_at", null)
    .gt("expires_at", "now")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`grant notice failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: roles } = await db
    .from("staff_roles")
    .select("user_id, role")
    .in(
      "user_id",
      rows.map((r) => r.staff_id),
    );
  const roleOf = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
  return rows.map((r) => {
    const role = roleOf.get(r.staff_id);
    return {
      grantId: r.id,
      role: role === "designer" || role === "support" ? role : "staff",
      capabilities: r.capabilities,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    };
  });
}

export type StaffMember = { id: string; email: string | null; role: string };

// Designers and support staff an admin can grant access to.
export async function listGrantableStaff(db: AdminClient): Promise<StaffMember[]> {
  const { data } = await db.from("staff_roles").select("user_id, role").in("role", ["designer", "support"]).limit(200);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: emails } = await db.rpc("staff_user_emails", { p_ids: rows.map((r) => r.user_id) });
  const emailOf = new Map((emails ?? []).map((e) => [e.id, e.email]));
  return rows.map((r) => ({ id: r.user_id, email: emailOf.get(r.user_id) ?? null, role: r.role }));
}
