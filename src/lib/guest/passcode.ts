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

// Wrong guesses per event per window; correct ones are not counted, so a whole
// hall entering the right passcode is never locked out.
export const PASSCODE_FAILURES = { windowSeconds: 600, max: 20 } as const;
// Every attempt per event and per address. High ceilings: they bound bursts
// that race past the failure check, and a wedding hall shares one address.
export const PASSCODE_ATTEMPTS_PER_EVENT = { windowSeconds: 600, max: 300 } as const;
export const PASSCODE_ATTEMPTS_PER_IP = { windowSeconds: 600, max: 300 } as const;

export const failureKey = (eventId: string) => `pc:fail:${eventId}`;

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

// How many wrong guesses this event has had in the current window. Read
// without counting, so correct attempts never use up the allowance.
export async function recentFailures(eventId: string): Promise<number> {
  const since = new Date(Date.now() - PASSCODE_FAILURES.windowSeconds * 1000).toISOString();
  const { data, error } = await adminDb()
    .from("rate_limits")
    .select("count, window_start")
    .eq("key", failureKey(eventId))
    .gte("window_start", since);
  if (error) throw new Error(`rate limiter unavailable: ${error.message}`);
  return (data ?? []).reduce((sum, row) => Math.max(sum, row.count), 0);
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
