import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { fail, guestWrite, json } from "@/lib/guest/route";
import { playerCap, WALL_LIMITS } from "@/lib/guest/wall";
import { limits, withinLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  purpose: z.enum(["wall_photo", "wall_voice"]),
  bytes: z.number().int().positive().max(WALL_LIMITS.uploadBytes),
});

// Issues a one-time upload slot in the quarantine bucket. Caps are enforced here,
// before any bytes are accepted (security rule 31), and again when the upload
// is completed. Only approved players get slots (review F4): a walk-in waiting
// for the host cannot fill the event's media quota.
export const POST = guestWrite({ schema, requirePlayer: true, allowWhenClosed: true }, async ({ event, guest, input }) => {
  if (event.status === "cancelled") return fail("event_closed", 409);
  const player = guest.player!;
  if (!player.approved) return fail("not_approved", 403);
  const photo = input.purpose === "wall_photo";
  if (photo ? !event.entitlements.photos : !event.entitlements.voice) return fail("not_included", 403);
  if (!(await withinLimit(`upload:${player.id}`, limits.uploadPerPlayer))) return fail("slow_down", 429);

  const db = adminDb();
  const id = crypto.randomUUID();
  const path = `${event.id}/${id}`;
  // One statement, serialised per event: counts uploaded and processed files
  // toward the caps and limits unfinished slots per player.
  const { data: slot, error } = await db.rpc("media_reserve", {
    p_id: id,
    p_event_id: event.id,
    p_player_id: player.id,
    p_purpose: input.purpose,
    p_path: path,
    p_player_cap: playerCap(input.purpose),
    p_event_cap: WALL_LIMITS.mediaPerEvent,
    p_pending_cap: WALL_LIMITS.pendingPerPlayer,
  });
  if (error) throw new Error(`media reserve failed: ${error.message}`);
  if (slot === "pending") return fail("slow_down", 429);
  if (slot !== "ok") return fail("quota", 409);

  const signed = await db.storage.from("quarantine").createSignedUploadUrl(path);
  if (signed.error || !signed.data) throw new Error(`signed upload failed: ${signed.error?.message}`);
  return json({ mediaId: id, uploadUrl: signed.data.signedUrl, token: signed.data.token, path });
});
