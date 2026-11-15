import { z } from "zod";
import { fail, guestWrite, json } from "@/lib/guest/route";
import { submitAnswer } from "@/lib/guest/games";

type Ctx = RouteContext<"/api/guest/[slug]/games/[gameId]/answer">;

const schema = z.object({ questionId: z.string().regex(/^[a-z0-9_-]{1,40}$/), answer: z.unknown() });

export async function POST(request: Request, ctx: Ctx) {
  const { gameId } = await ctx.params;
  if (!z.uuid().safeParse(gameId).success) return fail("not_found", 404);
  return guestWrite({ schema, requirePlayer: true }, async ({ event, guest, input }) => {
    if (!guest.player!.approved) return fail("not_approved", 403);
    const result = await submitAnswer(event, guest.player!, gameId, input.questionId, input.answer);
    if (result.ok) return json(result);
    return fail(result.reason, result.reason === "invalid" ? 400 : 409);
  })(request, ctx);
}
