import { randomBytes } from "node:crypto";
import { admin, hash, makeEvent, makeHost } from "../db/helpers";
import type { PublicEvent } from "@/lib/events/published";
import type { GuestContext } from "@/lib/guest/session";
import { settingsSchema } from "@/content/schema";

export async function makeLiveEvent(kind: "wedding" | "gender_reveal" = "gender_reveal") {
  const host = await makeHost("guest-fx");
  const base = await makeEvent(host.id);
  const templateId = kind === "gender_reveal" ? "reveal-draft" : "wedding-draft";
  await admin
    .from("events")
    .update({ kind, template_id: templateId, status: "published", plan_id: "premium", published_version: 1,
      published_content: { public: { fields: {}, blocks: [], music: null, preview: {} }, guest: { blocks: [] }, order: [] } })
    .eq("id", base.id);
  const keys = kind === "gender_reveal" ? ["boy", "girl"] : ["groom", "bride", "friends"];
  const { data: teams } = await admin
    .from("teams")
    .insert(keys.map((key, i) => ({ event_id: base.id, key, name_ar: key, name_en: key, color: `team-${"abc"[i]}`, position: i })))
    .select("id, key");
  await admin.from("live_state").insert({ event_id: base.id });

  const event: PublicEvent = {
    id: base.id, slug: base.slug, kind, status: "published", templateId, templateVersion: 1, version: 1,
    defaultLocale: "ar", startsAt: null, endsAt: null, timezone: "Africa/Cairo", hasPasscode: false, theme: {},
    settings: settingsSchema.parse({}),
    entitlements: { max_guests: null, personal_links: true, games: true, share_cards: true, voice: true, photos: true, reveal: true },
    fields: {}, blocks: [], order: [], music: null, preview: { title: { ar: "", en: "" }, description: { ar: "", en: "" }, image: null },
  };
  return { host, event, teams: teams! };
}

// A session row plus the context object the guest routes would build from its cookie.
export async function makeGuest(event: PublicEvent, kind: "personal" | "group" | "open" = "group", paxCap = 3): Promise<GuestContext> {
  const { data: invitation } = await admin
    .from("invitations")
    .insert({ event_id: event.id, kind, label: `Party ${randomBytes(3).toString("hex")}`, pax_cap: paxCap, max_players: 5, code_hash: hash(randomBytes(16).toString("hex")) })
    .select("id, kind, label, pax_cap, max_players, side_team_id, locale")
    .single();
  const { data: session } = await admin
    .from("guest_sessions")
    .insert({ token_hash: hash(randomBytes(32).toString("hex")), event_id: event.id, invitation_id: invitation!.id, expires_at: new Date(Date.now() + 86400000).toISOString() })
    .select("id")
    .single();
  return {
    sessionId: session!.id,
    eventId: event.id,
    invitation: {
      id: invitation!.id, kind, label: invitation!.label, paxCap: invitation!.pax_cap,
      maxPlayers: invitation!.max_players, sideTeamId: null, locale: null,
    },
    player: null,
  };
}
