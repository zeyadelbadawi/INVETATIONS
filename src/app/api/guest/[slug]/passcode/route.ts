import { z } from "zod";
import { getPublicEvent } from "@/lib/events/published";
import { fail, json } from "@/lib/guest/route";
import {
  checkPasscode,
  failureKey,
  ipFailureKey,
  PASSCODE_ATTEMPTS_PER_IP,
  PASSCODE_FAILURES,
  PASSCODE_FAILURES_PER_IP,
  readPasscodeHash,
  setPasscodeCookie,
} from "@/lib/guest/passcode";
import { clientIp, isSameOriginJsonPost } from "@/lib/security/origin";
import { refundLimit, withinLimit } from "@/lib/security/rate-limit";

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

  // No session yet (security rule 35). Slots are reserved before the slow
  // check and given back when the passcode is right (review F3): see
  // src/lib/guest/passcode.ts for the three budgets.
  const ip = clientIp(request);
  if (!(await withinLimit(`pc:ip:${ip}`, PASSCODE_ATTEMPTS_PER_IP))) return fail("slow_down", 429);
  const ipKey = ipFailureKey(event.id, ip);
  if (!(await withinLimit(ipKey, PASSCODE_FAILURES_PER_IP))) return fail("slow_down", 429);
  const eventKey = failureKey(event.id);
  const eventOk = await withinLimit(eventKey, PASSCODE_FAILURES);

  // The hash is read fresh: the cached event only knows that one exists.
  const stored = await readPasscodeHash(event.id);
  if (!stored) return fail("not_found", 404);
  if (!(await checkPasscode(stored, parsed.data.passcode))) {
    return eventOk ? fail("wrong_passcode", 401) : fail("locked", 429);
  }

  await Promise.all([refundLimit(ipKey, PASSCODE_FAILURES_PER_IP), refundLimit(eventKey, PASSCODE_FAILURES)]);
  await setPasscodeCookie(event.id, stored);
  return json({ ok: true });
}
