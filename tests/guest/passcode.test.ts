// Security V3 / rule 38: the event passcode unlocks guest-only blocks for
// visitors who have only the public link, and nothing else.
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
// Wrap the comparison primitive so the tests can see it is the one used.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  const timingSafeEqual = vi.fn(actual.timingSafeEqual);
  return { ...actual, default: { ...actual, timingSafeEqual }, timingSafeEqual };
});

import { timingSafeEqual } from "node:crypto";
import { admin } from "../db/helpers";
import { makeLiveEvent } from "./fixtures";
import { ctx, get, postJson, sessionToken } from "./route-helpers";
import { contentSchema, splitForPublish } from "@/content/schema";
import type { PublicEvent } from "@/lib/events/published";
import { hashPasscode } from "@/features/host/lib/passcode";
import { checkPasscode, failureKey, PASSCODE_FAILURES, passcodeCookieName, signPasscodeGrant, verifyPasscodeGrant } from "@/lib/guest/passcode";
import { sessionCookieName } from "@/lib/guest/session";
import { readLive } from "@/lib/live";
import { POST as passcodePost } from "@/app/api/guest/[slug]/passcode/route";
import { GET as detailsGet } from "@/app/api/guest/[slug]/details/route";
import { GET as meGet } from "@/app/api/guest/[slug]/me/route";

const SECRET_ADDRESS = "SENTINEL-PASSCODE-ADDRESS-5521";
const PASSCODE = "garden-2026";

async function gatedEvent(passcode = PASSCODE): Promise<PublicEvent> {
  const { event } = await makeLiveEvent("wedding");
  const content = contentSchema.parse({
    blocks: [
      { id: "blkdetail1", type: "details", venue: { ar: "قاعة", en: "Hall" }, city: { ar: "", en: "" } },
      { id: "blklocat01", type: "location", address: { ar: SECRET_ADDRESS, en: SECRET_ADDRESS }, label: { ar: "", en: "" }, parking: { ar: "", en: "" } },
    ],
  });
  const split = splitForPublish(content);
  await admin
    .from("events")
    .update({ passcode_hash: await hashPasscode(passcode), published_content: { public: split.public, guest: split.guest, order: split.order } })
    .eq("id", event.id);
  const gated: PublicEvent = { ...event, hasPasscode: true, blocks: split.public.blocks, order: split.order };
  state.events.set(gated.slug, gated);
  return gated;
}

const unlock = (event: PublicEvent, passcode: string, headers: Record<string, string> = {}) =>
  passcodePost(postJson(`/api/guest/${event.slug}/passcode`, { passcode }, headers), ctx(event.slug));
const details = (event: PublicEvent) => detailsGet(get(`/api/guest/${event.slug}/details`), ctx(event.slug));
const me = (event: PublicEvent) => meGet(get(`/api/guest/${event.slug}/me`), ctx(event.slug));

async function failures(eventId: string): Promise<number> {
  const { data } = await admin.from("rate_limits").select("count").eq("key", failureKey(eventId));
  return (data ?? []).reduce((sum, row) => sum + row.count, 0);
}

beforeEach(() => state.jar.clear());

