"use server";

import { refresh } from "next/cache";
import { isLocale } from "@/i18n/config";
import { requireEventAccess } from "@/lib/events/access";
import { adminDb } from "@/lib/supabase/admin";
import type { ActionResult } from "../lib/errors";
import * as invitations from "../lib/invitations";
import { run } from "../lib/run";
import { hostMessages } from "../messages";

// Link codes are returned to the host's browser once, in the action result, and
// are never logged or stored (security rule 40).

export async function addInvitationsAction(
  eventId: string,
  rows: unknown,
): Promise<ActionResult<{ created: invitations.CreatedInvitation[] }>> {
  return run("addInvitations", async () => {
    const actor = await requireEventAccess(eventId, "manage_invitations");
    const created = await invitations.addInvitations(adminDb(), actor, eventId, rows);
    refresh();
    return { created };
  });
}

export async function revokeInvitationAction(eventId: string, invitationId: string): Promise<ActionResult> {
  return run("revokeInvitation", async () => {
    const actor = await requireEventAccess(eventId, "manage_invitations");
    await invitations.revokeInvitation(adminDb(), actor, eventId, invitationId);
    refresh();
    return {};
  });
}

export async function regenerateInvitationAction(
  eventId: string,
  invitationId: string,
): Promise<ActionResult<{ created: invitations.CreatedInvitation }>> {
  return run("regenerateInvitation", async () => {
    const actor = await requireEventAccess(eventId, "manage_invitations");
    const created = await invitations.regenerateInvitation(adminDb(), actor, eventId, invitationId);
    return { created };
  });
}

export async function exportGuestsAction(eventId: string, locale: string): Promise<ActionResult<{ csv: string }>> {
  return run("exportGuests", async () => {
    const actor = await requireEventAccess(eventId, "export");
    const lang = isLocale(locale) ? locale : "ar";
    const t = hostMessages(lang).invitations;
    const csv = await invitations.exportGuestsCsv(
      adminDb(),
      actor,
      eventId,
      {
        headers: [
          t.csv.name,
          t.csv.kind,
          t.csv.side,
          t.csv.seats,
          t.csv.phone,
          t.csv.opened,
          t.csv.revoked,
          t.csv.reply,
          t.csv.adults,
          t.csv.children,
        ],
        kinds: t.kinds,
        yes: t.csv.yes,
        no: t.csv.no,
        rsvp: t.csv.rsvp,
      },
      lang,
    );
    return { csv };
  });
}
