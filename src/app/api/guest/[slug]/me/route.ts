import { adminDb } from "@/lib/supabase/admin";
import { guestRead, json } from "@/lib/guest/route";
import { readGuestDetails } from "@/lib/guest/details";

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

  const [rsvp, teams, household, details] = await Promise.all([
    rsvpQuery.maybeSingle(),
    db.from("teams").select("id, key, name_ar, name_en, color").eq("event_id", event.id).order("position"),
    // Players already on this invitation, so someone on a new browser can pick
    // themselves again: directly on a household link, with their 6-digit code on
    // a shared one. Shared links list names only where the roster is visible.
    !guest.player && (personal || event.settings.rosterVisible)
      ? db.from("players").select("id, name").eq("event_id", event.id).eq("invitation_id", guest.invitation.id).is("removed_at", null).order("created_at").limit(200)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    readGuestDetails(event),
  ]);

  const note = (rsvp.data?.answers as { note?: string } | null)?.note ?? "";
  return json({
    invitation: { kind: guest.invitation.kind, label: guest.invitation.label, paxCap: guest.invitation.paxCap },
    player: guest.player,
    household: household.data ?? [],
    rsvp: rsvp.data ? { status: rsvp.data.status, adults: rsvp.data.adults, children: rsvp.data.children, note } : null,
    teams: (teams.data ?? []).map((t) => ({ id: t.id, key: t.key, name: { ar: t.name_ar, en: t.name_en }, color: t.color })),
    guestBlocks: details.guestBlocks,
    media: details.media,
    content: details.content,
    rsvpOpen: event.status === "published" && !(event.settings.rsvpDeadline && new Date(event.settings.rsvpDeadline).getTime() < Date.now()),
  });
});
