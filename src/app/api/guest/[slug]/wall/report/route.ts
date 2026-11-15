import { z } from "zod";
import { guestWrite, json } from "@/lib/guest/route";
import { reportPost } from "@/lib/guest/wall";
import { withinLimit } from "@/lib/security/rate-limit";

const schema = z.object({ postId: z.uuid() });

export const POST = guestWrite({ schema, requirePlayer: true, allowWhenClosed: true }, async ({ event, guest, input }) => {
  // A player's report of a given post counts once.
  if (await withinLimit(`report:${guest.player!.id}:${input.postId}`, { windowSeconds: 86400 * 30, max: 1 })) {
    await reportPost(event, input.postId);
  }
  return json({ ok: true });
});
