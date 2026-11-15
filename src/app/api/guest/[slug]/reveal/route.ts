import { getPublicEvent } from "@/lib/events/published";
import { readLive } from "@/lib/live";

// Returns the answer if and only if the database has released it; otherwise how
// long is left. Before release this never touches the ciphertext. Pre-release
// responses are not cacheable; the released answer is the same for everyone.
export async function GET(_request: Request, ctx: RouteContext<"/api/guest/[slug]/reveal">) {
  const { slug } = await ctx.params;
  const event = await getPublicEvent(slug);
  if (!event || event.hasPasscode) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  const live = await readLive(event);
  if (live.phase === "revealed" && live.answer) {
    return Response.json({ released: true, answer: live.answer }, { headers: { "Cache-Control": "public, s-maxage=30" } });
  }
  const remaining = live.revealAt ? Math.max(0, new Date(live.revealAt).getTime() - Date.now()) : null;
  return Response.json({ released: false, remainingMs: remaining }, { headers: { "Cache-Control": "no-store" } });
}
