import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { fail, guestWrite, json } from "@/lib/guest/route";
import { award, POINTS } from "@/lib/guest/scores";

const schema = z.object({
  status: z.enum(["yes", "no", "maybe"]),
  adults: z.number().int().min(0).max(50).default(1),
  children: z.number().int().min(0).max(50).default(0),
  note: z.string().trim().max(300).default(""),
});

export const POST = guestWrite({ schema }, async ({ event, guest, input }) => {
  const deadline = event.settings.rsvpDeadline;
  if (deadline && new Date(deadline).getTime() < Date.now()) return fail("rsvp_closed", 409);

  const personal = guest.invitation.kind === "personal";
  // A household answers once for the whole party; on shared links each person answers for themselves.
  if (!personal && !guest.player) return fail("not_joined", 409);
  const cap = personal ? guest.invitation.paxCap : 6;
  if (input.status === "yes" && input.adults + input.children > cap) return fail("over_cap", 400);
  if (input.status === "yes" && input.adults + input.children < 1) return fail("invalid", 400);

  const db = adminDb();
  const row = {
    event_id: event.id,
    invitation_id: guest.invitation.id,
    player_id: personal ? null : guest.player!.id,
    status: input.status,
    adults: input.status === "no" ? 0 : input.adults,
    children: input.status === "no" ? 0 : input.children,
    answers: { note: input.note },
  };

  let query = db.from("rsvps").select("id").eq("event_id", event.id).eq("invitation_id", guest.invitation.id);
  query = personal ? query.is("player_id", null) : query.eq("player_id", guest.player!.id);
  const { data: existing } = await query.maybeSingle();

  const { error } = existing
    ? await db.from("rsvps").update(row).eq("id", existing.id).eq("event_id", event.id)
    : await db.from("rsvps").insert(row);
  if (error) throw new Error(`rsvp write failed: ${error.message}`);

  if (guest.player && guest.player.approved && event.entitlements.games) {
    await award(event.id, guest.player, "rsvp", guest.invitation.id, POINTS.rsvp);
  }
  return json({ ok: true, rsvp: { status: row.status, adults: row.adults, children: row.children, note: input.note } });
});
