import type { Locale } from "@/i18n/config";

// Where to go after sign-in. Only a relative path inside the signed-in area of
// the same locale is accepted (security rule 37); anything else falls back to
// the dashboard. Absolute, protocol-relative, backslash and dot-segment forms
// are refused rather than normalised.
export function safeNext(next: unknown, lang: Locale): string {
  const fallback = `/${lang}/app`;
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  // The claim page is the one other place a customer is sent back to after signing in.
  const claim = `/${lang}/claim`;
  if (next === claim) return claim;
  if (!next.startsWith(fallback)) return fallback;
  const boundary = next.charAt(fallback.length);
  if (boundary !== "" && boundary !== "/" && boundary !== "?") return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  if (next.includes("//") || next.includes("..") || next.includes("#")) return fallback;
  try {
    const base = "http://internal.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    if (url.pathname !== fallback && !url.pathname.startsWith(`${fallback}/`)) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
