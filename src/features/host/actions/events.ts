"use server";

import type { Route } from "next";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireEventAccess, requireUser } from "@/lib/events/access";
import { eventTag } from "@/lib/events/published";
import { adminDb } from "@/lib/supabase/admin";
import type { ActionResult } from "../lib/errors";
import * as events from "../lib/events";
import { run } from "../lib/run";

// Every action below authenticates, authorises for one capability and validates
// its input itself (security rule 11); the proxy is not relied on.

export async function createEventAction(input: {
  kind: string;
  templateId: string;
  name: string;
  locale: string;
}): Promise<ActionResult> {
  const result = await run("createEvent", async () => {
    const userId = await requireUser();
    const created = await events.createEvent(adminDb(), userId, input);
    // The open link's code is not sent anywhere: the host issues a fresh one
    // from the invitations page when they are ready to share it.
    return { id: created.id };
  });
  if (!result.ok) return result;
  const lang = isLocale(input.locale) ? input.locale : "ar";
  redirect(`/${lang}/app/events/${result.id}/edit` as Route);
}

export async function saveDraftAction(
  eventId: string,
  content: unknown,
  theme: unknown,
): Promise<ActionResult<{ savedAt: string }>> {
  return run("saveDraft", async () => {
    const actor = await requireEventAccess(eventId, "edit_content");
    // No cache update: the draft is never cached, and a re-render here would
    // interrupt typing.
    return events.saveDraft(adminDb(), actor, eventId, content, theme);
  });
}

export async function updateSettingsAction(eventId: string, input: unknown): Promise<ActionResult> {
  return run("updateSettings", async () => {
    const actor = await requireEventAccess(eventId, "edit_content");
    const { liveSlug } = await events.updateSettings(adminDb(), actor, eventId, input);
    if (liveSlug) updateTag(eventTag(liveSlug));
    else refresh();
    return {};
  });
}

export async function publishEventAction(eventId: string): Promise<ActionResult<{ version: number }>> {
  return run("publishEvent", async () => {
    const actor = await requireEventAccess(eventId, "publish");
    const { slug, version } = await events.publishEvent(adminDb(), actor, eventId);
    updateTag(eventTag(slug));
    return { version };
  });
}

export async function postponeEventAction(eventId: string): Promise<ActionResult> {
  return run("postponeEvent", async () => {
    const actor = await requireEventAccess(eventId, "publish");
    const { slug } = await events.postponeEvent(adminDb(), actor, eventId);
    updateTag(eventTag(slug));
    return {};
  });
}

export async function cancelEventAction(eventId: string): Promise<ActionResult> {
  return run("cancelEvent", async () => {
    const actor = await requireEventAccess(eventId, "publish");
    const { slug } = await events.cancelEvent(adminDb(), actor, eventId);
    updateTag(eventTag(slug));
    return {};
  });
}
