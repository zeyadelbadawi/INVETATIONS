// The message contract between the editor (parent window) and the preview
// iframe at /preview/[eventId]. The iframe is sandboxed with an opaque origin,
// so it can neither call authenticated APIs nor read cookies: the draft is the
// only thing it ever receives, and it is schema-parsed before use (security C1, rule 16).
import { z } from "zod";
import { contentSchema, settingsSchema, themeSchema } from "@/content/schema";

export const PREVIEW_READY = "lamma:preview-ready" as const;
export const PREVIEW_DRAFT = "lamma:draft" as const;

const isoDateTime = z.iso.datetime({ offset: true });

export const draftMessageSchema = z.object({
  type: z.literal(PREVIEW_DRAFT),
  content: contentSchema,
  theme: themeSchema,
  templateId: z.string().regex(/^[a-z0-9-]{1,64}$/),
  templateVersion: z.number().int().positive(),
  kind: z.enum(["wedding", "gender_reveal", "corporate"]),
  locale: z.enum(["ar", "en"]),
  // Optional: event-level values the blocks fall back to.
  startsAt: isoDateTime.nullable().optional(),
  endsAt: isoDateTime.nullable().optional(),
  timezone: z.string().max(64).optional(),
  status: z.enum(["published", "postponed", "cancelled", "ended"]).optional(),
  settings: settingsSchema.partial().optional(),
  // Optional: which sample state the interactive parts show.
  demo: z
    .object({
      joined: z.boolean().optional(),
      reveal: z.enum(["idle", "countdown", "open", "result"]).optional(),
      revealStyle: z.enum(["balloon", "scratch"]).optional(),
      answer: z.array(z.enum(["boy", "girl"])).min(1).max(3).optional(),
      sections: z.boolean().optional(),
    })
    .optional(),
});
export type DraftMessage = z.infer<typeof draftMessageSchema>;
