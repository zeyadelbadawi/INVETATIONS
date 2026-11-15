import { z } from "zod";
import { fail, guestWrite, json } from "@/lib/guest/route";
import { claimPlayer, joinAsNewPlayer } from "@/lib/guest/join";
import { limits, withinLimit } from "@/lib/security/rate-limit";

const schema = z.union([
  z.object({ name: z.string().min(1).max(80), teamKey: z.string().regex(/^[a-z0-9_]{1,32}$/).optional() }),
  z.object({ claim: z.uuid(), code: z.string().regex(/^[0-9]{6}$/).optional() }),
]);

export const POST = guestWrite({ schema }, async ({ event, guest, input }) => {
  if (guest.player) return json({ player: guest.player, rejoinCode: null });
  if (!(await withinLimit(`join:${guest.invitation.id}`, limits.joinPerInvitation))) return fail("slow_down", 429);

  if ("claim" in input) {
    const result = await claimPlayer(event, guest, input.claim, input.code);
    if (!result.ok) return fail(result.reason, result.reason === "locked" ? 423 : 403);
    return json({ player: result.player, rejoinCode: null });
  }

  const result = await joinAsNewPlayer(event, guest, input);
  if (!result.ok) return fail(result.reason, result.reason === "full" ? 409 : 400);
  return json({ player: result.player, rejoinCode: result.rejoinCode });
});
