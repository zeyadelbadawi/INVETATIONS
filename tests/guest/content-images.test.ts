// Host content images (security C2, V1, rules 15 and 30): uploaded to
// quarantine, re-encoded, and served to guests only when the event's
// published content references them; the preview route serves one file only.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  jar: new Map<string, { value: string; options?: Record<string, unknown> }>(),
  events: new Map<string, unknown>(),
}));
vi.mock("next/headers", async () => {
  const { makeCookieStore } = await import("./route-helpers");
  return { cookies: async () => makeCookieStore(state.jar) };
});
vi.mock("@/lib/events/published", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/events/published")>();
  return { ...actual, getPublicEvent: async (slug: string) => state.events.get(slug) ?? null };
});

import sharp from "sharp";
import { admin } from "../db/helpers";
import { makeGuest, makeLiveEvent } from "./fixtures";
import { ctx, get, sessionToken } from "./route-helpers";
import { contentSchema, splitForPublish, type EventContent } from "@/content/schema";
import type { PublicEvent } from "@/lib/events/published";
import { joinAsNewPlayer } from "@/lib/guest/join";
import { readGuestDetails } from "@/lib/guest/details";
import { sessionCookieName } from "@/lib/guest/session";
import { completeContentUpload, createContentUpload, readPreviewImage, referencedImages, signContentImages } from "@/lib/media/content";
import { GET as ogGet } from "@/app/api/og/[slug]/route";
import { GET as meGet } from "@/app/api/guest/[slug]/me/route";

async function photo(withGps = false): Promise<Buffer> {
  let image = sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#336699" } });
  if (withGps) image = image.withExif({ IFD0: { Make: "TestCam", Copyright: "secret-owner" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "30/1 2/1 40/1" } });
  return image.jpeg().toBuffer();
}

// The browser's path: a slot, a PUT to the signed URL, then completion.
async function hostUpload(eventId: string, bytes: Buffer, contentType = "image/jpeg") {
  const slot = await createContentUpload(eventId);
  if (!slot.ok) throw new Error("no slot");
  const put = await fetch(slot.slot.uploadUrl, { method: "PUT", body: new Uint8Array(bytes), headers: { "Content-Type": contentType } });
  expect(put.ok).toBe(true);
  return { mediaId: slot.slot.mediaId, done: await completeContentUpload(eventId, slot.slot.mediaId) };
}

async function publish(event: PublicEvent, raw: unknown): Promise<PublicEvent> {
  const content: EventContent = contentSchema.parse(raw);
  const split = splitForPublish(content);
  await admin.from("events").update({ published_content: { public: split.public, guest: split.guest, order: split.order } }).eq("id", event.id);
  const next: PublicEvent = { ...event, blocks: split.public.blocks, order: split.order, preview: split.public.preview };
  state.events.set(next.slug, next);
  return next;
}

const L = (v: string) => ({ ar: v, en: v });
const gallery = (images: string[]) => ({ id: "blkgallery", type: "gallery", images });
const people = (photoId: string | null) => ({ id: "blkpeople1", type: "people", title: L(""), items: [{ id: "person0001", name: L("Mona"), role: L(""), photo: photoId }] });
const preview = (image: string | null) => ({ title: L("T"), description: L("D"), image });

beforeEach(() => state.jar.clear());

