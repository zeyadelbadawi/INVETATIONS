// Puts photos into the demo invitations through the product's own content-image
// pipeline (quarantine upload → type check → re-encode → clean bucket), then
// adds them to each demo's gallery, sets the link preview image and republishes.
//
// Run as a server script (resolves "server-only" to its server build):
//   NODE_OPTIONS=--conditions=react-server npx -y tsx --tsconfig tsconfig.json \
//     tools/demo/upload-demo-photos.ts <photos-dir>
// with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY of the target project in the environment.
// Files are named <set>-<label>.webp; the sets map to demo slugs below.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contentSchema, splitForPublish, type Block } from "@/content/schema";
import { newBlock } from "@/templates/registry";
import { adminDb } from "@/lib/supabase/admin";
import { completeContentUpload, createContentUpload } from "@/lib/media/content";

const dir = process.argv[2];
if (!dir) throw new Error("usage: upload-demo-photos.ts <photos-dir>");

const DEMOS: { slug: string; photos: string[]; preview: string }[] = [
  {
    slug: "demo-wedding",
    photos: ["wedding-garden-walk", "wedding-rings", "wedding-henna-bouquet", "wedding-reception-table", "wedding-veil-doors", "wedding-cake", "wedding-cufflinks", "wedding-zaffa-drums", "wedding-sparklers"],
    preview: "wedding-garden-walk",
  },
  { slug: "demo-gender-reveal", photos: ["reveal-corp-gift-box", "reveal-corp-baby-shoes", "reveal-corp-balloons", "reveal-corp-cake", "reveal-corp-nursery"], preview: "reveal-corp-gift-box" },
  { slug: "demo-corporate", photos: ["reveal-corp-audience", "reveal-corp-speaker", "reveal-corp-coffee-break", "reveal-corp-trophies"], preview: "reveal-corp-audience" },
];

async function upload(eventId: string, file: string): Promise<string> {
  const slot = await createContentUpload(eventId);
  if (!slot.ok) throw new Error(`no upload slot: ${slot.reason}`);
  const bytes = readFileSync(join(dir, `${file}.webp`));
  const put = await adminDb().storage.from("quarantine").uploadToSignedUrl(`${eventId}/${slot.slot.mediaId}`, slot.slot.token, bytes, { contentType: "image/webp" });
  if (put.error) throw new Error(`upload failed: ${put.error.message}`);
  const done = await completeContentUpload(eventId, slot.slot.mediaId);
  if (!done.ok) throw new Error(`processing refused ${file}: ${done.reason}`);
  return slot.slot.mediaId;
}

async function main() {
for (const demo of DEMOS) {
  const db = adminDb();
  const { data: event, error } = await db.from("events").select("id, content, published_version").eq("slug", demo.slug).single();
  if (error || !event) throw new Error(`${demo.slug} not found`);
  const ids: Record<string, string> = {};
  for (const photo of demo.photos) ids[photo] = await upload(event.id, photo);

  const content = contentSchema.parse(event.content);
  const images = demo.photos.map((p) => ids[p]);
  let blocks: Block[] = content.blocks.filter((b) => b.type !== "gallery");
  const gallery = { ...(newBlock("gallery", true) as Extract<Block, { type: "gallery" }>), images };
  // The gallery sits after the programme / story, before the location.
  const at = blocks.findIndex((b) => b.type === "location");
  blocks = at === -1 ? [...blocks, gallery] : [...blocks.slice(0, at), gallery, ...blocks.slice(at)];
  const next = contentSchema.parse({ ...content, blocks, preview: { ...content.preview, image: ids[demo.preview] } });
  const split = splitForPublish(next);
  const { error: saveError } = await db
    .from("events")
    .update({
      content: next,
      published_content: { public: split.public, guest: split.guest, order: split.order },
      published_version: event.published_version + 1,
    })
    .eq("id", event.id);
  if (saveError) throw new Error(`save failed: ${saveError.message}`);
  console.log(`${demo.slug}: ${images.length} photos, preview set`);
}
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
