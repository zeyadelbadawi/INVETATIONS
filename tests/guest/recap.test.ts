// The after-event recap (security rule 20): session only, nothing before the
// end, approved players' first names only, highlights only highlighted and
// visible posts.
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

import { admin } from "../db/helpers";
import { makeGuest, makeLiveEvent } from "./fixtures";
import { ctx, get, sessionToken } from "./route-helpers";
import type { PublicEvent } from "@/lib/events/published";
import type { GuestContext } from "@/lib/guest/session";
import { sessionCookieName } from "@/lib/guest/session";
import { joinAsNewPlayer } from "@/lib/guest/join";
import { award } from "@/lib/guest/scores";
import { hasEnded, readRecap, RECAP_LIMITS } from "@/lib/guest/recap";
import { highlightedPostIds, MAX_HIGHLIGHTS, setPostHighlighted } from "@/features/control/lib";
import type { Actor } from "@/lib/events/access";
import { GET as recapGet } from "@/app/api/guest/[slug]/recap/route";

type Player = NonNullable<GuestContext["player"]>;

async function join(event: PublicEvent, name: string, teamKey: string): Promise<{ guest: GuestContext; player: Player }> {
  const guest = await makeGuest(event, "group");
  const joined = await joinAsNewPlayer(event, guest, { name, teamKey });
  if (!joined.ok) throw new Error(`join failed: ${joined.reason}`);
  return { guest: { ...guest, player: joined.player }, player: joined.player };
}

async function post(event: PublicEvent, player: Player, body: string, patch: Record<string, unknown> = {}) {
  const { data } = await admin
    .from("wall_posts")
    .insert({ event_id: event.id, player_id: player.id, kind: "text", body, status: "visible", ...patch })
    .select("id")
    .single();
  return data!.id as string;
}

beforeEach(() => state.jar.clear());

