import { z } from "zod";
import { guestWrite, json } from "@/lib/guest/route";
import { reportCounts, reportPost } from "@/lib/guest/wall";
import { withinLimit } from "@/lib/security/rate-limit";

const schema = z.object({ postId: z.uuid() });

// Every report is accepted with the same answer; only those from approved,
// invited players count (review F8), and a player's report of a post counts once.
export const POST = guestWrite({ schema, requirePlayer: true, allowWhenClosed: true }, async ({ event, guest, input }) => {
  if (reportCounts(guest) && (await withinLimit(`report:${guest.player!.id}:${input.postId}`, { windowSeconds: 86400 * 30, max: 1 }))) {
    await reportPost(event, guest, input.postId);
  }
  return json({ ok: true });
});
