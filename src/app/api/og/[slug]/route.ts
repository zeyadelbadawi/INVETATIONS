import { getPublicEvent } from "@/lib/events/published";
import { readPreviewImage } from "@/lib/media/content";

// The link-preview image, for WhatsApp and other crawlers that fetch it
// without a session. Serves exactly one file: the media id named by the event's
// published preview, and only if it belongs to the event and is a processed
// content image (re-encoded, metadata stripped, type set by the server). Any
// other media id is unreachable here. Reads no cookies, so it is cacheable.
const NOT_FOUND_HEADERS = { "Cache-Control": "public, max-age=60, s-maxage=60", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, ctx: RouteContext<"/api/og/[slug]">) {
  // A query string would let anyone bypass the cache (same rule as /api/live).
  if (new URL(request.url).search) return new Response("Bad Request", { status: 400, headers: { "Cache-Control": "no-store" } });

  const { slug } = await ctx.params;
  const event = await getPublicEvent(slug);
  const image = event ? await readPreviewImage(event) : null;
  if (!image) return new Response("Not Found", { status: 404, headers: NOT_FOUND_HEADERS });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.bytes.length),
      // Long enough for crawlers and the CDN; a changed preview shows within a day.
      "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      // Even opened directly, the response can run nothing.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