describe("passcode endpoint", () => {
  let a: PublicEvent;
  let b: PublicEvent;
  beforeAll(async () => {
    a = await gatedEvent();
    b = await gatedEvent();
  });

  it("refuses cross-origin and non-JSON posts", async () => {
    const res = await unlock(a, PASSCODE, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(state.jar.size).toBe(0);
  });

  it("a wrong passcode gets 401, no cookie, and counts toward the event's throttle", async () => {
    const before = await failures(a.id);
    const res = await unlock(a, "not-the-passcode");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "wrong_passcode" });
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(state.jar.size).toBe(0);
    expect(await failures(a.id)).toBe(before + 1);
  });

  it("guest-only blocks stay locked without the passcode or a session", async () => {
    expect((await details(a)).status).toBe(401);
    expect((await me(a)).status).toBe(401);
  });

  it("the right passcode sets a signed, http-only __Host- cookie for that event and unlocks the details", async () => {
    const before = await failures(a.id);
    const res = await unlock(a, PASSCODE);
    expect(res.status).toBe(200);
    // A correct passcode does not use up the allowance.
    expect(await failures(a.id)).toBe(before);

    const cookie = state.jar.get(passcodeCookieName(a.id));
    expect(cookie).toBeDefined();
    expect(passcodeCookieName(a.id)).toMatch(/^__Host-p_[0-9a-f]{10}$/);
    expect(cookie!.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(cookie!.options).not.toHaveProperty("domain");
    const expires = (cookie!.options!.expires as Date).getTime();
    expect(expires - Date.now()).toBeGreaterThan(29 * 86400_000);
    expect(expires - Date.now()).toBeLessThanOrEqual(30 * 86400_000 + 5000);
    expect(cookie!.value).not.toContain(PASSCODE);

    const unlocked = await details(a);
    expect(unlocked.status).toBe(200);
    expect(unlocked.headers.get("cache-control")).toContain("no-store");
    const body = await unlocked.json();
    expect(JSON.stringify(body.guestBlocks)).toContain(SECRET_ADDRESS);
    // The whole body comes from here on a passcode event, in host order.
    expect(body.content.order).toEqual(["blkdetail1", "blklocat01"]);
    // Nothing personal: no invitation, player or RSVP.
    expect(body).not.toHaveProperty("invitation");
    expect(body).not.toHaveProperty("player");
    expect(body).not.toHaveProperty("rsvp");
    // The passcode cookie is not a session.
    expect((await me(a)).status).toBe(401);
  });

  it("a cookie for event A is useless on event B", async () => {
    expect((await unlock(a, PASSCODE)).status).toBe(200);
    const value = state.jar.get(passcodeCookieName(a.id))!.value;
    state.jar.clear();
    state.jar.set(passcodeCookieName(b.id), { value });
    expect((await details(b)).status).toBe(401);
    const { data } = await admin.from("events").select("passcode_hash").eq("id", b.id).single();
    expect(verifyPasscodeGrant(b.id, value, data!.passcode_hash)).toBe(false);
  });

  it("changing the passcode invalidates cookies issued before", async () => {
    const c = await gatedEvent();
    expect((await unlock(c, PASSCODE)).status).toBe(200);
    expect((await details(c)).status).toBe(200);
    await admin.from("events").update({ passcode_hash: await hashPasscode("a-new-passcode") }).eq("id", c.id);
    expect((await details(c)).status).toBe(401);
  });

  it("guests with a session do not need the passcode", async () => {
    const { token } = await sessionToken(a);
    state.jar.set(sessionCookieName(a.id), { value: token });
    const res = await me(a);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body.guestBlocks)).toContain(SECRET_ADDRESS);
    expect(body.content.order).toEqual(["blkdetail1", "blklocat01"]);
    expect((await details(a)).status).toBe(200);
  });

  it("locks the event after too many wrong guesses, even for the right passcode", async () => {
    const d = await gatedEvent();
    for (let i = 0; i < PASSCODE_FAILURES.max; i++) expect((await unlock(d, `wrong-${i}`)).status).toBe(401);
    const locked = await unlock(d, PASSCODE);
    expect(locked.status).toBe(429);
    expect(await locked.json()).toEqual({ error: "locked" });
    expect(state.jar.size).toBe(0);
    // Other events are unaffected.
    expect((await unlock(b, PASSCODE)).status).toBe(200);
  });

  it("is not available on events without a passcode", async () => {
    const { event } = await makeLiveEvent("wedding");
    state.events.set(event.slug, event);
    expect((await unlock(event, PASSCODE)).status).toBe(404);
    expect((await details(event)).status).toBe(404);
  });
});

describe("constant-time comparison", () => {
  it("compares passcodes and cookie signatures with timingSafeEqual", async () => {
    const stored = await hashPasscode(PASSCODE);
    const spy = vi.mocked(timingSafeEqual);

    spy.mockClear();
    expect(await checkPasscode(stored, "garden-2025")).toBe(false); // same length, one character off
    expect(await checkPasscode(stored, "g")).toBe(false);
    expect(await checkPasscode(stored, PASSCODE)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);

    const eventId = crypto.randomUUID();
    const grant = signPasscodeGrant(eventId, stored);
    const [expires, signature] = grant.value.split(".");
    const flipped = `${expires}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    spy.mockClear();
    expect(verifyPasscodeGrant(eventId, grant.value, stored)).toBe(true);
    expect(verifyPasscodeGrant(eventId, flipped, stored)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
    // Malformed, expired or truncated values are refused before any comparison.
    expect(verifyPasscodeGrant(eventId, `${expires}.${signature.slice(0, 20)}`, stored)).toBe(false);
    expect(verifyPasscodeGrant(eventId, signPasscodeGrant(eventId, stored, Date.now() - 31 * 86400_000).value, stored)).toBe(false);
    expect(verifyPasscodeGrant(eventId, grant.value, null)).toBe(false);
  });
});

describe("live endpoint on a passcode event", () => {
  it("shows only phase and time, never scores or the answer", async () => {
    const { event } = await makeLiveEvent("gender_reveal");
    await admin.from("team_scores").upsert({ team_id: (await admin.from("teams").select("id").eq("event_id", event.id).limit(1).single()).data!.id, event_id: event.id, score: 12, active_players: 2 });
    const live = await readLive({ ...event, hasPasscode: true });
    expect(live.scores).toEqual([]);
    expect(live.answer).toBeNull();
    expect(Object.keys(live).sort()).toEqual(["answer", "phase", "revealAt", "revealStyle", "scores", "status", "v"]);
  });
});
