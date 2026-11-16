import type { Block, EventContent, EventSettings, Localized } from "@/content/schema";
import type { EventKind } from "@/templates/types";
import type { Locale } from "@/i18n/config";

export type { Locale };

// What the invitation components need to know about an event. The live page
// builds it from the cached public event; the editor preview builds it from a draft.
export type InviteEvent = {
  slug: string;
  kind: EventKind;
  status: "published" | "postponed" | "cancelled" | "ended";
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  fields: EventContent["fields"];
  blocks: Block[];
  // Block ids in host order. Ids that are not in `blocks` are guest-only slots.
  order: string[];
  preview: EventContent["preview"];
  settings: Pick<EventSettings, "sharingEnabled" | "rosterVisible" | "lockTeams">;
  entitlements: { games: boolean; share_cards: boolean; reveal: boolean; voice: boolean; photos: boolean };
};

export type RevealStyle = "balloon" | "scratch";
export type Answer = ("boy" | "girl")[];

export type GuestTeam = { id: string; key: string; name: Localized; color: string };
export type GuestPlayer = { id: string; name: string; teamId: string | null; approved: boolean; teamSwitchedAt: string | null };
export type GuestRsvp = { status: "yes" | "no" | "maybe"; adults: number; children: number; note: string };

// GET /api/guest/[slug]/me
export type GuestMe = {
  invitation: { kind: "personal" | "group" | "open"; label: string; paxCap: number };
  player: GuestPlayer | null;
  household: { id: string; name: string }[];
  rsvp: GuestRsvp | null;
  teams: GuestTeam[];
  guestBlocks: Block[];
  rsvpOpen: boolean;
};

// GET /api/live/[slug]
export type LivePayload = {
  v: number;
  status: InviteEvent["status"];
  phase: "idle" | "countdown" | "revealed";
  revealAt: string | null;
  answer: Answer | null;
  revealStyle?: "balloon" | "scratch" | null;
  scores: { teamId: string; key?: string; score: number; players: number }[];
};
