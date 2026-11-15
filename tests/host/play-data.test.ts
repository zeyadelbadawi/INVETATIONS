// Reads behind the host's control page, against the local Supabase stack.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { admin, makeHost } from "../db/helpers";
import type { AdminClient } from "@/lib/supabase/admin";
import { quizConfig, quizTruth } from "@/play/fixtures";
import { createEvent } from "@/features/host/lib/events";
import { loadGames, loadPlayers, loadPosts, readLiveView, readRevealStatus, signWallMedia } from "@/features/host/lib/play-data";

const db = admin as unknown as AdminClient;
const MARKER = "5ec4e7a115ec4e7a115ec4e7a110";

let eventId: string;
let otherEventId: string;

beforeAll(async () => {
  const host = await makeHost("play-host");
  const other = await makeHost("play-other");
  eventId = (await createEvent(db, host.id, { kind: "gender_reveal", templateId: "reveal-draft", name: "Baby", locale: "en" })).id;
  otherEventId = (await createEvent(db, other.id, { kind: "wedding", templateId: "wedding-draft", name: "Other", locale: "en" })).id;
});

describe("reveal status", () => {
  it("reports times and a count, and nothing that could carry the answer", async () => {
    expect(await readRevealStatus(db, eventId)).toEqual({ exists: false, sealedAt: null, sealCount: 0, revealAt: null, revealedAt: null });

    const sealedAt = new Date().toISOString();
    const { error } = await admin.from("reveals").insert({
      event_id: eventId,
      sealed_at: sealedAt,
      seal_count: 3,
      ciphertext: `\\x${MARKER}`,
      nonce: `\\x${MARKER.slice(0, 24)}`,
      key_version: 1,
    });
    expect(error).toBeNull();

    const status = await readRevealStatus(db, eventId);
    expect(Object.keys(status).sort()).toEqual(["exists", "revealAt", "revealedAt", "sealCount", "sealedAt"]);
    expect(status).toMatchObject({ exists: true, sealCount: 3, revealAt: null, revealedAt: null });
    expect(new Date(status.sealedAt!).toISOString()).toBe(sealedAt);
    expect(JSON.stringify(status)).not.toContain(MARKER);
    // Another event's reveal is not visible through this one's id.
    expect((await readRevealStatus(db, otherEventId)).exists).toBe(false);
  });

  it("shows the live answer only once the phase is revealed", async () => {
    expect(await readLiveView(db, eventId)).toEqual({ phase: "idle", revealAt: null, answer: null });
    // A payload that (wrongly) held an answer early must still not surface it.
    await admin.from("live_state").update({ phase: "countdown", public_payload: { revealAt: "2027-01-01T00:00:00Z", answer: ["girl"] } }).eq("event_id", eventId);
    expect(await readLiveView(db, eventId)).toEqual({ phase: "countdown", revealAt: "2027-01-01T00:00:00Z", answer: null });
    await admin.from("live_state").update({ phase: "revealed", public_payload: { answer: ["girl", "boy", "<script>"] } }).eq("event_id", eventId);
    expect(await readLiveView(db, eventId)).toEqual({ phase: "revealed", revealAt: null, answer: ["girl", "boy"] });
  });
});

describe("games list", () => {
  it("says whether answers are stored without ever returning them, and only when asked", async () => {
    const { data: game, error } = await admin.from("games").insert({ event_id: eventId, kind: "quiz", config: quizConfig, position: 0 }).select("id").single();
    expect(error).toBeNull();
    await admin.from("games").insert({ event_id: eventId, kind: "unknown-kind", config: {}, position: 1 });

    let games = await loadGames(db, eventId, true);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ id: game!.id, kind: "quiz", state: "hidden", answers: 0, hasTruth: false });

    await admin.from("game_secrets").insert({ game_id: game!.id, truth: quizTruth });
    games = await loadGames(db, eventId, true);
    expect(games[0].hasTruth).toBe(true);
    expect(Object.keys(games[0]).sort()).toEqual(["answers", "config", "hasTruth", "id", "kind", "state"]);
    expect(JSON.stringify(games)).not.toContain("\"answers\":{");

    // Staff and moderators are not told.
    expect((await loadGames(db, eventId, false))[0].hasTruth).toBe(false);
    expect(await loadGames(db, otherEventId, true)).toEqual([]);
  });
});

describe("guests and wall", () => {
  it("lists this event's players and posts only, newest posts first", async () => {
    const { data: invitation } = await admin.from("invitations").select("id").eq("event_id", eventId).eq("kind", "open").single();
    const { data: players } = await admin
      .from("players")
      .insert([
        { event_id: eventId, invitation_id: invitation!.id, name: "Mona", approved: false, removed_at: null },
        { event_id: eventId, invitation_id: invitation!.id, name: "Removed", approved: true, removed_at: new Date().toISOString() },
      ])
      .select("id, name");
    const mona = players!.find((p) => p.name === "Mona")!;

    const listed = await loadPlayers(db, eventId);
    expect(listed).toEqual([{ id: mona.id, name: "Mona", teamId: null, invitation: "Open link", approved: false }]);
    expect(await loadPlayers(db, otherEventId)).toEqual([]);

    await admin.from("wall_posts").insert([
      { event_id: eventId, player_id: mona.id, kind: "text", body: "<b>Congrats</b>", status: "pending", removed_by_staff_at: null, created_at: "2026-11-01T10:00:00Z" },
      { event_id: eventId, player_id: mona.id, kind: "text", body: "Taken down", status: "hidden", removed_by_staff_at: new Date().toISOString(), created_at: "2026-11-02T10:00:00Z" },
    ]);
    const posts = await loadPosts(db, eventId);
    expect(posts.map((p) => [p.body, p.status, p.locked, p.author, p.media])).toEqual([
      ["Taken down", "hidden", true, "Mona", null],
      ["<b>Congrats</b>", "pending", false, "Mona", null],
    ]);
    expect(await loadPosts(db, otherEventId)).toEqual([]);
  });

  it("signs nothing for media of another event, unprocessed media or junk ids", async () => {
    const { data: media, error } = await admin
      .from("media")
      .insert([
        { event_id: otherEventId, purpose: "wall_photo", quarantine_path: "q/other.jpg", clean_path: "clean/other.webp", state: "processed" },
        { event_id: eventId, purpose: "wall_photo", quarantine_path: "q/mine.jpg", clean_path: null, state: "uploaded" },
        { event_id: eventId, purpose: "receipt", quarantine_path: "q/receipt.jpg", clean_path: "clean/receipt.webp", state: "processed" },
      ])
      .select("id");
    expect(error).toBeNull();
    const ids = media!.map((m) => m.id);
    expect(await signWallMedia(db, eventId, [...ids, "not-a-uuid", "'; drop table media; --"])).toEqual({});
    expect(await signWallMedia(db, eventId, [])).toEqual({});
  });
});
