// Review F5: join budgets are keyed on the session, then the targeted player,
// then a high ceiling per invitation, so one stranger with the open link cannot
// use up a hall's joins, and invalid input spends nothing shared.
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
import { admin, hash } from "../db/helpers";
import { makeLiveEvent } from "./fixtures";
import { ctx, postJson } from "./route-helpers";
import type { PublicEvent } from "@/lib/events/published";
import { sessionCookieName } from "@/lib/guest/session";
import { limits } from "@/lib/security/rate-limit";
import { POST as joinPost } from "@/app/api/guest/[slug]/join/route";

async function openEvent(): Promise<{ event: PublicEvent; invitationId: string }> {
  const { event } = await makeLiveEvent("wedding");
  const live = { ...event, settings: { ...event.settings, openLinkApproval: true } };
  state.events.set(live.slug, live);
  const { data: inv } = await admin
    .from("invitations")
    .insert({ event_id: event.id, kind: "open", label: "Open", max_players: 2000, code_hash: hash(randomBytes(16).toString("hex")) })
    .select("id")
    .single();
  return { event: live, invitationId: inv!.id };
}

// A new browser on the invitation: its own session cookie.
async function browser(event: PublicEvent, invitationId: string) {
  const token = randomBytes(32).toString("base64url");
  await admin
    .from("guest_sessions")
    .insert({ token_hash: hash(token), event_id: event.id, invitation_id: invitationId, expires_at: new Date(Date.now() + 86400000).toISOString() });
  return token;
}

async function join(event: PublicEvent, token: string, body: unknown) {
  state.jar.clear();
  state.jar.set(sessionCookieName(event.id), { value: token });
  const res = await joinPost(postJson(`/api/guest/${event.slug}/join`, body), ctx(event.slug));
  return { status: res.status, body: await res.json() };
}

async function used(key: string): Promise<number> {
  const { data } = await admin.from("rate_limits").select("count").eq("key", key);
  return (data ?? []).reduce((sum, row) => sum + row.count, 0);
}

// A player id that does not exist; fresh each time so the per-target budget
// of one test does not leak into another.
const nobody = () => crypto.randomUUID();

beforeEach(() => state.jar.clear());

describe("join budgets", () => {
  it("a stranger cycling through fresh sessions does not shut the open link for real guests", async () => {
    const { event, invitationId } = await openEvent();
    let throttled = 0;
    for (let i = 0; i < 90; i++) {
      const r = await join(event, await browser(event, invitationId), { claim: nobody(), code: "000000" });
      if (r.status === 429) throttled++;
    }
    expect(throttled).toBe(0);
    const real = await join(event, await browser(event, invitationId), { name: "Real Guest" });
    expect(real.status).toBe(200);
    expect(real.body.player.name).toBe("Real Guest");
  });

  it("one session is held to its own budget", async () => {
    const { event, invitationId } = await openEvent();
    const token = await browser(event, invitationId);
    for (let i = 0; i < limits.joinPerSession.max; i++) expect((await join(event, token, { claim: nobody(), code: "000000" })).status).toBe(403);
    expect((await join(event, token, { claim: nobody(), code: "000000" })).status).toBe(429);
    // Another browser is unaffected.
    expect((await join(event, await browser(event, invitationId), { name: "Next Guest" })).status).toBe(200);
  });

  it("re-claim attempts on one player are capped across sessions", async () => {
    const { event, invitationId } = await openEvent();
    const target = await join(event, await browser(event, invitationId), { name: "Target Person" });
    const statuses: number[] = [];
    for (let i = 0; i < limits.claimPerTarget.max + 2; i++) {
      statuses.push((await join(event, await browser(event, invitationId), { claim: target.body.player.id, code: "000000" })).status);
    }
    // Five wrong codes lock the player (423); the per-target budget then answers 429.
    expect(statuses.slice(0, limits.claimPerTarget.max).every((s) => s === 403 || s === 423)).toBe(true);
    expect(statuses.slice(limits.claimPerTarget.max)).toEqual([429, 429]);
  });

  it("invalid input spends nothing from the invitation's budget", async () => {
    const { event, invitationId } = await openEvent();
    const token = await browser(event, invitationId);
    const before = await used(`join:i:${invitationId}`);
    expect((await join(event, token, { name: "x" })).status).toBe(400);
    expect((await join(event, token, { claim: "not-a-uuid" })).status).toBe(400);
    expect((await join(event, token, { name: "​​​" })).status).toBe(400);
    expect(await used(`join:i:${invitationId}`)).toBe(before);
  });
});
