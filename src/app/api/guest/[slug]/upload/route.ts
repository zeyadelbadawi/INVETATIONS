import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { fail, guestWrite, json } from "@/lib/guest/route";
import { WALL_LIMITS } from "@/lib/guest/wall";
import { limits, withinLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  purpose: z.enum(["wall_photo", "wall_voice"]),
  bytes: z.number().int().positive().max(WALL_LIMITS.uploadBytes),
});

// Issues a one-time upload slot in the quarantine bucket. Caps are enforced here,
// before any bytes are accepted (security rule 31).
export const POST = guestWrite({ schema, requirePlayer: true, allowWhenClosed: true }, async ({ event, guest, input }) => {
  if (event.status === "cancelled") return fail("event_closed", 409);
  const player = guest.player!;
  const photo = input.purpose === "wall_photo";
  if (photo ? !event.entitlements.photos : !event.entitlements.voice) return fail("not_included", 403);
  if (!(await withinLimit(`upload:${player.id}`, limits.uploadPerPlayer))) return fail("slow_down", 429);

  const db = adminDb();
  const [mine, all] = await Promise.all([
    db.from("media").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("player_id", player.id).eq("purpose", input.purpose).neq("state", "rejected"),
    db.from("media").select("id", { count: "exact", head: true }).eq("event_id", event.id).neq("state", "rejected"),
  ]);
  if ((mine.count ?? 0) >= (photo ? WALL_LIMITS.photosPerPlayer : WALL_LIMITS.voicePerPlayer)) return fail("quota", 409);
  if ((all.count ?? 0) >= WALL_LIMITS.mediaPerEvent) return fail("quota", 409);

  const id = crypto.randomUUID();
  const path = `${event.id}/${id}`;
  const { error } = await db.from("media").insert({ id, event_id: event.id, player_id: player.id, purpose: input.purpose, quarantine_path: path });
  if (error) throw new Error(`media insert failed: ${error.message}`);

  const signed = await db.storage.from("quarantine").createSignedUploadUrl(path);
  if (signed.error || !signed.data) throw new Error(`signed upload failed: ${signed.error?.message}`);
  return json({ mediaId: id, uploadUrl: signed.data.signedUrl, token: signed.data.token, path });
});
