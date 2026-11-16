// Review F4 (upload slots and the quarantine sweep) and F8 (wall reports),
// through the real route handlers.
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { admin, hash } from "../db/helpers";
import { makeLiveEvent } from "./fixtures";
import { ctx, postJson } from "./route-helpers";
import type { PublicEvent } from "@/lib/events/published";
import { sessionCookieName } from "@/lib/guest/session";
import { WALL_LIMITS } from "@/lib/guest/wall";
import { POST as joinPost } from "@/app/api/guest/[slug]/join/route";
import { POST as uploadPost } from "@/app/api/guest/[slug]/upload/route";
import { POST as completePost } from "@/app/api/guest/[slug]/upload/complete/route";
import { POST as wallPost } from "@/app/api/guest/[slug]/wall/route";
import { POST as reportRoute } from "@/app/api/guest/[slug]/wall/report/route";
import { GET as cronGet } from "@/app/api/cron/jobs/route";

async function liveEvent(): Promise<PublicEvent> {
  const { event } = await makeLiveEvent("wedding");
  const live = { ...event, settings: { ...event.settings, openLinkApproval: true } };
  state.events.set(live.slug, live);
  return live;
}

// A browser that opened a link of the given kind and joined.
async function guest(event: PublicEvent, kind: "group" | "open", name: string) {
  const { data: existing } = kind === "open" ? await admin.from("invitations").select("id").eq("event_id", event.id).eq("kind", "open").maybeSingle() : { data: null };
  const invitationId =
    existing?.id ??
    (await admin
      .from("invitations")
      .insert({ event_id: event.id, kind, label: `${kind} ${randomBytes(2).toString("hex")}`, max_players: 2000, code_hash: hash(randomBytes(16).toString("hex")) })
      .select("id")
      .single()).data!.id;
  const token = randomBytes(32).toString("base64url");
  await admin.from("guest_sessions").insert({ token_hash: hash(token), event_id: event.id, invitation_id: invitationId, expires_at: new Date(Date.now() + 86400000).toISOString() });
  const res = await call(joinPost, event, token, "join", { name });
  return { token, player: res.body.player as { id: string; approved: boolean } };
}

type Handler = (request: Request, context: never) => Promise<Response>;
async function call(handler: Handler, event: PublicEvent, token: string, path: string, body: unknown) {
  state.jar.clear();
  state.jar.set(sessionCookieName(event.id), { value: token });
  const res = await handler(postJson(`/api/guest/${event.slug}/${path}`, body), ctx(event.slug));
  return { status: res.status, body: await res.json() };
}
const slot = (event: PublicEvent, token: string, purpose: "wall_photo" | "wall_voice" = "wall_photo") =>
  call(uploadPost, event, token, "upload", { purpose, bytes: 1000 });

async function mediaRows(eventId: string, playerId: string, n: number, state: string, purpose = "wall_photo") {
  const rows = Array.from({ length: n }, () => {
    const id = crypto.randomUUID();
    return { id, event_id: eventId, player_id: playerId, purpose, quarantine_path: `${eventId}/${id}`, state };
  });
  const { error } = await admin.from("media").insert(rows);
  if (error) throw error;
}

beforeEach(() => state.jar.clear());

