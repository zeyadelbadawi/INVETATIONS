import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { fail, guestWrite, json } from "@/lib/guest/route";
import { drainJobs, enqueue } from "@/lib/jobs/runner";
import { award, POINTS } from "@/lib/guest/scores";
import "@/lib/jobs/register";

const schema = z.object({ mediaId: z.uuid(), caption: z.string().trim().max(200).default("") });

export const POST = guestWrite({ schema, requirePlayer: true, allowWhenClosed: true }, async ({ event, guest, input }) => {
  const player = guest.player!;
  const db = adminDb();
  // Only the uploader can complete it, and only once.
  const { data: media } = await db
    .from("media")
    .update({ state: "uploaded" })
    .eq("id", input.mediaId)
    .eq("event_id", event.id)
    .eq("player_id", player.id)
    .eq("state", "pending_upload")
    .select("id, purpose")
    .maybeSingle();
  if (!media) return fail("not_found", 404);

  const kind = media.purpose === "wall_voice" ? "voice" : "photo";
  const { error } = await db.from("wall_posts").insert({
    event_id: event.id,
    player_id: player.id,
    kind,
    body: input.caption || null,
    media_id: media.id,
    status: "pending",
  });
  if (error) throw new Error(`wall insert failed: ${error.message}`);

  await enqueue("media.process", media.id, { mediaId: media.id });
  // Process promptly without making the guest wait on anything but their own file.
  await drainJobs(1);
  if (player.approved && event.entitlements.games) await award(event.id, player, "wall_post", "first", POINTS.wallPost);
  return json({ ok: true, kind });
});
