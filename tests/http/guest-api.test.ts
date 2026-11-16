// Phase 1 security gate, exercised over real HTTP against a running production
// build. Run with: HTTP_BASE=http://localhost:3200 pnpm exec vitest run tests/http
// (start the server with APP_ORIGIN set to the same origin).
import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { admin, hash, makeEvent, makeHost } from "../db/helpers";
import { contentSchema, splitForPublish } from "@/content/schema";

const BASE = process.env.HTTP_BASE;
const suite = BASE ? describe : describe.skip;

const SENTINEL_ADDRESS = "SENTINEL-HOME-ADDRESS-9931";
const SENTINEL_LABEL = "SENTINEL-FAMILY-LABEL-4410";
const SENTINEL_PLAYER = "Sentinelplayer";

type Fixture = { id: string; slug: string; code: string; invitationId: string };

async function publishedEvent(): Promise<Fixture> {
  const host = await makeHost("http");
  const base = await makeEvent(host.id);
  const content = contentSchema.parse({
    fields: { partner_one: { ar: "أحمد", en: "Ahmed" }, partner_two: { ar: "سارة", en: "Sara" } },
    blocks: [
      { id: "blkdetail1", type: "details", venue: { ar: "قاعة", en: "Hall" }, city: { ar: "القاهرة", en: "Cairo" } },
      { id: "blklocat01", type: "location", address: { ar: SENTINEL_ADDRESS, en: SENTINEL_ADDRESS }, label: { ar: "البيت", en: "Home" }, parking: { ar: "", en: "" } },
    ],
  });
  const split = splitForPublish(content);
  await admin
    .from("events")
    .update({ template_id: "wedding-draft", status: "published", plan_id: "premium", published_version: 1,
      published_content: { public: split.public, guest: split.guest, order: split.order } })
    .eq("id", base.id);
  await admin.from("teams").insert([
    { event_id: base.id, key: "groom", name_ar: "أهل العريس", name_en: "Groom's side", color: "team-a", position: 0 },
    { event_id: base.id, key: "bride", name_ar: "أهل العروسة", name_en: "Bride's side", color: "team-b", position: 1 },
  ]);
  await admin.from("live_state").insert({ event_id: base.id });
  const code = randomBytes(16).toString("base64url");
  const { data: inv } = await admin
    .from("invitations")
    .insert({ event_id: base.id, kind: "group", label: SENTINEL_LABEL, max_players: 50, code_hash: hash(code) })
    .select("id")
    .single();
  return { id: base.id, slug: base.slug, code, invitationId: inv!.id };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE!, ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });

function cookieFrom(response: Response): { header: string; name: string; value: string; raw: string } {
  const raw = response.headers.getSetCookie().find((c) => c.startsWith("__Host-g_")) ?? "";
  const [pair] = raw.split(";");
  const [name, value] = pair.split("=");
  return { header: pair, name, value, raw };
}