describe("host upload pipeline", () => {
  it("uploads to quarantine, re-encodes, strips metadata and records a content image with no player", async () => {
    const { event } = await makeLiveEvent("wedding");
    const { mediaId, done } = await hostUpload(event.id, await photo(true));
    expect(done).toEqual({ ok: true, state: "processed" });
    const { data: row } = await admin.from("media").select("purpose, player_id, state, mime, width, height, clean_path, quarantine_path").eq("id", mediaId).single();
    expect(row).toMatchObject({ purpose: "content_image", player_id: null, state: "processed", mime: "image/webp" });
    expect(Math.max(row!.width!, row!.height!)).toBeLessThanOrEqual(1600);
    const clean = Buffer.from(await (await admin.storage.from("media").download(row!.clean_path!)).data!.arrayBuffer());
    expect((await sharp(clean).metadata()).exif).toBeUndefined();
    expect(clean.includes("secret-owner")).toBe(false);
    expect((await admin.storage.from("quarantine").download(row!.quarantine_path)).error).not.toBeNull();
    // A job was queued too, as a retry path; it finds nothing left to do.
    const { data: job } = await admin.from("jobs").select("kind").eq("kind", "media.process").eq("ref", mediaId).maybeSingle();
    expect(job).not.toBeNull();
  });

  it("rejects HTML posing as an image and never completes twice", async () => {
    const { event } = await makeLiveEvent("wedding");
    const html = Buffer.from("<html><script>alert(document.cookie)</script></html>".padEnd(200));
    const { mediaId, done } = await hostUpload(event.id, html, "image/jpeg");
    expect(done).toEqual({ ok: false, reason: "rejected" });
    expect(await completeContentUpload(event.id, mediaId)).toEqual({ ok: false, reason: "not_found" });
    const { data } = await admin.from("media").select("state, clean_path").eq("id", mediaId).single();
    expect(data).toEqual({ state: "rejected", clean_path: null });
  });

  it("cannot complete another event's upload or a guest's wall upload", async () => {
    const { event: a } = await makeLiveEvent("wedding");
    const { event: b } = await makeLiveEvent("wedding");
    const slot = await createContentUpload(a.id);
    if (!slot.ok) throw new Error("no slot");
    expect(await completeContentUpload(b.id, slot.slot.mediaId)).toEqual({ ok: false, reason: "not_found" });

    const guest = await makeGuest(a, "group");
    const joined = await joinAsNewPlayer(a, guest, { name: "Nour", teamKey: "bride" });
    if (!joined.ok) throw new Error("join failed");
    const wallId = crypto.randomUUID();
    await admin.from("media").insert({ id: wallId, event_id: a.id, player_id: joined.player.id, purpose: "wall_photo", quarantine_path: `${a.id}/${wallId}` });
    expect(await completeContentUpload(a.id, wallId)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("guest delivery", () => {
  let event: PublicEvent;
  let referenced: string;
  let unreferenced: string;
  let personPhoto: string;
  let foreign: string;
  let wallPhoto: string;

  beforeAll(async () => {
    ({ event } = await makeLiveEvent("wedding"));
    referenced = (await hostUpload(event.id, await photo())).mediaId;
    unreferenced = (await hostUpload(event.id, await photo())).mediaId;
    personPhoto = (await hostUpload(event.id, await photo())).mediaId;
    const { event: other } = await makeLiveEvent("wedding");
    foreign = (await hostUpload(other.id, await photo())).mediaId;

    // A processed guest wall photo of this event: never a content image.
    const guest = await makeGuest(event, "group");
    const joined = await joinAsNewPlayer(event, guest, { name: "Salma", teamKey: "bride" });
    if (!joined.ok) throw new Error("join failed");
    wallPhoto = crypto.randomUUID();
    await admin.from("media").insert({
      id: wallPhoto, event_id: event.id, player_id: joined.player.id, purpose: "wall_photo", quarantine_path: `${event.id}/${wallPhoto}`,
      state: "processed", clean_path: `${event.id}/${referenced}`, mime: "image/webp",
    });

    // The gallery names the referenced image and, by tampering, another
    // event's image; the people block names the person photo.
    event = await publish(event, { blocks: [gallery([referenced, foreign]), people(personPhoto)], preview: preview(referenced) });
  });

  it("signs only images the published guest blocks reference, of this event", async () => {
    const details = await readGuestDetails(event);
    expect(Object.keys(details.media).sort()).toEqual([personPhoto, referenced].sort());
    expect(details.media).not.toHaveProperty(unreferenced);
    expect(details.media).not.toHaveProperty(foreign);
    // Short-lived signed link to the clean bucket, never the app origin.
    const url = new URL(details.media[referenced]);
    expect(url.pathname).toContain("/object/sign/media/");
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).format).toBe("webp");
    const expiry = JSON.parse(Buffer.from(url.searchParams.get("token")!.split(".")[1], "base64url").toString()) as { exp: number; iat: number };
    expect(expiry.exp - expiry.iat).toBeLessThanOrEqual(600);
  });

  it("refuses ids that are not content images of this event, whoever asks", async () => {
    expect(await signContentImages(event.id, [unreferenced])).toHaveProperty(unreferenced); // processed, own event: signable by the host editor
    expect(await signContentImages(event.id, [foreign, wallPhoto, "not-a-uuid"])).toEqual({});
    expect(referencedImages(event.blocks)).toEqual([]);
  });

  it("/me returns the signed URLs with the guest blocks to a session holder only", async () => {
    expect((await meGet(get(`/api/guest/${event.slug}/me`), ctx(event.slug))).status).toBe(401);
    const { token } = await sessionToken(event);
    state.jar.set(sessionCookieName(event.id), { value: token });
    const res = await meGet(get(`/api/guest/${event.slug}/me`), ctx(event.slug));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.media).sort()).toEqual([personPhoto, referenced].sort());
    expect(body.content).toBeNull();
  });

  it("the preview route serves the preview image with an image type and long cache", async () => {
    const res = await ogGet(get(`/api/og/${event.slug}`), ctx(event.slug));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toMatch(/public, max-age=86400/);
    expect(res.headers.get("set-cookie")).toBeNull();
    const body = Buffer.from(await res.arrayBuffer());
    expect((await sharp(body).metadata()).format).toBe("webp");
    expect((await readPreviewImage(event))!.bytes.equals(body)).toBe(true);
  });

  it("the preview route refuses anything but the event's own processed preview image", async () => {
    // Query strings are refused outright.
    expect((await ogGet(get(`/api/og/${event.slug}?id=${unreferenced}`), ctx(event.slug))).status).toBe(400);
    // A wall photo, another event's image, an unknown id, or no preview at all.
    for (const image of [wallPhoto, foreign, crypto.randomUUID(), null]) {
      const tampered: PublicEvent = { ...event, slug: `${event.slug}x`, preview: preview(image) };
      state.events.set(tampered.slug, tampered);
      const res = await ogGet(get(`/api/og/${tampered.slug}`), ctx(tampered.slug));
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).not.toMatch(/^image\//);
    }
    expect((await ogGet(get(`/api/og/no-such-event-1`), ctx("no-such-event-1"))).status).toBe(404);
  });

  it("a rejected upload is never served as the preview", async () => {
    const { event: e } = await makeLiveEvent("wedding");
    const bad = await hostUpload(e.id, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>".padEnd(200)));
    const published = await publish(e, { preview: preview(bad.mediaId) });
    expect((await ogGet(get(`/api/og/${published.slug}`), ctx(published.slug))).status).toBe(404);
  });
});
