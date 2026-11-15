import "server-only";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Locale } from "@/i18n/config";
import { AccessError, requireEventAccess, requireUser, type Actor, type Capability } from "@/lib/events/access";
import { adminDb } from "@/lib/supabase/admin";
import { loadEventFor, type EventRow } from "./access";
import { HostError } from "./errors";

// Guards for pages. Signed-out visitors go to sign-in and come back; anyone
// without access to the event gets the same "not found" as a missing event, so
// ids cannot be probed.

export async function userOrLogin(lang: Locale, path: string): Promise<string> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof AccessError) redirect(`/${lang}/login?next=${encodeURIComponent(path)}` as Route);
    throw error;
  }
}

export const eventForPage = cache(
  async (lang: Locale, eventId: string, capability: Capability, section: string): Promise<{ actor: Actor; event: EventRow }> => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) notFound();
    try {
      const actor = await requireEventAccess(eventId, capability);
      const event = await loadEventFor(adminDb(), actor, eventId);
      return { actor, event };
    } catch (error) {
      if (error instanceof AccessError && error.reason === "unauthenticated") {
        redirect(`/${lang}/login?next=${encodeURIComponent(`/${lang}/app/events/${eventId}/${section}`)}` as Route);
      }
      if (error instanceof AccessError || error instanceof HostError) notFound();
      throw error;
    }
  },
);