suite("guest API over HTTP", () => {
  let a: Fixture;
  let b: Fixture;
  let cookie: ReturnType<typeof cookieFrom>;

  beforeAll(async () => {
    a = await publishedEvent();
    b = await publishedEvent();
  });

  it("refuses a session POST without the app's Origin or with a non-JSON body", async () => {
    const noOrigin = await fetch(`${BASE}/api/guest/${a.slug}/session`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: a.code }),
    });
    expect(noOrigin.status).toBe(403);
    expect((await post(`/api/guest/${a.slug}/session`, { code: a.code }, { origin: "https://evil.example" })).status).toBe(403);
    const form = await fetch(`${BASE}/api/guest/${a.slug}/session`, {
      method: "POST", headers: { "content-type": "text/plain", origin: BASE! }, body: JSON.stringify({ code: a.code }),
    });
    expect(form.status).toBe(403);
    const { count } = await admin.from("guest_sessions").select("id", { count: "exact", head: true }).eq("event_id", a.id);
    expect(count).toBe(0);
  });

  it("a wrong code gets 404 and no cookie", async () => {
    const res = await post(`/api/guest/${a.slug}/session`, { code: randomBytes(16).toString("base64url") });
    expect(res.status).toBe(404);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("issues an opaque, host-only, http-only cookie and never caches the response", async () => {
    const res = await post(`/api/guest/${a.slug}/session`, { code: a.code });
    expect(res.status).toBe(200);
    cookie = cookieFrom(res);
    expect(cookie.name).toMatch(/^__Host-g_[0-9a-f]{10}$/);
    expect(cookie.raw).toMatch(/HttpOnly/i);
    expect(cookie.raw).toMatch(/Secure/i);
    expect(cookie.raw).toMatch(/SameSite=lax/i);
    expect(cookie.raw).toMatch(/Path=\//i);
    expect(cookie.raw).not.toMatch(/Domain=/i);
    expect(res.headers.get("cache-control")).toContain("no-store");
    // Only the hash is stored.
    const { data } = await admin.from("guest_sessions").select("token_hash").eq("event_id", a.id);
    expect(JSON.stringify(data)).not.toContain(cookie.value);
  });

  it("GET on the link page creates nothing", async () => {
    const before = await admin.from("guest_sessions").select("id", { count: "exact", head: true }).eq("event_id", a.id);
    const res = await fetch(`${BASE}/l/${a.slug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await res.text()).not.toContain(a.code);
    const after = await admin.from("guest_sessions").select("id", { count: "exact", head: true }).eq("event_id", a.id);
    expect(after.count).toBe(before.count);
  });

  it("serves personal data only with the session, uncached", async () => {
    expect((await fetch(`${BASE}/api/guest/${a.slug}/me`)).status).toBe(401);
    const res = await fetch(`${BASE}/api/guest/${a.slug}/me`, { headers: { cookie: cookie.header } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.text();
    expect(body).toContain(SENTINEL_LABEL);
    expect(body).toContain(SENTINEL_ADDRESS);
  });

  it("one event's session grants nothing on another event", async () => {
    const res = await post(`/api/guest/${b.slug}/session`, { code: b.code });
    const other = cookieFrom(res);
    expect(other.name).not.toBe(cookie.name);
    // Event A's token presented under event B's cookie name.
    const cross = await fetch(`${BASE}/api/guest/${b.slug}/me`, { headers: { cookie: `${other.name}=${cookie.value}` } });
    expect(cross.status).toBe(401);
    const wrongEvent = await fetch(`${BASE}/api/guest/${b.slug}/me`, { headers: { cookie: cookie.header } });
    expect(wrongEvent.status).toBe(401);
  });

  it("asks before replacing an existing session with another invitation", async () => {
    const code2 = randomBytes(16).toString("base64url");
    await admin.from("invitations").insert({ event_id: a.id, kind: "group", label: "Other group", code_hash: hash(code2) });
    const res = await post(`/api/guest/${a.slug}/session`, { code: code2 }, { cookie: cookie.header });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "needs_confirmation", currentLabel: SENTINEL_LABEL });
  });

  it("the public shell is identical with and without the cookie and holds no guest-only content", async () => {
    // The framework stamps each response with a random request key, and the first
    // request for a new event streams in a different order while the cache fills.
    // Compare settled responses with that key masked.
    const get = async (headers?: Record<string, string>) =>
      (await (await fetch(`${BASE}/i/${a.slug}/ar`, { headers })).text()).replace(/[A-Za-z0-9_-]{21}[vm](?=\\")/g, "REQUEST_KEY");
    await get();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const plain = await get();
    expect(await get()).toBe(plain);
    const withCookie = await get({ cookie: cookie.header });
    expect(plain.length).toBeGreaterThan(1000);
    expect(withCookie).toBe(plain);
    expect(plain).not.toContain(SENTINEL_ADDRESS);
    expect(plain).not.toContain(SENTINEL_LABEL);
    expect(plain).toContain("أحمد");
    const page = await fetch(`${BASE}/i/${a.slug}/ar`);
    expect(page.headers.get("x-robots-tag")).toContain("noindex");
    expect(page.headers.get("set-cookie")).toBeNull();
  });

  it("a join then shows up in scores, but the live endpoint never carries names or cookies", async () => {
    const join = await post(`/api/guest/${a.slug}/join`, { name: SENTINEL_PLAYER, teamKey: "bride" }, { cookie: cookie.header });
    expect(join.status).toBe(200);
    expect((await join.json()).rejoinCode).toMatch(/^[0-9]{6}$/);

    const live = await fetch(`${BASE}/api/live/${a.slug}`);
    expect(live.status).toBe(200);
    expect(live.headers.get("set-cookie")).toBeNull();
    expect(live.headers.get("cache-control")).toContain("s-maxage=2");
    const text = await live.text();
    expect(text).not.toContain(SENTINEL_PLAYER);
    expect(text).not.toContain(SENTINEL_LABEL);
    expect(JSON.parse(text).scores.length).toBe(2);

    expect((await fetch(`${BASE}/api/live/${a.slug}?bust=1`)).status).toBe(400);
    expect((await fetch(`${BASE}/api/live/does-not-exist-zzzz`)).status).toBe(404);
  });

  it("a hall of guests behind one address is not throttled on the live endpoint", async () => {
    const results = await Promise.all(Array.from({ length: 300 }, () => fetch(`${BASE}/api/live/${a.slug}`).then((r) => r.status)));
    expect(results.filter((s) => s !== 200)).toHaveLength(0);
  });

  it("rejects guest writes from another origin even with a valid cookie", async () => {
    const res = await post(`/api/guest/${a.slug}/rsvp`, { status: "yes", adults: 1, children: 0 }, { cookie: cookie.header, origin: "https://evil.example" });
    expect(res.status).toBe(403);
    const ok = await post(`/api/guest/${a.slug}/rsvp`, { status: "yes", adults: 1, children: 0, note: "" }, { cookie: cookie.header });
    expect(ok.status).toBe(200);
  });

  it("revoking the invitation ends its sessions on the next request", async () => {
    await admin.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", a.invitationId);
    expect((await fetch(`${BASE}/api/guest/${a.slug}/me`, { headers: { cookie: cookie.header } })).status).toBe(401);
    expect((await post(`/api/guest/${a.slug}/session`, { code: a.code })).status).toBe(404);
  });

  it("cron requires its secret, and the keeper endpoint never returns a stored answer", async () => {
    expect((await fetch(`${BASE}/api/cron/jobs`)).status).toBe(401);
    expect((await fetch(`${BASE}/api/cron/jobs`, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    const res = await post(`/api/keeper`, { code: randomBytes(16).toString("base64url") });
    expect(res.status).toBe(404);
  });

  it("sends the security headers on pages", async () => {
    const res = await fetch(`${BASE}/ar`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("content-security-policy")).toContain("object-src 'none'");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });
});
