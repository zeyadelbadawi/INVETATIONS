import { z } from "zod";
import type { Actor } from "@/lib/events/access";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { audit } from "@/lib/audit";
import { hashForDb, newLinkCode, slugSuffix } from "@/lib/security/tokens";
import { normaliseName } from "@/lib/security/names";
import {
  contentSchema,
  settingsSchema,
  splitForPublish,
  themeSchema,
  type EventContent,
  type EventTheme,
} from "@/content/schema";
import { getTemplate, initialContent, listTemplates } from "@/templates/registry";
import type { Template } from "@/templates/types";
import { auditActor, loadEventFor } from "./access";
import { HostError } from "./errors";
import { hashPasscode, PASSCODE_MAX_LENGTH, PASSCODE_MIN_LENGTH } from "./passcode";
import { slugBase } from "./text";
import { TIMEZONES, zonedToIso } from "./time";

const MAX_EVENTS_PER_HOST = 30;

export const createEventSchema = z.object({
  kind: z.enum(["wedding", "gender_reveal", "corporate"]),
  templateId: z.string().regex(/^[a-z0-9-]{1,64}$/),
  name: z.string().trim().min(1).max(80),
  locale: z.enum(["ar", "en"]),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

const OPEN_LABEL = { ar: "الرابط العام", en: "Open link" } as const;

// Creates the event and everything a new event needs: teams, the live-state row
// and its single open invitation. Returns the open link's code once; only its
// hash is stored.
export async function createEvent(
  db: AdminClient,
  userId: string,
  raw: unknown,
): Promise<{ id: string; slug: string; openCode: string }> {
  const parsed = createEventSchema.safeParse(raw);
  if (!parsed.success) throw new HostError("invalid");
  const input = parsed.data;
  const name = normaliseName(input.name, 80);
  if (!name) throw new HostError("invalid");

  const template = listTemplates(input.kind)
    .filter((t) => t.id === input.templateId)
    .sort((a, b) => b.version - a.version)[0];
  if (!template) throw new HostError("invalid");

  const { count } = await db.from("events").select("id", { count: "exact", head: true }).eq("owner_id", userId);
  if ((count ?? 0) >= MAX_EVENTS_PER_HOST) throw new HostError("too_many_events");

  const content = initialContent(template);
  // The short name doubles as the link-preview title until the host edits it.
  content.preview.title = { ar: name, en: name };

  let event: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 4 && !event; attempt++) {
    const slug = `${slugBase(name, input.kind)}-${slugSuffix()}`;
    const { data, error } = await db
      .from("events")
      .insert({
        owner_id: userId,
        kind: input.kind,
        slug,
        template_id: template.id,
        template_version: template.version,
        content: content as unknown as Json,
        theme: { palette: template.palettes[0]?.id, fontPair: template.fontPairs[0]?.id } as Json,
        settings: settingsSchema.parse({ rosterVisible: input.kind !== "corporate" }) as Json,
        default_locale: input.locale,
      })
      .select("id, slug")
      .single();
    if (data) event = data;
    // A taken or retired slug is the only failure worth another draw.
    else if (error && error.code !== "23505" && !/slug has been used/.test(error.message)) {
      throw new Error(`event insert failed: ${error.message}`);
    }
  }
  if (!event) throw new Error("could not allocate a slug");

  const openCode = newLinkCode();
  try {
    if (template.teams.length > 0) {
      const { error } = await db.from("teams").insert(
        template.teams.map((team, position) => ({
          event_id: event.id,
          key: team.key,
          name_ar: team.name.ar,
          name_en: team.name.en,
          color: team.color,
          position,
        })),
      );
      if (error) throw new Error(error.message);
    }
    const live = await db.from("live_state").insert({ event_id: event.id });
    if (live.error) throw new Error(live.error.message);
    const invitation = await db.from("invitations").insert({
      event_id: event.id,
      kind: "open",
      label: OPEN_LABEL[input.locale],
      max_players: 2000,
      code_hash: hashForDb(openCode),
    });
    if (invitation.error) throw new Error(invitation.error.message);
  } catch (error) {
    // No half-built events: remove the row (children cascade) and report.
    await db.from("events").delete().eq("id", event.id);
    throw error;
  }

  await audit({
    actorId: userId,
    actorKind: "host",
    action: "event.created",
    eventId: event.id,
    metadata: { kind: input.kind, template_id: template.id, template_version: template.version },
  });
  return { ...event, openCode };
}

// Content must also fit the template it was made for: only its field keys,
// each within the field's own length, and a palette / font pair it offers.
function fitTemplate(template: Template | null, content: EventContent, theme: EventTheme): boolean {
  if (!template) return true;
  const fields = new Map(template.fields.map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(content.fields)) {
    const def = fields.get(key);
    if (!def) return false;
    if (Array.from(value.ar).length > def.maxLength || Array.from(value.en).length > def.maxLength) return false;
  }
  if (theme.palette && !template.palettes.some((p) => p.id === theme.palette)) return false;
  if (theme.fontPair && !template.fontPairs.some((f) => f.id === theme.fontPair)) return false;
  const ids = new Set(content.blocks.map((b) => b.id));
  return ids.size === content.blocks.length;
}

export async function saveDraft(
  db: AdminClient,
  actor: Actor,
  eventId: string,
  rawContent: unknown,
  rawTheme: unknown,
): Promise<{ savedAt: string }> {
  const event = await loadEventFor(db, actor, eventId);
  if (event.status === "archived") throw new HostError("bad_status");

  const content = contentSchema.safeParse(rawContent);
  const theme = themeSchema.safeParse(rawTheme);
  if (!content.success || !theme.success) throw new HostError("invalid_content");
  const template = getTemplate(event.template_id, event.template_version);
  if (!fitTemplate(template, content.data, theme.data)) throw new HostError("invalid_content");

  const { data, error } = await db
    .from("events")
    .update({ content: content.data as unknown as Json, theme: theme.data as Json })
    .eq("id", event.id)
    .select("updated_at")
    .single();
  // The table caps the stored size; anything it refuses is a content problem.
  if (error || !data) throw new HostError("invalid_content");
  return { savedAt: data.updated_at };
}

const localDateTime = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]);