describe("upload slots", () => {
  it("are refused to walk-ins still waiting for approval", async () => {
    const event = await liveEvent();
    const walkIn = await guest(event, "open", "Walk In");
    expect(walkIn.player.approved).toBe(false);
    const res = await slot(event, walkIn.token);
    expect(res).toEqual({ status: 403, body: { error: "not_approved" } });
    const { count } = await admin.from("media").select("id", { count: "exact", head: true }).eq("event_id", event.id);
    expect(count).toBe(0);
  });

  it("allow only a few unfinished slots per player, even in a parallel burst", async () => {
    const event = await liveEvent();
    const g = await guest(event, "group", "Busy Uploader");
    const burst = await Promise.all(Array.from({ length: 10 }, () => slot(event, g.token)));
    expect(burst.filter((r) => r.status === 200)).toHaveLength(WALL_LIMITS.pendingPerPlayer);
    const { count } = await admin.from("media").select("id", { count: "exact", head: true }).eq("player_id", g.player.id).eq("state", "pending_upload");
    expect(count).toBe(WALL_LIMITS.pendingPerPlayer);
  });

  it("count only uploaded and processed files toward the caps", async () => {
    const event = await liveEvent();
    const g = await guest(event, "group", "Photo Fan");
    await mediaRows(event.id, g.player.id, 20, "rejected");
    await mediaRows(event.id, g.player.id, WALL_LIMITS.photosPerPlayer - 1, "processed");
    expect((await slot(event, g.token)).status).toBe(200);
    await mediaRows(event.id, g.player.id, 1, "uploaded");
    expect(await slot(event, g.token)).toEqual({ status: 409, body: { error: "quota" } });
    // Voice notes have their own cap.
    expect((await slot(event, g.token, "wall_voice")).status).toBe(200);
  });

  it("stop at the event's cap", async () => {
    const event = await liveEvent();
    const filler = await guest(event, "group", "Filler Guest");
    for (let i = 0; i < WALL_LIMITS.mediaPerEvent; i += 200) await mediaRows(event.id, filler.player.id, 200, "processed");
    const g = await guest(event, "group", "Late Guest");
    expect(await slot(event, g.token)).toEqual({ status: 409, body: { error: "quota" } });
  });

  it("completing re-checks the cap, so unfinished slots cannot be cashed in past it", async () => {
    const event = await liveEvent();
    const g = await guest(event, "group", "Sneaky Guest");
    await mediaRows(event.id, g.player.id, WALL_LIMITS.photosPerPlayer - 1, "processed");
    const slots = [];
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } }).jpeg().toBuffer();
    for (let i = 0; i < WALL_LIMITS.pendingPerPlayer; i++) {
      const issued = (await slot(event, g.token)).body as { mediaId: string; path: string };
      // The browser's upload to the signed URL.
      await admin.storage.from("quarantine").upload(issued.path, jpeg, { contentType: "image/jpeg" });
      slots.push(issued.mediaId);
    }
    const done = [];
    for (const mediaId of slots) done.push((await call(completePost, event, g.token, "upload/complete", { mediaId })).status);
    expect(done).toEqual([200, 409, 409]);
    const { count } = await admin.from("media").select("id", { count: "exact", head: true }).eq("player_id", g.player.id).in("state", ["uploaded", "processed"]);
    expect(count).toBeLessThanOrEqual(WALL_LIMITS.photosPerPlayer);
  });
});

describe("quarantine sweep", () => {
  it("is queued once per hour by the cron route and clears stale slots", async () => {
    const event = await liveEvent();
    const g = await guest(event, "group", "Abandoned Upload");
    const stale = crypto.randomUUID();
    await admin.from("media").insert({
      id: stale, event_id: event.id, player_id: g.player.id, purpose: "wall_photo", quarantine_path: `${event.id}/${stale}`,
      state: "pending_upload", created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    });
    const hour = new Date().toISOString().slice(0, 13);
    // A run of this suite earlier in the same hour already used this hour's sweep.
    await admin.from("jobs").delete().eq("kind", "media.sweep").eq("ref", hour);
    const authed = () => new Request("http://localhost/api/cron/jobs", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect((await cronGet(new Request("http://localhost/api/cron/jobs"))).status).toBe(401);
    expect((await cronGet(authed())).status).toBe(200);
    expect((await cronGet(authed())).status).toBe(200);
    const { data: jobs } = await admin.from("jobs").select("state").eq("kind", "media.sweep").eq("ref", hour);
    expect(jobs).toHaveLength(1);
    const { data: row } = await admin.from("media").select("state").eq("id", stale).single();
    expect(row!.state).toBe("rejected");
  });
});

describe("wall reports", () => {
  it("from unapproved walk-ins are accepted but change nothing; three invited guests hide a wish", async () => {
    const event = await liveEvent();
    const author = await guest(event, "group", "Wish Author");
    const post = await call(wallPost, event, author.token, "wall", { body: "Mabrouk!" });
    expect(post.status).toBe(200);
    const postId = post.body.id as string;

    for (let i = 0; i < 5; i++) {
      const walkIn = await guest(event, "open", `Walkin ${i}`);
      expect((await call(reportRoute, event, walkIn.token, "wall/report", { postId })).status).toBe(200);
    }
    let { data: row } = await admin.from("wall_posts").select("status, reported_count").eq("id", postId).single();
    expect(row).toEqual({ status: "visible", reported_count: 0 });

    const reporters = [];
    for (let i = 0; i < 3; i++) reporters.push(await guest(event, "group", `Reporter ${i}`));
    for (const r of reporters) await call(reportRoute, event, r.token, "wall/report", { postId });
    // The same reporter again counts once.
    await call(reportRoute, event, reporters[0].token, "wall/report", { postId });
    ({ data: row } = await admin.from("wall_posts").select("status, reported_count").eq("id", postId).single());
    expect(row).toEqual({ status: "pending", reported_count: 3 });

    // Parallel reports are all counted: the increment is one statement.
    const second = await call(wallPost, event, author.token, "wall", { body: "Again" });
    await Promise.all(
      reporters.map((r) => admin.rpc("wall_report", { p_event_id: event.id, p_post_id: second.body.id, p_player_id: r.player.id, p_threshold: 3 })),
    );
    ({ data: row } = await admin.from("wall_posts").select("status, reported_count").eq("id", second.body.id).single());
    expect(row).toEqual({ status: "pending", reported_count: 3 });
  });
});
