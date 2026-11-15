import type { Actor } from "@/lib/events/access";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/db/types";
import { entitlementsSchema, type Entitlements } from "@/lib/events/published";
import { HostError } from "./errors";

export type EventRow = Database["public"]["Tables"]["events"]["Row"];

// The capability decision is made once, by requireEventAccess in the server
// action. This is a second, independent check next to the write itself: the
// actor handed to a data function must really belong to this event, so a
// mistake in a caller can never turn the service key into cross-event access.
export async function loadEventFor(
  db: AdminClient,
  actor: Actor,
  eventId: string,
  opts: { ownerOnly?: boolean } = {},
): Promise<EventRow> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new HostError("forbidden");
  const { data: event } = await db.from("events").select("*").eq("id", eventId).maybeSingle();
  if (!event) throw new HostError("forbidden");

  if (actor.kind === "owner") {
    if (event.owner_id !== actor.userId) throw new HostError("forbidden");
    return event;
  }
  if (actor.kind === "staff" && !opts.ownerOnly && actor.grantId) {
    const { data: grant } = await db
      .from("staff_grants")
      .select("id")
      .eq("id", actor.grantId)
      .eq("event_id", eventId)
      .eq("staff_id", actor.userId)
      .is("revoked_at", null)
      .gt("expires_at", "now")
      .maybeSingle();
    if (grant) return event;
  }
  throw new HostError("forbidden");
}

export function auditActor(actor: Actor) {
  return {
    actorId: actor.userId,
    actorKind: actor.kind === "staff" ? ("staff" as const) : ("host" as const),
    grantId: actor.grantId,
  };
}

// What an event may do before it has a paid plan: prepare a guest list with
// group links. Nothing is reachable by guests until the event is published,
// which needs a paid plan.
export const DRAFT_ENTITLEMENTS: Entitlements = {
  max_guests: 100,
  personal_links: false,
  games: false,
  share_cards: false,
  voice: false,
  photos: false,
  reveal: false,
};

// Entitlements always come from the plan row that settlement attached to the
// event (security P1), never from the client.
export async function loadEntitlements(db: AdminClient, planId: string | null): Promise<Entitlements> {
  if (!planId) return DRAFT_ENTITLEMENTS;
  const { data: plan } = await db.from("plans").select("entitlements").eq("id", planId).maybeSingle();
  const parsed = entitlementsSchema.safeParse(plan?.entitlements);
  return parsed.success ? parsed.data : DRAFT_ENTITLEMENTS;
}
