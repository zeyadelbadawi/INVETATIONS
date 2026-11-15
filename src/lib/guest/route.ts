import "server-only";
import type { ZodType } from "zod";
import { getPublicEvent, type PublicEvent } from "@/lib/events/published";
import { currentSession, type GuestContext } from "@/lib/guest/session";
import { isSameOriginJsonPost } from "@/lib/security/origin";
import { limits, withinLimit } from "@/lib/security/rate-limit";

// All guest responses are personal and must never be stored by a cache (security rule 4).
const HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: HEADERS });
}

export function fail(code: string, status: number): Response {
  return json({ error: code }, status);
}

type Ctx = { params: Promise<{ slug: string }> };

async function loadEvent(ctx: Ctx): Promise<PublicEvent | null> {
  const { slug } = await ctx.params;
  return getPublicEvent(slug);
}

// GET handler for a guest who may or may not have a session.
export function guestRead(handler: (args: { event: PublicEvent; guest: GuestContext | null; request: Request }) => Promise<Response>) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    const event = await loadEvent(ctx);
    if (!event) return fail("not_found", 404);
    const guest = await currentSession(event.id);
    return handler({ event, guest, request });
  };
}

type WriteOptions<T> = {
  schema: ZodType<T>;
  requirePlayer?: boolean;
  // Closed events (postponed, cancelled, ended) reject writes unless a route opts in.
  allowWhenClosed?: boolean;
};

// POST handler for a state change by a guest with a session. Identity comes
// only from the session, never from the body (security A2).
export function guestWrite<T>(
  options: WriteOptions<T>,
  handler: (args: { event: PublicEvent; guest: GuestContext; input: T; request: Request }) => Promise<Response>,
) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    if (!isSameOriginJsonPost(request)) return fail("bad_origin", 403);
    const event = await loadEvent(ctx);
    if (!event) return fail("not_found", 404);
    const guest = await currentSession(event.id);
    if (!guest) return fail("no_session", 401);
    if (options.requirePlayer && !guest.player) return fail("not_joined", 409);
    if (event.status !== "published" && !options.allowWhenClosed) return fail("event_closed", 409);
    if (!(await withinLimit(`gw:${guest.sessionId}`, limits.guestWritePerSession))) return fail("slow_down", 429);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("bad_json", 400);
    }
    const parsed = options.schema.safeParse(body);
    if (!parsed.success) return fail("invalid", 400);
    return handler({ event, guest, input: parsed.data, request });
  };
}
