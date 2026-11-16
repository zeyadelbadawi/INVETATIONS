import "server-only";
import type { Block } from "@/content/schema";
import { adminDb } from "@/lib/supabase/admin";
import { processMedia, signedMediaUrls } from "@/lib/media/process";
import { enqueue } from "@/lib/jobs/runner";
import "@/lib/jobs/register";

// Images the host puts in the content: gallery, people photos and the link
// preview. Same path as guest media (security C2, rules 30-31): a signed upload
// into quarantine, then verification and re-encoding into the clean bucket by
// processMedia. Callers authorise the host first (requireEventAccess).

export const CONTENT_IMAGE_LIMITS = {
  // Matches the quarantine bucket's own limit.
  uploadBytes: 2_000_000,
  // Gallery (24) + people (24 per block) + preview, with room for replacements.
  perEvent: 150,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UploadSlot = { mediaId: string; uploadUrl: string; token: string };

export type SlotResult = { ok: true; slot: UploadSlot } | { ok: false; reason: "quota" };

// Issues a one-time upload slot. Caps are checked here, before any bytes arrive.
export async function createContentUpload(eventId: string): Promise<SlotResult> {
  const db = adminDb();
  const { count } = await db
    .from("media")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("purpose", "content_image")
    .neq("state", "rejected");
  if ((count ?? 0) >= CONTENT_IMAGE_LIMITS.perEvent) return { ok: false, reason: "quota" };

  const id = crypto.randomUUID();
  const path = `${eventId}/${id}`;
  const { error } = await db
    .from("media")
    .insert({ id, event_id: eventId, player_id: null, purpose: "content_image", quarantine_path: path });
  if (error) throw new Error(`media insert failed: ${error.message}`);
  const signed = await db.storage.from("quarantine").createSignedUploadUrl(path);
  if (signed.error || !signed.data) throw new Error(`signed upload failed: ${signed.error?.message}`);
  return { ok: true, slot: { mediaId: id, uploadUrl: signed.data.signedUrl, token: signed.data.token } };
}

export type CompleteResult = { ok: true; state: "processed" } | { ok: false; reason: "not_found" | "rejected" };

// Marks the upload as arrived and processes it now, so the host sees the result
// straight away. The queued job stays as a retry if processing fails midway.
export async function completeContentUpload(eventId: string, mediaId: string): Promise<CompleteResult> {
  if (!UUID.test(mediaId)) return { ok: false, reason: "not_found" };
  const db = adminDb();
  const { data: media } = await db
    .from("media")
    .update({ state: "uploaded" })
    .eq("id", mediaId)
    .eq("event_id", eventId)
    .eq("purpose", "content_image")
    .is("player_id", null)
    .eq("state", "pending_upload")
    .select("id")
    .maybeSingle();
  if (!media) return { ok: false, reason: "not_found" };
  await enqueue("media.process", media.id, { mediaId: media.id });
  const result = await processMedia(media.id);
  if (result === "processed") return { ok: true, state: "processed" };
  if (result === "rejected") return { ok: false, reason: "rejected" };
  // Picked up concurrently by the job runner: report what the row says.
  const { data: row } = await db.from("media").select("state").eq("id", media.id).eq("event_id", eventId).maybeSingle();
  return row?.state === "processed" ? { ok: true, state: "processed" } : { ok: false, reason: "rejected" };
}

// Short-lived URLs for processed content images of this event. Only ids the
// caller has already established it may show are passed in.
export async function signContentImages(eventId: string, mediaIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(mediaIds)].filter((id) => UUID.test(id)).slice(0, 100);
  if (ids.length === 0) return {};
  const { data: rows } = await adminDb()
    .from("media")
    .select("id, clean_path")
    .eq("event_id", eventId)
    .in("id", ids)
    .eq("purpose", "content_image")
    .eq("state", "processed");
  const ready = (rows ?? []).filter((r): r is { id: string; clean_path: string } => typeof r.clean_path === "string");
  const urls = await signedMediaUrls(ready.map((r) => r.clean_path));
  const out: Record<string, string> = {};
  for (const r of ready) {
    const url = urls.get(r.clean_path);
    if (url) out[r.id] = url;
  }
  return out;
}

// Every media id a list of blocks points at: gallery images and people photos.
export function referencedImages(blocks: Block[]): string[] {
  const ids: string[] = [];
  for (const block of blocks) {
    if (block.type === "gallery") ids.push(...block.images);
    if (block.type === "people") for (const item of block.items) if (item.photo) ids.push(item.photo);
  }
  return [...new Set(ids)];
}

export type PreviewImage = { bytes: Buffer; mime: string; width: number | null; height: number | null };

async function previewRow(eventId: string, mediaId: string | null | undefined) {
  if (!mediaId || !UUID.test(mediaId)) return null;
  const { data } = await adminDb()
    .from("media")
    .select("id, clean_path, mime, width, height")
    .eq("event_id", eventId)
    .eq("id", mediaId)
    .eq("purpose", "content_image")
    .eq("state", "processed")
    .maybeSingle();
  if (!data?.clean_path || !data.mime?.startsWith("image/")) return null;
  return data as { id: string; clean_path: string; mime: string; width: number | null; height: number | null };
}

// Size of the link-preview image, for the page's metadata. Null when the event
// has none or it is not ready.
export async function previewImageInfo(event: { id: string; preview: { image?: string | null } | null | undefined }): Promise<{ width: number | null; height: number | null } | null> {
  const row = await previewRow(event.id, event.preview?.image);
  return row ? { width: row.width, height: row.height } : null;
}

// The bytes of the event's link-preview image: only the one media id that the
// event's published preview names, only if it belongs to the event, is a
// processed content image, and has a server-set image type.
export async function readPreviewImage(event: { id: string; preview: { image?: string | null } | null | undefined }): Promise<PreviewImage | null> {
  const row = await previewRow(event.id, event.preview?.image);
  if (!row) return null;
  const { data: blob, error } = await adminDb().storage.from("media").download(row.clean_path);
  if (error || !blob) return null;
  return { bytes: Buffer.from(await blob.arrayBuffer()), mime: row.mime, width: row.width, height: row.height };
}
