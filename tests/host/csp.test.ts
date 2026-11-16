// The strict policy for dashboard, back office and link pages (review F10).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LANG_SCRIPT } from "@/app/(invite)/lang-script";
import { newNonce, STRICT_CSP_PATH, strictCsp } from "@/lib/security/csp";

describe("strict CSP", () => {
  it("covers exactly the dashboard, back office and link pages", () => {
    for (const path of ["/en/app", "/ar/app/", "/en/app/events/x/edit", "/ar/admin", "/en/admin/mfa/enroll", "/l/slug-abcdef", "/l", "/k", "/k/"]) {
      expect(STRICT_CSP_PATH.test(path), path).toBe(true);
    }
    for (const path of ["/", "/en", "/en/login", "/en/signup", "/en/pricing", "/en/apps", "/i/slug/ar", "/preview", "/link", "/keeper", "/api/keeper"]) {
      expect(STRICT_CSP_PATH.test(path), path).toBe(false);
    }
  });

  it("allows scripts only by nonce (and the constant language script by hash)", async () => {
    const nonce = newNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(newNonce()).not.toBe(nonce);
    const policy = await strictCsp(nonce, false);
    const script = policy.split("; ").find((d) => d.startsWith("script-src"))!;
    const hash = createHash("sha256").update(LANG_SCRIPT).digest("base64");
    expect(script).toBe(`script-src 'nonce-${nonce}' 'strict-dynamic' 'sha256-${hash}'`);
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("frame-src 'self'");
    expect(policy).not.toMatch(/script-src[^;]*unsafe/);
  });
});
