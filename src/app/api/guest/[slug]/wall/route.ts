import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { fail, guestRead, guestWrite, json } from "@/lib/guest/route";
import { award, POINTS } from "@/lib/guest/scores";
import { initialPostStatus, readWall } from "@/lib/guest/wall";
import { limits, withinLimit } from "@/lib/security/rate-limit";

export const GET = guestRead(async ({ event, guest }) => {
  if (!guest) return fail("no_session", 401);
  return json({ posts: await readWall(event, guest) });
});

const schema = z.object({ body: z.string().trim().min(1).max(600) });

export const POST = guestWrite({ schema, requirePlayer: true, allowWhenClosed: true }, async ({ event, guest, input }) => {
  if (event.status === "cancelled") return fail("event_closed", 409);
  const player = guest.player!;
  if (!(await withinLimit(`wall:${player.id}`, limits.wallPerPlayer))) return fail("slow_down", 429);

  const status = initialPostStatus(guest, "text");
  const { data, error } = await adminDb()
    .from("wall_posts")
    .insert({ event_id: event.id, player_id: player.id, kind: "text", body: input.body, status })
    .select("id")
    .single();
  if (error || !data) throw new Error(`wall insert failed: ${error?.message}`);

  // One reward per guest for leaving a wish, however many they write.
  if (player.approved && event.entitlements.games) await award(event.id, player, "wall_post", "first", POINTS.wallPost);
  return json({ ok: true, id: data.id, status });
});
