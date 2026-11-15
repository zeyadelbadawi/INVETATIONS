import "server-only";
import { registerJob } from "@/lib/jobs/runner";
import { processMedia, sweepQuarantine } from "@/lib/media/process";
import { adminDb } from "@/lib/supabase/admin";

// Importing this module registers every job handler.

registerJob("media.process", async (payload) => {
  const mediaId = String(payload.mediaId ?? "");
  const result = await processMedia(mediaId);
  if (result !== "processed") return;

  // Voice notes from invited guests go live once verified; photos always wait
  // for the host or a moderator (security V2).
  const db = adminDb();
  const { data: post } = await db
    .from("wall_posts")
    .select("id, kind, player_id, event_id")
    .eq("media_id", mediaId)
    .maybeSingle();
  if (!post || post.kind !== "voice") return;
  const { data: player } = await db
    .from("players")
    .select("approved, removed_at, invitation_id")
    .eq("event_id", post.event_id)
    .eq("id", post.player_id)
    .maybeSingle();
  if (!player || !player.approved || player.removed_at) return;
  const { data: invitation } = await db.from("invitations").select("kind").eq("id", player.invitation_id).maybeSingle();
  if (invitation && invitation.kind !== "open") {
    await db.from("wall_posts").update({ status: "visible" }).eq("id", post.id).eq("status", "pending").is("removed_by_staff_at", null);
  }
});

registerJob("media.sweep", async () => {
  await sweepQuarantine();
});