describe("recap", () => {
  let event: PublicEvent;
  let viewer: GuestContext;
  let ended: PublicEvent;

  beforeAll(async () => {
    ({ event } = await makeLiveEvent("wedding"));
    const nour = await join(event, "Nour Hassan", "bride");
    const salma = await join(event, "Salma Adel Fahmy", "bride");
    const omar = await join(event, "Omar Said", "groom");
    const sneaky = await join(event, "Sneaky Topscorer", "groom");
    const gone = await join(event, "Gone Player", "bride");
    viewer = nour.guest;

    await award(event.id, nour.player, "quiz_correct", "q1", 40);
    await award(event.id, salma.player, "quiz_correct", "q1", 10);
    await award(event.id, omar.player, "quiz_correct", "q1", 20);
    await award(event.id, sneaky.player, "quiz_correct", "q1", 500);
    await award(event.id, gone.player, "quiz_correct", "q1", 300);
    // Not approved, and removed: neither may appear anywhere in the recap.
    await admin.from("players").update({ approved: false }).eq("id", sneaky.player.id);
    await admin.from("players").update({ removed_at: new Date().toISOString() }).eq("id", gone.player.id);
    await admin.rpc("recompute_team_scores", { p_event_id: event.id });

    await post(event, salma.player, "HIGHLIGHT-VISIBLE", { highlighted: true });
    await post(event, salma.player, "NOT-HIGHLIGHTED");
    await post(event, salma.player, "HIGHLIGHT-PENDING", { highlighted: true, status: "pending" });
    await post(event, salma.player, "HIGHLIGHT-HIDDEN", { highlighted: true, status: "hidden" });
    await post(event, salma.player, "HIGHLIGHT-TAKEN-DOWN", { highlighted: true, removed_by_staff_at: new Date().toISOString() });
    await post(event, sneaky.player, "HIGHLIGHT-UNAPPROVED-AUTHOR", { highlighted: true });

    await admin.from("events").update({ status: "ended" }).eq("id", event.id);
    ended = { ...event, status: "ended" };
    state.events.set(ended.slug, ended);
  });

  it("has nothing before the event ends", async () => {
    expect(await readRecap(event, viewer)).toBeNull();
    expect(await readRecap({ ...event, endsAt: new Date(Date.now() + 3600_000).toISOString() }, viewer)).toBeNull();
    expect(hasEnded({ status: "published", endsAt: new Date(Date.now() - 1000).toISOString() })).toBe(true);
    expect(hasEnded({ status: "cancelled", endsAt: new Date(Date.now() - 1000).toISOString() })).toBe(false);

    const early: PublicEvent = { ...event, slug: `${event.slug}e` };
    state.events.set(early.slug, early);
    const { token } = await sessionToken(event);
    state.jar.set(sessionCookieName(event.id), { value: token });
    const res = await recapGet(get(`/api/guest/${early.slug}/recap`), ctx(early.slug));
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain("Nour");
  });

  it("needs a session and is private", async () => {
    const anon = await recapGet(get(`/api/guest/${ended.slug}/recap`), ctx(ended.slug));
    expect(anon.status).toBe(401);
    const { token } = await sessionToken(event);
    state.jar.set(sessionCookieName(event.id), { value: token });
    const res = await recapGet(get(`/api/guest/${ended.slug}/recap`), ctx(ended.slug));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("lists approved players only, by first name, top three per team", async () => {
    const recap = (await readRecap(ended, viewer))!;
    const text = JSON.stringify(recap);
    for (const hidden of ["Sneaky", "Topscorer", "Gone", "Hassan", "Adel", "Fahmy", "Said"]) expect(text).not.toContain(hidden);

    const byKey = new Map(recap.teams.map((t) => [t.key, t]));
    const bride = recap.topPlayers.find((t) => t.teamId === byKey.get("bride")!.id)!;
    const groom = recap.topPlayers.find((t) => t.teamId === byKey.get("groom")!.id)!;
    // Join points (5 each) count too; order is by points.
    expect(bride.players.map((p) => p.name)).toEqual(["Nour", "Salma"]);
    expect(groom.players.map((p) => p.name)).toEqual(["Omar"]);
    for (const team of recap.topPlayers) expect(team.players.length).toBeLessThanOrEqual(RECAP_LIMITS.topPerTeam);

    expect(recap.winnerTeamId).toBe(byKey.get("bride")!.id);
    expect(recap.myPoints).toBe(45);
  });

  it("shows only highlighted, visible posts by approved players", async () => {
    const recap = (await readRecap(ended, viewer))!;
    expect(recap.highlights.map((h) => h.text)).toEqual(["HIGHLIGHT-VISIBLE"]);
    expect(recap.highlights[0].author).toBe("Salma");
  });

  it("caps highlights at twelve, and the host toggle refuses a thirteenth", async () => {
    const { event: e, host } = await makeLiveEvent("wedding");
    const author = await join(e, "Hana Mostafa", "bride");
    const actor: Actor = { userId: host.id, kind: "owner", grantId: null };
    const ids: string[] = [];
    for (let i = 0; i < 14; i++) ids.push(await post(e, author.player, `wish-${i}`));
    for (const id of ids.slice(0, MAX_HIGHLIGHTS)) expect(await setPostHighlighted(e.id, actor, id, true)).toEqual({ ok: true });
    expect(await setPostHighlighted(e.id, actor, ids[12], true)).toEqual({ ok: false, reason: "full" });
    expect((await highlightedPostIds(e.id)).length).toBe(MAX_HIGHLIGHTS);
    // Turning one off makes room again.
    expect(await setPostHighlighted(e.id, actor, ids[0], false)).toEqual({ ok: true });
    expect(await setPostHighlighted(e.id, actor, ids[12], true)).toEqual({ ok: true });
    // Another event's post cannot be touched.
    const { event: other } = await makeLiveEvent("wedding");
    expect(await setPostHighlighted(other.id, actor, ids[1], false)).toEqual({ ok: false, reason: "not_found" });

    const recap = (await readRecap({ ...e, status: "ended" }, author.guest))!;
    expect(recap.highlights.length).toBe(MAX_HIGHLIGHTS);
    expect(recap.highlights.map((h) => h.text)).not.toContain("wish-0");
  });

  it("photo highlights carry a link only for approved players, and never when photos are host-only", async () => {
    const { event: e } = await makeLiveEvent("wedding");
    const author = await join(e, "Rana Ali", "bride");
    const mediaId = crypto.randomUUID();
    const path = `${e.id}/${mediaId}`;
    await admin.storage.from("media").upload(path, Buffer.from("RIFF0000WEBPVP8 "), { contentType: "image/webp" });
    await admin.from("media").insert({ id: mediaId, event_id: e.id, player_id: author.player.id, purpose: "wall_photo", quarantine_path: path, clean_path: path, state: "processed", mime: "image/webp" });
    await post(e, author.player, "", { kind: "photo", media_id: mediaId, body: "caption", highlighted: true });
    const over: PublicEvent = { ...e, status: "ended" };

    const seen = (await readRecap(over, author.guest))!;
    expect(seen.highlights[0].mediaUrl).toMatch(/\/object\/sign\/media\//);

    const stranger = await makeGuest(e, "group"); // session, never joined
    const strangerView = (await readRecap(over, stranger))!;
    expect(strangerView.highlights[0].mediaUrl).toBeNull();
    expect(strangerView.highlights[0].text).toBe("caption");

    const hostOnly = (await readRecap({ ...over, settings: { ...over.settings, photosHostOnly: true } }, author.guest))!;
    expect(hostOnly.highlights[0].mediaUrl).toBeNull();
  });
});
