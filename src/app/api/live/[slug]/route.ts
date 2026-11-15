import { getPublicEvent } from "@/lib/events/published";
import { readLive } from "@/lib/live";

// The one endpoint every guest polls. It reads no cookies and returns the same
// body to everyone, so a CDN can absorb a full hall: the origin sees about one
// request every two seconds per event regardless of audience size.
export async function GET(request: Request, ctx: RouteContext<"/api/live/[slug]">) {
  // A query string would let anyone bypass the cache (security rule 39).
  if (new URL(request.url).search) return new Response("Bad Request", { status: 400, headers: { "Cache-Control": "no-store" } });

  const { slug } = await ctx.params;
  const event = await getPublicEvent(slug);
  if (!event) {
    return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=60" } });
  }
  const live = await readLive(event);
  return Response.json(live, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=2" },
  });
}
