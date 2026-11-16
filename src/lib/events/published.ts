import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { settingsSchema, themeSchema, type Block, type EventContent, type EventSettings, type EventTheme } from "@/content/schema";
import type { EventKind } from "@/templates/types";

export const entitlementsSchema = z.object({
  max_guests: z.number().int().nonnegative().nullable(),
  personal_links: z.boolean(),
  games: z.boolean(),
  share_cards: z.boolean(),
  voice: z.boolean(),
  photos: z.boolean(),
  reveal: z.boolean(),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;

export const NO_ENTITLEMENTS: Entitlements = {
  max_guests: 0,
  personal_links: false,
  games: false,
  share_cards: false,
  voice: false,
  photos: false,
  reveal: false,
};

// What the invitation shell and the guest API need to know about a live event.
// Contains only the public half of the content; guest-only blocks are loaded
// separately, after a session check.
export type PublicEvent = {
  id: string;
  slug: string;
  kind: EventKind;
  status: "published" | "postponed" | "cancelled" | "ended";
  templateId: string;
  templateVersion: number;
  version: number;
  defaultLocale: "ar" | "en";
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  hasPasscode: boolean;
  theme: EventTheme;
  settings: EventSettings;
  entitlements: Entitlements;
  fields: EventContent["fields"];
  blocks: Block[];
  order: string[];
  music: string | null;
  preview: EventContent["preview"];
};

const LIVE = ["published", "postponed", "cancelled", "ended"];

export function eventTag(slug: string): string {
  return `event:${slug}`;
}

// Cached per slug and invalidated on publish. Holds nothing personal.
export async function getPublicEvent(slug: string): Promise<PublicEvent | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(eventTag(slug));

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 64) return null;
  const db = adminDb();
  const { data: e } = await db
    .from("events")
    .select(
      "id, slug, kind, status, template_id, template_version, published_version, published_content, default_locale, starts_at, ends_at, timezone, passcode_hash, theme, settings, plan_id",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!e || !LIVE.includes(e.status) || !e.published_content) return null;

  let entitlements = NO_ENTITLEMENTS;
  if (e.plan_id) {
    const { data: plan } = await db.from("plans").select("entitlements").eq("id", e.plan_id).maybeSingle();
    const parsed = entitlementsSchema.safeParse(plan?.entitlements);
    if (parsed.success) entitlements = parsed.data;
  }

  const published = e.published_content as unknown as {
    public: Pick<PublicEvent, "fields" | "blocks" | "music" | "preview">;
    order?: string[];
    theme?: unknown;
  };
  return {
    id: e.id,
    slug: e.slug,
    kind: e.kind as EventKind,
    status: e.status as PublicEvent["status"],
    templateId: e.template_id,
    templateVersion: e.template_version,
    version: e.published_version,
    defaultLocale: e.default_locale as "ar" | "en",
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    timezone: e.timezone,
    hasPasscode: e.passcode_hash !== null,
    // The theme published with the content, so draft edits do not go live
    // before the host publishes. Events published before the theme was part of
    // the snapshot have none; for them the event's theme column is used until
    // their next publish (backward compatible, review F11).
    theme: themeSchema.catch({}).parse(published.theme !== undefined ? published.theme : e.theme),
    settings: settingsSchema.parse(settingsSchema.safeParse(e.settings).success ? e.settings : {}),
    entitlements,
    fields: published.public.fields,
    blocks: published.public.blocks,
    order: published.order ?? [],
    music: published.public.music,
    preview: published.public.preview,
  };
}

// Guest-only blocks. Never cached with the public shell; call only after a
// session (or passcode) check.
export async function getGuestBlocks(eventId: string): Promise<Block[]> {
  const { data } = await adminDb().from("events").select("published_content").eq("id", eventId).maybeSingle();
  const published = data?.published_content as unknown as { guest?: { blocks?: Block[] } } | null;
  return published?.guest?.blocks ?? [];
}