export const settingsInputSchema = z.object({
  startsAt: localDateTime,
  endsAt: localDateTime,
  timezone: z.enum(TIMEZONES),
  defaultLocale: z.enum(["ar", "en"]),
  rosterVisible: z.boolean(),
  sharingEnabled: z.boolean(),
  openLinkApproval: z.boolean(),
  photosHostOnly: z.boolean(),
  lockTeams: z.boolean(),
  rsvpDeadline: localDateTime,
  passcode: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("keep") }),
    z.object({ mode: z.literal("clear") }),
    z.object({ mode: z.literal("set"), value: z.string().min(PASSCODE_MIN_LENGTH).max(PASSCODE_MAX_LENGTH) }),
  ]),
});
export type SettingsInput = z.infer<typeof settingsInputSchema>;

const LIVE_STATUSES = ["published", "postponed", "cancelled", "ended"];

// Returns the slug when the event is live, so the caller can refresh the cached page.
export async function updateSettings(
  db: AdminClient,
  actor: Actor,
  eventId: string,
  raw: unknown,
): Promise<{ liveSlug: string | null }> {
  const event = await loadEventFor(db, actor, eventId);
  const parsed = settingsInputSchema.safeParse(raw);
  if (!parsed.success) throw new HostError("invalid");
  const input = parsed.data;

  const toIso = (local: string) => (local === "" ? null : zonedToIso(local, input.timezone));
  const startsAt = toIso(input.startsAt);
  const endsAt = toIso(input.endsAt);
  const rsvpDeadline = toIso(input.rsvpDeadline);
  if (startsAt && endsAt && endsAt < startsAt) throw new HostError("invalid", { field: "endsAt" });

  const settings = settingsSchema.parse({
    rosterVisible: input.rosterVisible,
    sharingEnabled: input.sharingEnabled,
    openLinkApproval: input.openLinkApproval,
    photosHostOnly: input.photosHostOnly,
    lockTeams: input.lockTeams,
    rsvpDeadline,
  });

  const passcode =
    input.passcode.mode === "set"
      ? { passcode_hash: await hashPasscode(input.passcode.value) }
      : input.passcode.mode === "clear"
        ? { passcode_hash: null }
        : {};

  const { error } = await db
    .from("events")
    .update({
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: input.timezone,
      default_locale: input.defaultLocale,
      settings: settings as Json,
      ...passcode,
    })
    .eq("id", event.id);
  if (error) throw new Error(`settings update failed: ${error.message}`);

  await audit({
    ...auditActor(actor),
    action: "event.settings_updated",
    eventId: event.id,
    // Never the passcode itself, only that it changed.
    metadata: { passcode: input.passcode.mode },
  });
  return { liveSlug: LIVE_STATUSES.includes(event.status) ? event.slug : null };
}

