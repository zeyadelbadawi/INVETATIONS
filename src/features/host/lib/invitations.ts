import { z } from "zod";
import type { Actor } from "@/lib/events/access";
import type { AdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { hashForDb, newLinkCode } from "@/lib/security/tokens";
import { normaliseName } from "@/lib/security/names";
import { auditActor, loadEntitlements, loadEventFor } from "./access";
import { toCsv } from "./csv";
import { HostError } from "./errors";
import { normalisePhone } from "./text";

export const MAX_ROWS_PER_REQUEST = 500;

const rowSchema = z.object({
  label: z.string().max(200),
  kind: z.enum(["personal", "group"]),
  // Household size on a personal link, player limit on a group link.
  size: z.number().int().min(1).max(2000),
  phone: z.string().max(40).nullable().optional(),
  sideTeamId: z.uuid().nullable().optional(),
  locale: z.enum(["ar", "en"]).nullable().optional(),
});
const rowsSchema = z.array(rowSchema).min(1);
export type InvitationRowInput = z.input<typeof rowSchema>;

export type CreatedInvitation = { id: string; label: string; phone: string | null; code: string };

// Seats already promised: pax on personal links plus the limit on group links.
// The open link is not counted; revoked links free their seats.
export async function seatsUsed(db: AdminClient, eventId: string): Promise<number> {
  const { data, error } = await db
    .from("invitations")
    .select("kind, pax_cap, max_players")
    .eq("event_id", eventId)
    .is("revoked_at", null)
    .in("kind", ["personal", "group"]);
  if (error) throw new Error(`invitation count failed: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + (row.kind === "personal" ? row.pax_cap : row.max_players), 0);
}

// Adds one or many invitations. Every row is validated here, whatever the
// browser parsed; plan limits come from the event's settled plan.
export async function addInvitations(
  db: AdminClient,
  actor: Actor,
  eventId: string,
  raw: unknown,
): Promise<CreatedInvitation[]> {
  const event = await loadEventFor(db, actor, eventId);
  if (event.status === "archived" || event.status === "cancelled") throw new HostError("bad_status");
  if (Array.isArray(raw) && raw.length > MAX_ROWS_PER_REQUEST) throw new HostError("too_many_rows");
  const parsed = rowsSchema.safeParse(raw);
  if (!parsed.success) throw new HostError("invalid", { row: Number(parsed.error.issues[0]?.path[0] ?? 0) + 1 });

  const entitlements = await loadEntitlements(db, event.plan_id);
  const { data: teams } = await db.from("teams").select("id").eq("event_id", event.id);
  const teamIds = new Set((teams ?? []).map((t) => t.id));

  const rows = parsed.data.map((row, index) => {
    const label = normaliseName(row.label, 120);
    if (!label) throw new HostError("invalid", { row: index + 1 });
    if (row.kind === "personal" && !entitlements.personal_links) throw new HostError("personal_links_not_in_plan");
    if (row.kind === "personal" && row.size > 50) throw new HostError("invalid", { row: index + 1 });
    const phone = row.phone ? normalisePhone(row.phone) : null;
    if (row.phone && row.phone.trim() !== "" && !phone) throw new HostError("invalid", { row: index + 1 });
    if (row.sideTeamId && !teamIds.has(row.sideTeamId)) throw new HostError("invalid", { row: index + 1 });
    return { ...row, label, phone, code: newLinkCode() };
  });

  // One database call locks the event, sums the seats already promised and
  // inserts only if the plan's cap still holds, so two requests in parallel
  // cannot both fit under it (review F9).
  const { data: result, error } = await db.rpc("invitations_add", {
    p_event_id: event.id,
    p_max_guests: entitlements.max_guests as number,
    p_rows: rows.map((row) => ({
      kind: row.kind,
      label: row.label,
      pax_cap: row.kind === "personal" ? row.size : 1,
      max_players: row.kind === "group" ? row.size : Math.max(row.size, 1),
      phone: row.phone,
      side_team_id: row.sideTeamId ?? null,
      locale: row.locale ?? null,
      code_hash: hashForDb(row.code).slice(2),
    })),
  });
  if (error) throw new Error(`invitation insert failed: ${error.message}`);
  const outcome = result as { ok: boolean; used?: number; ids?: string[] } | null;
  if (outcome && !outcome.ok) throw new HostError("guest_cap", { max: entitlements.max_guests ?? 0, used: outcome.used ?? 0 });
  const data = (outcome?.ids ?? []).map((id) => ({ id }));
  if (data.length !== rows.length) throw new Error("invitation insert failed: row count");

  await audit({
    ...auditActor(actor),
    action: "invitations.added",
    eventId: event.id,
    metadata: { count: rows.length },
  });
  // Inserted rows come back in input order.
  return rows.map((row, i) => ({ id: data[i].id, label: row.label, phone: row.phone, code: row.code }));
}

async function loadInvitation(db: AdminClient, eventId: string, invitationId: string) {
  if (!z.uuid().safeParse(invitationId).success) throw new HostError("not_found");
  // Scoped by event id as well as id, so an id from another event finds nothing.
  const { data } = await db
    .from("invitations")
    .select("id, kind, label, phone, revoked_at")
    .eq("event_id", eventId)
    .eq("id", invitationId)
    .maybeSingle();
  if (!data) throw new HostError("not_found");
  return data;
}

export async function revokeInvitation(db: AdminClient, actor: Actor, eventId: string, invitationId: string): Promise<void> {
  const event = await loadEventFor(db, actor, eventId);
  const invitation = await loadInvitation(db, event.id, invitationId);
  // The event always keeps its one open link; replace it instead of removing it.
  if (invitation.kind === "open") throw new HostError("open_link_fixed");
  if (invitation.revoked_at) return;
  const { error } = await db
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("event_id", event.id)
    .eq("id", invitation.id);
  if (error) throw new Error(`revoke failed: ${error.message}`);
  // Sessions opened from this link stop working at once (security rule 1).
  await db
    .from("guest_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("event_id", event.id)
    .eq("invitation_id", invitation.id)
    .is("revoked_at", null);
  await audit({ ...auditActor(actor), action: "invitation.revoked", eventId: event.id, target: invitation.id });
}

// Issues a new code; the old link stops working. Guests who already opened the
// old link keep their session.
export async function regenerateInvitation(
  db: AdminClient,
  actor: Actor,
  eventId: string,
  invitationId: string,
): Promise<CreatedInvitation> {
  const event = await loadEventFor(db, actor, eventId);
  const invitation = await loadInvitation(db, event.id, invitationId);
  if (invitation.revoked_at) throw new HostError("revoked");
  const code = newLinkCode();
  const { error } = await db
    .from("invitations")
    .update({ code_hash: hashForDb(code) })
    .eq("event_id", event.id)
    .eq("id", invitation.id)
    .is("revoked_at", null);
  if (error) throw new Error(`regenerate failed: ${error.message}`);
  await audit({ ...auditActor(actor), action: "invitation.regenerated", eventId: event.id, target: invitation.id });
  return { id: invitation.id, label: invitation.label, phone: invitation.phone, code };
}

export type GuestExportLabels = {
  headers: [string, string, string, string, string, string, string, string, string, string];
  kinds: Record<"personal" | "group" | "open", string>;
  yes: string;
  no: string;
  rsvp: Record<"yes" | "no" | "maybe", string>;
};

// Guest list with replies. Owner only: staff grants never include exports (security A3).
export async function exportGuestsCsv(
  db: AdminClient,
  actor: Actor,
  eventId: string,
  labels: GuestExportLabels,
  locale: "ar" | "en",
): Promise<string> {
  const event = await loadEventFor(db, actor, eventId, { ownerOnly: true });
  const [{ data: invitations }, { data: teams }, { data: rsvps }] = await Promise.all([
    db
      .from("invitations")
      .select("id, kind, label, side_team_id, pax_cap, max_players, phone, opened_at, revoked_at")
      .eq("event_id", event.id)
      .order("created_at"),
    db.from("teams").select("id, name_ar, name_en").eq("event_id", event.id),
    db.from("rsvps").select("invitation_id, status, adults, children").eq("event_id", event.id),
  ]);
  const teamName = new Map((teams ?? []).map((t) => [t.id, locale === "ar" ? t.name_ar : t.name_en]));

  const rows: (string | number | null)[][] = [labels.headers];
  for (const inv of invitations ?? []) {
    const replies = (rsvps ?? []).filter((r) => r.invitation_id === inv.id);
    const coming = replies.filter((r) => r.status === "yes");
    const status =
      replies.length === 0
        ? ""
        : inv.kind === "personal"
          ? labels.rsvp[replies[0].status as "yes" | "no" | "maybe"] ?? ""
          : `${labels.rsvp.yes}: ${coming.length} / ${replies.length}`;
    rows.push([
      inv.label,
      labels.kinds[inv.kind as "personal" | "group" | "open"] ?? inv.kind,
      inv.side_team_id ? teamName.get(inv.side_team_id) ?? "" : "",
      inv.kind === "personal" ? inv.pax_cap : inv.max_players,
      inv.phone ?? "",
      inv.opened_at ? labels.yes : labels.no,
      inv.revoked_at ? labels.yes : labels.no,
      status,
      coming.reduce((sum, r) => sum + r.adults, 0),
      coming.reduce((sum, r) => sum + r.children, 0),
    ]);
  }

  await audit({
    ...auditActor(actor),
    action: "guests.exported",
    eventId: event.id,
    metadata: { rows: rows.length - 1 },
  });
  // Byte-order mark so spreadsheet apps read the Arabic as UTF-8.
  return `﻿${toCsv(rows)}`;
}
