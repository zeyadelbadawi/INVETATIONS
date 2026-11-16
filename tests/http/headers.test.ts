// Response headers over real HTTP against a production build (review F10).
// Run with: HTTP_BASE=http://localhost:3500 pnpm exec vitest run tests/http
import { describe, expect, it } from "vitest";

const BASE = process.env.HTTP_BASE;
const suite = BASE ? describe : describe.skip;

const get = (path: string, init: RequestInit = {}) => fetch(`${BASE}${path}`, { redirect: "manual", ...init });

suite("security headers", () => {
  it("guest API and keeper responses send no-referrer and no-store", async () => {
    const responses = [
      await get("/api/guest/nope-abcdef/me"),
      await get("/api/guest/nope-abcdef/games"),
      await fetch(`${BASE}/api/keeper`, { method: "POST", headers: { "content-type": "application/json", origin: BASE! }, body: "{}" }),
    ];
    for (const res of responses) {
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("link and keeper pages carry a strict nonce policy whose nonce is on every script", async () => {
    for (const path of ["/k", "/l/some-event-abcdef"]) {
      const res = await get(path);
      const policies = res.headers.get("content-security-policy") ?? "";
      // Exactly one policy: the static one from next.config.ts is not sent here.
      expect(policies.split(", default-src").length).toBe(1);
      const script = policies.split(";").find((d) => d.trim().startsWith("script-src"))!;
      expect(script).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
      expect(script).toContain("'strict-dynamic'");
      expect(script).not.toContain("unsafe-inline");
      expect(script).not.toContain("unsafe-eval");
      expect(policies).toContain("frame-ancestors 'none'");
      const nonce = /'nonce-([^']+)'/.exec(script)![1];
      const html = await res.text();
      const tags = html.match(/<script\b[^>]*>/g) ?? [];
      expect(tags.length).toBeGreaterThan(0);
      // Every script carries the nonce except the constant language script, allowed by hash.
      const without = tags.filter((tag) => !tag.includes(`nonce="${nonce}"`));
      expect(without.length).toBeLessThanOrEqual(1);
      // A fresh nonce per response.
      const again = (await get(path)).headers.get("content-security-policy") ?? "";
      expect(again).not.toContain(nonce);
    }
  });

  it("signed-in areas get the strict policy, public pages keep the static one", async () => {
    // The dashboard redirects signed-out visitors; its pages are checked in the browser.
    const marketing = (await get("/en/pricing")).headers.get("content-security-policy") ?? "";
    expect(marketing).toContain("'unsafe-inline'");
    expect(marketing).not.toContain("nonce-");
    const invitation = (await get("/i/nope-abcdef/ar")).headers.get("content-security-policy") ?? "";
    expect(invitation).not.toContain("nonce-");
  });
});
