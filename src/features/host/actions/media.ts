"use server";

import { z } from "zod";
import { requireEventAccess } from "@/lib/events/access";
import { completeContentUpload, CONTENT_IMAGE_LIMITS, createContentUpload, signContentImages } from "@/lib/media/content";
import { withinLimit } from "@/lib/security/rate-limit";
import { adminDb } from "@/lib/supabase/admin";
import { HostError, type ActionResult } from "../lib/errors";
import { run } from "../lib/run";

// Images in the host's content (gallery, people photos, link preview). The
// browser downscales first; the file then goes to the quarantine bucket through
// a one-time signed URL and is verified and re-encoded on the server before
// anyone sees it (security C2, rules 30-31).

const eventId = z.uuid();
const slotInput = z.object({
  bytes: z.number().int().positive().max(CONTENT_IMAGE_LIMITS.uploadBytes),
  type: z.enum(["image/jpeg", "image/webp", "image/png"]),
});
const UPLOADS_PER_HOUR = { windowSeconds: 3600, max: 150 };

async function editableEvent(id: string): Promise<void> {
  const { data } = await adminDb().from("events").select("status").eq("id", id).maybeSingle();
  if (!data) throw new HostError("not_found");
  if (data.status === "archived") throw new HostError("bad_status");
}

export async function requestImageUpload(id: string, input: { bytes: number; type: string }): Promise<ActionResult<{ mediaId: string; uploadUrl: string }>> {
  return run("requestImageUpload", async () => {
    const event = eventId.safeParse(id);
    if (!event.success) throw new HostError("not_found");
    const actor = await requireEventAccess(event.data, "edit_content");
    if (!slotInput.safeParse(input).success) throw new HostError("invalid");
    await editableEvent(event.data);
    if (!(await withinLimit(`cimg:${actor.userId}`, UPLOADS_PER_HOUR))) throw new HostError("too_many_rows");
    const result = await createContentUpload(event.data);
    if (!result.ok) throw new HostError("too_many_rows");
    return { mediaId: result.slot.mediaId, uploadUrl: result.slot.uploadUrl };
  });
}

export async function completeImageUpload(id: string, mediaId: string): Promise<ActionResult<{ mediaId: string }>> {
  return run("completeImageUpload", async () => {
    const event = eventId.safeParse(id);
    if (!event.success) throw new HostError("not_found");
    await requireEventAccess(event.data, "edit_content");
    const media = z.uuid().safeParse(mediaId);
    if (!media.success) throw new HostError("not_found");
    const result = await completeContentUpload(event.data, media.data);
    if (!result.ok) throw new HostError(result.reason === "rejected" ? "invalid" : "not_found");
    return { mediaId: media.data };
  });
}

// Ten-minute links so the editor can show thumbnails. This event's processed
// content images only.
export async function contentImageUrls(id: string, mediaIds: string[]): Promise<ActionResult<{ urls: Record<string, string> }>> {
  return run("contentImageUrls", async () => {
    const event = eventId.safeParse(id);
    if (!event.success) throw new HostError("not_found");
    await requireEventAccess(event.data, "edit_content");
    const ids = z.array(z.uuid()).max(100).safeParse(mediaIds);
    if (!ids.success) return { urls: {} };
    return { urls: await signContentImages(event.data, ids.data) };
  });
}
