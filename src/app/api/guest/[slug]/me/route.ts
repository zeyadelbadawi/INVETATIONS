import { adminDb } from "@/lib/supabase/admin";
import { getGuestBlocks } from "@/lib/events/published";
import { guestRead, json } from "@/lib/guest/route";

// Everything personal the invitation page needs, in one request.
export const GET = guestRead(async ({ event, guest }) => {
  if (!guest) return json({ error: "no_session" }, 401);
  const db = adminDb();
  const personal = guest.invitation.kind === "personal";

  let rsvpQuery = db
    .from("rsvps")
    .select("status, adults, children, answers")
    .eq("event_id", event.id)
    .eq("invitation_id", guest.invitation.id);
  rsvpQuery = personal ? rsvpQuery.is("player_id", null) : rsvpQuery.eq("player_id", guest.player?.id ?? "00000000-0000-0000-0000-000000000000");

  const [rsvp, teams, household, guestBlocks] = await Promise.all([
    rsvpQuery.maybeSingle(),
    db.from("teams").select("id, key, name_ar, name_en, color").eq("event_id", event.id).order("position"),
    // On a household link, members can pick themselves again on a new browser.
    personal
      ? db.from("players").select("id, name").eq("event_id", event.id).eq("invitation_id", guest.invitation.id).is("removed_at", null)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    getGuestBlocks(event.id),
  ]);

  const note = (rsvp.data?.answers as { note?: string } | null)?.note ?? "";
  return json({
    invitation: { kind: guest.invitation.kind, label: guest.invitation.label, paxCap: guest.invitation.paxCap },
    player: guest.player,
    household: household.data ?? [],
    rsvp: rsvp.data ? { status: rsvp.data.status, adults: rsvp.data.adults, children: rsvp.data.children, note } : null,
    teams: (teams.data ?? []).map((t) => ({ id: t.id, key: t.key, name: { ar: t.name_ar, en: t.name_en }, color: t.color })),
    guestBlocks,
    rsvpOpen: event.status === "published" && !(event.settings.rsvpDeadline && new Date(event.settings.rsvpDeadline).getTime() < Date.now()),
  });
});
