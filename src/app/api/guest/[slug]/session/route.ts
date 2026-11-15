import { z } from "zod";
import { getPublicEvent } from "@/lib/events/published";
import { fail, json } from "@/lib/guest/route";
import { startSession } from "@/lib/guest/session";
import { clientIp, isSameOriginJsonPost } from "@/lib/security/origin";
import { limits, withinLimit } from "@/lib/security/rate-limit";
import { sha256 } from "@/lib/security/tokens";

const schema = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/), confirm: z.boolean().default(false) });

// Exchanges the link code (read from the URL fragment by the link page) for a session cookie.
export async function POST(request: Request, ctx: RouteContext<"/api/guest/[slug]/session">) {
  if (!isSameOriginJsonPost(request)) return fail("bad_origin", 403);
  const { slug } = await ctx.params;
  const event = await getPublicEvent(slug);
  if (!event) return fail("not_found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad_json", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("not_found", 404);

  // No session exists yet, so limit by address (high ceiling: a hall shares one)
  // and by the code being tried.
  const codeKey = sha256(parsed.data.code).toString("hex").slice(0, 24);
  const [ipOk, codeOk] = await Promise.all([
    withinLimit(`sc:ip:${clientIp(request)}`, limits.sessionCreatePerIp),
    withinLimit(`sc:code:${codeKey}`, limits.sessionCreatePerCode),
  ]);
  if (!ipOk || !codeOk) return fail("slow_down", 429);

  const result = await startSession(event, parsed.data.code, parsed.data.confirm);
  if (!result.ok) {
    if (result.reason === "needs_confirmation") {
      return json({ error: "needs_confirmation", currentLabel: result.currentLabel }, 409);
    }
    return fail("not_found", 404);
  }
  return json({ ok: true, locale: result.locale ?? event.defaultLocale });
}