// Required template fields with no value in either language.
export function missingRequired(template: Template, content: EventContent): string[] {
  return template.fields
    .filter((f) => f.required)
    .filter((f) => {
      const value = content.fields[f.key];
      return !value || (value.ar.trim() === "" && value.en.trim() === "");
    })
    .map((f) => f.key);
}

// Copies the validated draft to the published columns. Needs a plan, which only
// payment settlement can attach (security P1, rule 32).
export async function publishEvent(
  db: AdminClient,
  actor: Actor,
  eventId: string,
): Promise<{ slug: string; version: number }> {
  const event = await loadEventFor(db, actor, eventId, { ownerOnly: true });
  if (!event.plan_id) throw new HostError("no_plan");
  if (event.status !== "draft" && event.status !== "published") throw new HostError("bad_status");

  const { data: paid } = await db
    .from("orders")
    .select("id")
    .eq("event_id", event.id)
    .eq("status", "paid")
    .maybeSingle();
  if (!paid) throw new HostError("no_plan");

  const content = contentSchema.safeParse(event.content);
  if (!content.success) throw new HostError("invalid_content");
  const template = getTemplate(event.template_id, event.template_version);
  if (!template) throw new HostError("invalid_content");
  const missing = missingRequired(template, content.data);
  if (missing.length > 0) throw new HostError("missing_required", { fields: missing });

  const split = splitForPublish(content.data);
  const version = event.published_version + 1;
  // One statement re-checks plan, status and version, so a refund that removes
  // the plan or a second publish in flight cannot slip between check and write.
  const { data: updated, error } = await db
    .from("events")
    .update({
      published_content: { public: split.public, guest: split.guest, order: split.order } as unknown as Json,
      published_version: version,
      status: "published",
    })
    .eq("id", event.id)
    .eq("published_version", event.published_version)
    .in("status", ["draft", "published"])
    .not("plan_id", "is", null)
    .select("slug, published_version")
    .maybeSingle();
  if (error) throw new Error(`publish failed: ${error.message}`);
  if (!updated) throw new HostError("bad_status");

  await audit({
    ...auditActor(actor),
    action: "event.published",
    eventId: event.id,
    metadata: { version, plan_id: event.plan_id },
  });
  return { slug: updated.slug, version: updated.published_version };
}

async function changeStatus(
  db: AdminClient,
  actor: Actor,
  eventId: string,
  from: string[],
  to: "postponed" | "cancelled",
): Promise<{ slug: string }> {
  const event = await loadEventFor(db, actor, eventId, { ownerOnly: true });
  const { data: updated, error } = await db
    .from("events")
    .update({ status: to })
    .eq("id", event.id)
    .in("status", from)
    .select("slug")
    .maybeSingle();
  if (error) throw new Error(`status change failed: ${error.message}`);
  if (!updated) throw new HostError("bad_status");
  await audit({ ...auditActor(actor), action: `event.${to}`, eventId: event.id, metadata: { from: event.status } });
  return { slug: updated.slug };
}

export function postponeEvent(db: AdminClient, actor: Actor, eventId: string) {
  return changeStatus(db, actor, eventId, ["published"], "postponed");
}

export function cancelEvent(db: AdminClient, actor: Actor, eventId: string) {
  return changeStatus(db, actor, eventId, ["published", "postponed"], "cancelled");
}
