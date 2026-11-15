import "server-only";
import sharp from "sharp";
import { adminDb } from "@/lib/supabase/admin";
import { sniff } from "@/lib/media/sniff";

const MAX_INPUT_PIXELS = 40_000_000;   // refuses decompression bombs before decoding
const MAX_EDGE = 1600;
const MAX_AUDIO_BYTES = 1_500_000;     // about a minute of voice; the real duration control

// Moves one upload from quarantine to the clean bucket: verify the real type,
// re-encode images (which drops EXIF, GPS and any trailing data), set the
// content type on the server, and only then let anything be served (security C2).
export async function processMedia(mediaId: string): Promise<"processed" | "rejected" | "skipped"> {
  const db = adminDb();
  const { data: media } = await db
    .from("media")
    .select("id, event_id, purpose, quarantine_path, state")
    .eq("id", mediaId)
    .maybeSingle();
  if (!media || media.state !== "uploaded") return "skipped";

  const reject = async () => {
    await db.storage.from("quarantine").remove([media.quarantine_path]);
    await db.from("media").update({ state: "rejected" }).eq("id", media.id);
    await db.from("wall_posts").update({ status: "hidden" }).eq("event_id", media.event_id).eq("media_id", media.id);
    return "rejected" as const;
  };

  const { data: blob, error } = await db.storage.from("quarantine").download(media.quarantine_path);
  if (error || !blob) return reject();
  const input = Buffer.from(await blob.arrayBuffer());
  const detected = sniff(input);
  if (!detected) return reject();

  const wantsImage = media.purpose !== "wall_voice";
  if (wantsImage !== (detected.kind === "image")) return reject();

  let output: Buffer;
  let mime: string;
  let width: number | null = null;
  let height: number | null = null;

  if (detected.kind === "image") {
    try {
      const pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, pages: 1, failOn: "error" })
        .rotate() // apply orientation before the metadata is dropped
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 });
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      output = data;
      mime = "image/webp";
      width = info.width;
      height = info.height;
    } catch {
      return reject();
    }
  } else {
    if (input.length > MAX_AUDIO_BYTES) return reject();
    output = input;
    mime = detected.mime;
  }

  const cleanPath = `${media.event_id}/${media.id}`;
  const upload = await db.storage.from("media").upload(cleanPath, output, { contentType: mime, upsert: true });
  if (upload.error) throw new Error(`clean upload failed: ${upload.error.message}`);

  await db
    .from("media")
    .update({ state: "processed", clean_path: cleanPath, mime, bytes: output.length, width, height })
    .eq("id", media.id);
  await db.storage.from("quarantine").remove([media.quarantine_path]);
  return "processed";
}

// Uploads that were never completed or processed are removed after an hour.
export async function sweepQuarantine(): Promise<number> {
  const db = adminDb();
  const cutoff = new Date(Date.now() - 3600_000).toISOString();
  const { data: stale } = await db
    .from("media")
    .select("id, quarantine_path")
    .in("state", ["pending_upload", "uploaded"])
    .lt("created_at", cutoff)
    .limit(200);
  if (!stale || stale.length === 0) return 0;
  await db.storage.from("quarantine").remove(stale.map((m) => m.quarantine_path));
  await db.from("media").update({ state: "rejected" }).in("id", stale.map((m) => m.id));
  return stale.length;
}

const SIGNED_URL_SECONDS = 600;

// Short-lived read URLs, issued only for processed media the caller may see.
export async function signedMediaUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data } = await adminDb().storage.from("media").createSignedUrls(paths, SIGNED_URL_SECONDS);
  for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}
