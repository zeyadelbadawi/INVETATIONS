import "server-only";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/supabase/admin";
import { hmac, safeEqual, sha256 } from "@/lib/security/tokens";
import { verifyPasscode } from "@/features/host/lib/passcode";

// Event passcodes (security V3, rule 38). A visitor with only the public link
// who gives the right passcode gets a signed, http-only cookie for that one
// event. It unlocks the guest-only blocks (address, programme, gallery…) and
// nothing else: no invitation, player or RSVP. Guests who came through their
// own link already have a session and never need it.

export const PASSCODE_GRANT_DAYS = 30;
const GRANT_MS = PASSCODE_GRANT_DAYS * 24 * 3600 * 1000;

// Throttles (rule 38, review F3). A slot is reserved BEFORE the slow check, so
// a burst of parallel guesses cannot race past it, and handed back when the
// passcode was right: only failures stay counted.
//   - per address and event: a modest allowance of wrong guesses. A wedding
//     hall shares one address, but its guests type the right passcode, which
//     costs nothing.
//   - per event: a high ceiling on wrong guesses from everywhere. It never
//     blocks a correct passcode; once spent, wrong guesses are answered
//     "locked" and only a guest who knows the passcode gets through.
//   - per address: every attempt on any event, a high ceiling that bounds the
//     hashing work one address can cause.
export const PASSCODE_FAILURES_PER_IP = { windowSeconds: 600, max: 10 } as const;
export const PASSCODE_FAILURES = { windowSeconds: 600, max: 200 } as const;
export const PASSCODE_ATTEMPTS_PER_IP = { windowSeconds: 600, max: 300 } as const;

export const failureKey = (eventId: string) => `pc:fail:${eventId}`;
export const ipFailureKey = (eventId: string, ip: string) => `pc:fail:${eventId}:${sha256(ip).toString("hex").slice(0, 24)}`;

// __Host- cookies need Secure and Path=/ and no Domain; browsers treat
// localhost as secure, so the same name works in development.
export function passcodeCookieName(eventId: string): string {
  return `__Host-p_${eventId.replace(/-/g, "").slice(0, 10)}`;
}

// The grant is bound to the event, its expiry and the current passcode hash:
// changing or clearing the passcode invalidates every cookie issued before.
function signature(eventId: string, expires: number, passcodeHash: string): Buffer {
  const fingerprint = sha256(passcodeHash).toString("hex");
  return hmac("passcode-grant", `${eventId}\n${expires}\n${fingerprint}`);
}

export function signPasscodeGrant(eventId: string, passcodeHash: string, now = Date.now()): { value: string; expires: Date } {
  const expires = now + GRANT_MS;
  return { value: `${expires}.${signature(eventId, expires, passcodeHash).toString("base64url")}`, expires: new Date(expires) };
}

// Constant-time check of a cookie value. Anything malformed, expired, or
// signed for another event or an older passcode is refused.
export function verifyPasscodeGrant(eventId: string, value: string | undefined | null, passcodeHash: string | null, now = Date.now()): boolean {
  if (!value || !passcodeHash || value.length > 128) return false;
  const match = /^([0-9]{13})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return false;
  const expires = Number(match[1]);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + GRANT_MS + 60_000) return false;
  const given = Buffer.from(match[2], "base64url");
  return safeEqual(given, signature(eventId, expires, passcodeHash));
}

export async function readPasscodeHash(eventId: string): Promise<string | null> {
  const { data } = await adminDb().from("events").select("passcode_hash").eq("id", eventId).maybeSingle();
  return data?.passcode_hash ?? null;
}

// Slow, salted, constant-time comparison against the stored hash.
export async function checkPasscode(passcodeHash: string | null, passcode: string): Promise<boolean> {
  return verifyPasscode(passcode, passcodeHash);
}

export async function setPasscodeCookie(eventId: string, passcodeHash: string): Promise<void> {
  const grant = signPasscodeGrant(eventId, passcodeHash);
  const store = await cookies();
  store.set(passcodeCookieName(eventId), grant.value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: grant.expires,
  });
}

// Whether this request carries a valid passcode grant for the event.
export async function hasPasscodeGrant(eventId: string): Promise<boolean> {
  const store = await cookies();
  const value = store.get(passcodeCookieName(eventId))?.value;
  if (!value) return false;
  return verifyPasscodeGrant(eventId, value, await readPasscodeHash(eventId));
}
