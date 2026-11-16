import { z } from "zod";
import { getPublicEvent } from "@/lib/events/published";
import { fail, json } from "@/lib/guest/route";
import {
  checkPasscode,
  failureKey,
  PASSCODE_ATTEMPTS_PER_EVENT,
  PASSCODE_ATTEMPTS_PER_IP,
  PASSCODE_FAILURES,
  readPasscodeHash,
  recentFailures,
  setPasscodeCookie,
} from "@/lib/guest/passcode";
import { clientIp, isSameOriginJsonPost } from "@/lib/security/origin";
import { withinLimit } from "@/lib/security/rate-limit";

const schema = z.object({ passcode: z.string().min(1).max(64) });

// Exchanges the event passcode for a cookie that unlocks the guest-only blocks
// for visitors who have only the public link (security V3, rule 38). Guests who
// opened their own link have a session and never need this.
export async function POST(request: Request, ctx: RouteContext<"/api/guest/[slug]/passcode">) {
  if (!isSameOriginJsonPost(request)) return fail("bad_origin", 403);
  const { slug } = await ctx.params;
  const event = await getPublicEvent(slug);
  if (!event || !event.hasPasscode) return fail("not_found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad_json", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("invalid", 400);

  // No session yet: address (high ceiling) and event, then the event's count
  // of wrong guesses, read without spending one.
  const [ipOk, eventOk] = await Promise.all([
    withinLimit(`pc:ip:${clientIp(request)}`, PASSCODE_ATTEMPTS_PER_IP),
    withinLimit(`pc:try:${event.id}`, PASSCODE_ATTEMPTS_PER_EVENT),
  ]);
  if (!ipOk || !eventOk) return fail("slow_down", 429);
  if ((await recentFailures(event.id)) >= PASSCODE_FAILURES.max) return fail("locked", 429);

  // The hash is read fresh: the cached event only knows that one exists.
  const stored = await readPasscodeHash(event.id);
  if (!stored) return fail("not_found", 404);
  if (!(await checkPasscode(stored, parsed.data.passcode))) {
    await withinLimit(failureKey(event.id), PASSCODE_FAILURES);
    return fail("wrong_passcode", 401);
  }

  await setPasscodeCookie(event.id, stored);
  return json({ ok: true });
}
