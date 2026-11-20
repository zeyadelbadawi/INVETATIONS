import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { fail, guestWrite, json } from "@/lib/guest/route";
import { drainJobs, enqueue } from "@/lib/jobs/runner";
import { award, POINTS } from "@/lib/guest/scores";
import { WALL_LIMITS } from "@/lib/guest/wall";
import "@/lib/jobs/register";

const schema = z.object({ mediaId: z.uuid(), caption: z.string().trim().max(200).default("") });

export const POST = guestWrite({ schema, requirePlayer: true, allowWhenClosed: true }, async ({ event, guest, input }) => {
  const player = guest.player!;
  const db = adminDb();
  if (!event.settings.wallEnabled) return fail("wall_off", 403);
  if (!player.approved) return fail("not_approved", 403);
  // Only the uploader can complete it, and only once. The caps are checked
  // again under the same lock as the slot was issued with (review F4).
  const { data: purpose, error: completeError } = await db.rpc("media_complete", {
    p_media_id: input.mediaId,
    p_event_id: event.id,
    p_player_id: player.id,
    p_photo_cap: WALL_LIMITS.photosPerPlayer,
    p_voice_cap: WALL_LIMITS.voicePerPlayer,
    p_event_cap: WALL_LIMITS.mediaPerEvent,
  });
  if (completeError) throw new Error(`media complete failed: ${completeError.message}`);
  if (!purpose) return fail("not_found", 404);
  if (purpose === "quota") return fail("quota", 409);
  const media = { id: input.mediaId, purpose };

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
