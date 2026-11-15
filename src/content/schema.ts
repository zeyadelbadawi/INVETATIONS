// The shape of an event's content: template field values plus an ordered list of
// blocks. Parsed with these schemas on every read and write (security C1) —
// content is data, never markup.
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

// Text in both languages. Either may be empty; the renderer falls back to the other.
export const localized = (max: number) => z.object({ ar: text(max).default(""), en: text(max).default("") });
export type Localized = { ar: string; en: string };

const isoDateTime = z.iso.datetime({ offset: true });
const id = z.string().regex(/^[a-z0-9]{6,16}$/);
const mediaId = z.uuid();

// Only web, phone and mail links; the URL is re-parsed at render time too.
export const safeLink = z
  .string()
  .max(300)
  .refine((value) => {
    try {
      return ["https:", "tel:", "mailto:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "unsupported link");

const base = { id, enabled: z.boolean().default(true) };

export const blockSchemas = {
  details: z.object({
    ...base,
    type: z.literal("details"),
    startsAt: isoDateTime.nullable().default(null),
    doorsAt: isoDateTime.nullable().default(null),
    venue: localized(120),
    city: localized(80),
  }),
  countdown: z.object({ ...base, type: z.literal("countdown") }),
  programme: z.object({
    ...base,
    type: z.literal("programme"),
    title: localized(80),
    items: z
      .array(z.object({ id, time: text(20), title: localized(120), note: localized(200) }))
      .max(40)
      .default([]),
  }),
  // Exact place. Guest-only: served after a session, never in the public shell.
  location: z.object({
    ...base,
    type: z.literal("location"),
    label: localized(120),
    address: localized(300),
    lat: z.number().min(-90).max(90).nullable().default(null),
    lng: z.number().min(-180).max(180).nullable().default(null),
    parking: localized(300),
  }),
  story: z.object({ ...base, type: z.literal("story"), title: localized(80), body: localized(1500) }),
  families: z.object({
    ...base,
    type: z.literal("families"),
    sides: z.array(z.object({ id, title: localized(80), names: localized(300) })).max(4).default([]),
  }),
  gallery: z.object({ ...base, type: z.literal("gallery"), images: z.array(mediaId).max(24).default([]) }),
  quote: z.object({ ...base, type: z.literal("quote"), body: localized(500), source: localized(120) }),
  dress_code: z.object({
    ...base,
    type: z.literal("dress_code"),
    note: localized(300),
    colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(6).default([]),
  }),
  notes: z.object({
    ...base,
    type: z.literal("notes"),
    title: localized(80),
    items: z.array(z.object({ id, body: localized(300) })).max(12).default([]),
  }),
  faq: z.object({
    ...base,
    type: z.literal("faq"),
    items: z.array(z.object({ id, question: localized(160), answer: localized(600) })).max(20).default([]),
  }),
  people: z.object({
    ...base,
    type: z.literal("people"),
    title: localized(80),
    items: z
      .array(z.object({ id, name: localized(80), role: localized(120), photo: mediaId.nullable().default(null) }))
      .max(24)
      .default([]),
  }),
  contact: z.object({
    ...base,
    type: z.literal("contact"),
    name: localized(80),
    phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/).nullable().default(null),
    link: safeLink.nullable().default(null),
  }),
} as const;

export type BlockType = keyof typeof blockSchemas;
export const blockTypes = Object.keys(blockSchemas) as BlockType[];

export const blockSchema = z.discriminatedUnion("type", [
  blockSchemas.details,
  blockSchemas.countdown,
  blockSchemas.programme,
  blockSchemas.location,
  blockSchemas.story,
  blockSchemas.families,
  blockSchemas.gallery,
  blockSchemas.quote,
  blockSchemas.dress_code,
  blockSchemas.notes,
  blockSchemas.faq,
  blockSchemas.people,
  blockSchemas.contact,
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

// Which blocks may appear in the cached public page. Everything else needs a
// guest session or the passcode (security V1).
export const GUEST_ONLY_BLOCKS: ReadonlySet<BlockType> = new Set(["location", "gallery", "families", "programme", "people", "contact"]);

export const contentSchema = z.object({
  // Values for the template's fields, keyed by field key.
  fields: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), localized(160)).default({}),
  blocks: z.array(blockSchema).max(30).default([]),
  music: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable().default(null),
  preview: z
    .object({ title: localized(80), description: localized(160), image: mediaId.nullable().default(null) })
    .default({ title: { ar: "", en: "" }, description: { ar: "", en: "" }, image: null }),
});
export type EventContent = z.infer<typeof contentSchema>;

// Theme stores ids chosen from the template, never colours or CSS (security C1).
export const themeSchema = z.object({
  palette: z.string().regex(/^[a-z0-9-]{1,32}$/).optional(),
  fontPair: z.string().regex(/^[a-z0-9-]{1,32}$/).optional(),
});
export type EventTheme = z.infer<typeof themeSchema>;

export const settingsSchema = z.object({
  rosterVisible: z.boolean().default(true),
  sharingEnabled: z.boolean().default(true),
  openLinkApproval: z.boolean().default(true),
  photosHostOnly: z.boolean().default(false),
  rsvpDeadline: isoDateTime.nullable().default(null),
  lockTeams: z.boolean().default(false),
});
export type EventSettings = z.infer<typeof settingsSchema>;

export type PublishedContent = {
  public: { fields: EventContent["fields"]; blocks: Block[]; music: string | null; preview: EventContent["preview"] };
  guest: { blocks: Block[] };
};

// Splits validated content into the part anyone with the link may see and the
// part reserved for guests. Order is preserved through each block's position.
export function splitForPublish(content: EventContent): PublishedContent & { order: string[] } {
  const enabled = content.blocks.filter((b) => b.enabled);
  return {
    public: {
      fields: content.fields,
      blocks: enabled.filter((b) => !GUEST_ONLY_BLOCKS.has(b.type)),
      music: content.music,
      preview: content.preview,
    },
    guest: { blocks: enabled.filter((b) => GUEST_ONLY_BLOCKS.has(b.type)) },
    order: enabled.map((b) => b.id),
  };
}

export function pick(value: Localized | undefined, locale: "ar" | "en"): string {
  if (!value) return "";
  return value[locale] || value[locale === "ar" ? "en" : "ar"] || "";
}

export function parseContent(raw: unknown): EventContent {
  const parsed = contentSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : contentSchema.parse({});
}
