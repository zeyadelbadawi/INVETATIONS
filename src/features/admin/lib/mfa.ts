// Staff second factor (security O1). Pure decision, so it can be tested
// without a browser: given the user's factors and the session's assurance
// level, where must a staff member go next?

export type FactorInfo = { factor_type: string; status: string };

export type MfaStep = "allowed" | "enroll" | "verify";

export function mfaStep(input: { factors: readonly FactorInfo[]; aal: unknown; optional?: boolean }): MfaStep {
  if (input.aal === "aal2") return "allowed";
  if (input.optional) return "allowed";
  const verifiedTotp = input.factors.some((f) => f.factor_type === "totp" && f.status === "verified");
  return verifiedTotp ? "verify" : "enroll";
}

// The development switch. Never honoured in a production build.
export function mfaOptional(env: { NODE_ENV?: string; STAFF_MFA_OPTIONAL?: string } = process.env): boolean {
  return env.NODE_ENV !== "production" && env.STAFF_MFA_OPTIONAL === "1";
}

// Six digits, nothing else.
export function cleanTotpCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, "");
  return /^[0-9]{6}$/.test(digits) ? digits : null;
}

// Supabase returns `data:image/svg+xml;utf-8,<svg …>`; the raw SVG is
// percent-encoded so characters such as `#` survive inside an <img src>.
export function qrDataUri(qr: string): string {
  const prefix = "data:image/svg+xml;utf-8,";
  const svg = qr.startsWith(prefix) ? qr.slice(prefix.length) : qr;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
