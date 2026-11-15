// Phase 3 gate: the upload pipeline only lets verified, re-encoded media through.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { admin } from "../db/helpers";
import { makeGuest, makeLiveEvent } from "./fixtures";
import { joinAsNewPlayer } from "@/lib/guest/join";
import { processMedia } from "@/lib/media/process";
import { sniff } from "@/lib/media/sniff";
import { readWall } from "@/lib/guest/wall";

async function setup() {
  const { event } = await makeLiveEvent("wedding");
  const guest = await makeGuest(event, "group");
  const joined = await joinAsNewPlayer(event, guest, { name: "Nour", teamKey: "bride" });
  if (!joined.ok) throw new Error("join failed");
  return { event, guest: { ...guest, player: joined.player } };
}

async function upload(eventId: string, playerId: string, purpose: "wall_photo" | "wall_voice", bytes: Buffer, contentType: string) {
  const id = crypto.randomUUID();
  const path = `${eventId}/${id}`;
  await admin.from("media").insert({ id, event_id: eventId, player_id: playerId, purpose, quarantine_path: path, state: "uploaded" });
  const up = await admin.storage.from("quarantine").upload(path, bytes, { contentType });
  return { id, path, uploadError: up.error };
}

describe("type sniffing", () => {
  it("recognises only the allowed formats", () => {
    expect(sniff(Buffer.from("<html><script>alert(1)</script></html>     "))).toBeNull();
    expect(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(sniff(Buffer.from("GIF89a" + "0".repeat(20)))).toBeNull();
    expect(sniff(Buffer.from("%PDF-1.7" + "0".repeat(20)))).toBeNull();
    expect(sniff(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...new Array(20).fill(0)]))).toEqual({ kind: "audio", mime: "audio/webm" });
  });
});

describe("processing", () => {
  it("re-encodes a photo, strips location metadata and marks it processed", async () => {
    const { event, guest } = await setup();
    const withGps = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#884422" } })
      .withExif({ IFD0: { Make: "TestCam", Copyright: "secret-owner" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "30/1 2/1 40/1" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();

    const m = await upload(event.id, guest.player.id, "wall_photo", withGps, "image/jpeg");
    expect(await processMedia(m.id)).toBe("processed");

    const { data: row } = await admin.from("media").select("state, clean_path, mime, width, height").eq("id", m.id).single();
    expect(row).toMatchObject({ state: "processed", mime: "image/webp" });
    expect(Math.max(row!.width!, row!.height!)).toBeLessThanOrEqual(1600);

    const clean = await admin.storage.from("media").download(row!.clean_path!);
    const out = Buffer.from(await clean.data!.arrayBuffer());
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(out.includes("secret-owner")).toBe(false);
    // The quarantine copy is gone.
    expect((await admin.storage.from("quarantine").download(m.path)).error).not.toBeNull();
  });

  it("rejects HTML or SVG uploaded with an image content type", async () => {
    const { event, guest } = await setup();
    for (const body of ["<html><body><script>alert(document.cookie)</script></body></html>", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>']) {
      const m = await upload(event.id, guest.player.id, "wall_photo", Buffer.from(body.padEnd(64)), "image/jpeg");
      expect(await processMedia(m.id)).toBe("rejected");
      const { data } = await admin.from("media").select("state, clean_path").eq("id", m.id).single();
      expect(data).toEqual({ state: "rejected", clean_path: null });
    }
  });

  it("drops anything appended after a valid image (polyglot)", async () => {
    const { event, guest } = await setup();
    const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#00f" } }).jpeg().toBuffer();
    const polyglot = Buffer.concat([jpeg, Buffer.from("<script>POLYGLOT_MARKER</script>")]);
    const m = await upload(event.id, guest.player.id, "wall_photo", polyglot, "image/jpeg");
    expect(await processMedia(m.id)).toBe("processed");
    const { data: row } = await admin.from("media").select("clean_path").eq("id", m.id).single();
    const out = Buffer.from(await (await admin.storage.from("media").download(row!.clean_path!)).data!.arrayBuffer());
    expect(out.includes("POLYGLOT_MARKER")).toBe(false);
  });

  it("refuses a pixel bomb without decoding it", async () => {
    const { event, guest } = await setup();
    // A tiny PNG that declares 50,000 × 50,000 pixels.
    const bomb = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).png().toBuffer();
    bomb.writeUInt32BE(50000, 16);
    bomb.writeUInt32BE(50000, 20);
    const m = await upload(event.id, guest.player.id, "wall_photo", bomb, "image/png");
    expect(await processMedia(m.id)).toBe("rejected");
  });

  it("rejects audio where a photo was promised, and oversized uploads at the bucket", async () => {
    const { event, guest } = await setup();
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...new Array(64).fill(1)]);
    const wrong = await upload(event.id, guest.player.id, "wall_photo", webm, "image/jpeg");
    expect(await processMedia(wrong.id)).toBe("rejected");

    const big = await upload(event.id, guest.player.id, "wall_photo", Buffer.alloc(3_000_000, 1), "image/jpeg");
    expect(big.uploadError).not.toBeNull();
  });

  it("processing is a no-op the second time", async () => {
    const { event, guest } = await setup();
    const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#0f0" } }).jpeg().toBuffer();
    const m = await upload(event.id, guest.player.id, "wall_photo", jpeg, "image/jpeg");
    expect(await processMedia(m.id)).toBe("processed");
    expect(await processMedia(m.id)).toBe("skipped");
  });
});

describe("wall visibility", () => {
  it("shows a photo to others only after approval, and never to unapproved players", async () => {
    const { event, guest } = await setup();
    const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#0f0" } }).jpeg().toBuffer();
    const m = await upload(event.id, guest.player.id, "wall_photo", jpeg, "image/jpeg");
    const { data: post } = await admin
      .from("wall_posts")
      .insert({ event_id: event.id, player_id: guest.player.id, kind: "photo", media_id: m.id, status: "pending" })
      .select("id")
      .single();
    await processMedia(m.id);

    const otherGuest = await makeGuest(event, "group");
    const other = await joinAsNewPlayer(event, otherGuest, { name: "Hala", teamKey: "groom" });
    if (!other.ok) throw new Error("join failed");
    const viewer = { ...otherGuest, player: other.player };

    expect(await readWall(event, viewer)).toHaveLength(0);
    const mine = await readWall(event, guest);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ mine: true, status: "pending" });

    await admin.from("wall_posts").update({ status: "visible" }).eq("id", post!.id);
    const seen = await readWall(event, viewer);
    expect(seen).toHaveLength(1);
    expect(seen[0].mediaUrl).toContain("/storage/v1/object/sign/media/");
    expect(seen[0].author).toBe("Nour");

    // Host-only photos stay hidden from other guests even when approved.
    const hostOnly = { ...event, settings: { ...event.settings, photosHostOnly: true } };
    expect(await readWall(hostOnly, viewer)).toHaveLength(0);

    // An unapproved walk-in sees nothing at all.
    expect(await readWall(event, { ...viewer, player: { ...other.player, approved: false } })).toHaveLength(0);

    // A staff takedown hides it from everyone, including the author.
    await admin.from("wall_posts").update({ removed_by_staff_at: new Date().toISOString() }).eq("id", post!.id);
    expect(await readWall(event, viewer)).toHaveLength(0);
    expect(await readWall(event, guest)).toHaveLength(0);
  });
});
