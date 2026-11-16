import { z } from "zod";
import { fail, guestWrite, json } from "@/lib/guest/route";
import { claimPlayer, joinAsNewPlayer } from "@/lib/guest/join";
import { normaliseName } from "@/lib/security/names";
import { limits, withinLimit } from "@/lib/security/rate-limit";

const schema = z.union([
  z.object({ name: z.string().min(1).max(80), teamKey: z.string().regex(/^[a-z0-9_]{1,32}$/).optional() }),
  z.object({ claim: z.uuid(), code: z.string().regex(/^[0-9]{6}$/).optional() }),
]);

// Budgets, most specific first (security rule 35, review F5): this session,
// then for a re-claim the targeted player, and last a high ceiling for the
// whole invitation, so one stranger with the open link cannot use up a hall's
// joins. Input that can never succeed is refused before any shared budget.
export const POST = guestWrite({ schema }, async ({ event, guest, input }) => {
  if (guest.player) return json({ player: guest.player, rejoinCode: null });
  if ("name" in input && normaliseName(input.name).length < 2) return fail("invalid_name", 400);
  if (!(await withinLimit(`join:s:${guest.sessionId}`, limits.joinPerSession))) return fail("slow_down", 429);
  if ("claim" in input && !(await withinLimit(`join:t:${input.claim}`, limits.claimPerTarget))) return fail("slow_down", 429);
  if (!(await withinLimit(`join:i:${guest.invitation.id}`, limits.joinPerInvitation))) return fail("slow_down", 429);

  if ("claim" in input) {
    const result = await claimPlayer(event, guest, input.claim, input.code);
    if (!result.ok) return fail(result.reason, result.reason === "locked" ? 423 : 403);
    return json({ player: result.player, rejoinCode: null });
  }

  const result = await joinAsNewPlayer(event, guest, input);
  if (!result.ok) return fail(result.reason, result.reason === "full" ? 409 : 400);
  return json({ player: result.player, rejoinCode: result.rejoinCode });
});
