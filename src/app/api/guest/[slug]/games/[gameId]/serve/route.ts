import { z } from "zod";
import { fail, guestWrite, json } from "@/lib/guest/route";
import { serveQuestion } from "@/lib/guest/games";

type Ctx = RouteContext<"/api/guest/[slug]/games/[gameId]/serve">;

export async function POST(request: Request, ctx: Ctx) {
  const { gameId } = await ctx.params;
  if (!z.uuid().safeParse(gameId).success) return fail("not_found", 404);
  return guestWrite({ schema: z.object({}), requirePlayer: true }, async ({ event, guest }) => {
    if (!guest.player!.approved) return fail("not_approved", 403);
    const result = await serveQuestion(event, guest.player!, gameId);
    return result.ok ? json(result) : fail(result.reason, 409);
  })(request, ctx);
}
