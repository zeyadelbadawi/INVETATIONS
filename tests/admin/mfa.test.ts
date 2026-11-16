// Staff second factor (security O1): the decision behind the back-office gate.
import { describe, expect, it } from "vitest";
import { cleanTotpCode, mfaOptional, mfaStep, qrDataUri } from "@/features/admin/lib/mfa";

const totp = (status: string) => ({ factor_type: "totp", status });

describe("mfaStep", () => {
  it("sends staff without a verified authenticator to enrolment", () => {
    expect(mfaStep({ factors: [], aal: "aal1" })).toBe("enroll");
    expect(mfaStep({ factors: [totp("unverified")], aal: "aal1" })).toBe("enroll");
    expect(mfaStep({ factors: [{ factor_type: "phone", status: "verified" }], aal: "aal1" })).toBe("enroll");
    expect(mfaStep({ factors: [], aal: undefined })).toBe("enroll");
  });

  it("sends staff with an authenticator but an aal1 session to verification", () => {
    expect(mfaStep({ factors: [totp("verified")], aal: "aal1" })).toBe("verify");
    expect(mfaStep({ factors: [totp("unverified"), totp("verified")], aal: null })).toBe("verify");
  });

  it("lets an aal2 session through", () => {
    expect(mfaStep({ factors: [totp("verified")], aal: "aal2" })).toBe("allowed");
  });

  it("honours the development switch, never in production", () => {
    expect(mfaStep({ factors: [], aal: "aal1", optional: true })).toBe("allowed");
    expect(mfaOptional({ NODE_ENV: "development", STAFF_MFA_OPTIONAL: "1" })).toBe(true);
    expect(mfaOptional({ NODE_ENV: "test", STAFF_MFA_OPTIONAL: "1" })).toBe(true);
    expect(mfaOptional({ NODE_ENV: "production", STAFF_MFA_OPTIONAL: "1" })).toBe(false);
    expect(mfaOptional({ NODE_ENV: "development", STAFF_MFA_OPTIONAL: "" })).toBe(false);
  });
});

describe("helpers", () => {
  it("accepts six digits only, including Arabic-Indic digits", () => {
    expect(cleanTotpCode("123 456")).toBe("123456");
    expect(cleanTotpCode("١٢٣٤٥٦")).toBe("123456");
    expect(cleanTotpCode("12345")).toBeNull();
    expect(cleanTotpCode("12345a")).toBeNull();
    expect(cleanTotpCode(123456)).toBeNull();
  });

  it("encodes the QR SVG for an img src", () => {
    const uri = qrDataUri('data:image/svg+xml;utf-8,<svg fill="#000"></svg>');
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(uri).not.toContain("#");
    expect(decodeURIComponent(uri.split(",")[1])).toBe('<svg fill="#000"></svg>');
  });
});
