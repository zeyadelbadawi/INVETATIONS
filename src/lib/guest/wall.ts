import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import type { PublicEvent } from "@/lib/events/published";
import type { GuestContext } from "@/lib/guest/session";
import { signedMediaUrls } from "@/lib/media/process";

// Caps count uploaded and processed files; unfinished slots are limited per
// player and swept after an hour (review F4).
export const WALL_LIMITS = { photosPerPlayer: 10, voicePerPlayer: 3, mediaPerEvent: 600, pendingPerPlayer: 3, uploadBytes: 2_000_000 } as const;

export function playerCap(purpose: "wall_photo" | "wall_voice" | string): number {
  return purpose === "wall_voice" ? WALL_LIMITS.voicePerPlayer : WALL_LIMITS.photosPerPlayer;
}
const REPORTS_TO_HIDE = 3;

export type WallItem = {
  id: string;
  kind: "text" | "voice" | "photo";
  body: string | null;
  author: string;
  teamId: string | null;
  mine: boolean;
  status: "visible" | "pending";
  mediaUrl: string | null;
  createdAt: string;
};

// What an approved player may see: visible posts, plus their own pending ones.
// Photos stay with the hosts when the event is set that way.
export async function readWall(event: PublicEvent, guest: GuestContext): Promise<WallItem[]> {
  const player = guest.player;
  if (!player || !player.approved) return [];
  const db = adminDb();
  const { data: posts } = await db
    .from("wall_posts")
    .select("id, kind, body, media_id, status, player_id, created_at")
    .eq("event_id", event.id)
    .is("removed_by_staff_at", null)
    .or(`status.eq.visible,and(status.eq.pending,player_id.eq.${player.id})`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (!posts || posts.length === 0) return [];

  const visible = posts.filter((p) => !(p.kind === "photo" && event.settings.photosHostOnly && p.player_id !== player.id));
  const playerIds = [...new Set(visible.map((p) => p.player_id))];
  const mediaIds = visible.map((p) => p.media_id).filter((id): id is string => id !== null);

  const [{ data: authors }, { data: media }] = await Promise.all([
    db.from("players").select("id, name, team_id").eq("event_id", event.id).in("id", playerIds),
    mediaIds.length > 0
      ? db.from("media").select("id, clean_path, state").eq("event_id", event.id).in("id", mediaIds).eq("state", "processed")
      : Promise.resolve({ data: [] as { id: string; clean_path: string | null; state: string }[] }),
  ]);
  const urls = await signedMediaUrls((media ?? []).map((m) => m.clean_path).filter((p): p is string => p !== null));
  const pathById = new Map((media ?? []).map((m) => [m.id, m.clean_path]));
  const authorById = new Map((authors ?? []).map((a) => [a.id, a]));

  return visible
    // A media post is shown only once its file has passed processing.
    .filter((p) => p.kind === "text" || (p.media_id && pathById.get(p.media_id)))
    .map((p) => {
      const author = authorById.get(p.player_id);
      const path = p.media_id ? pathById.get(p.media_id) : null;
      return {
        id: p.id,
        kind: p.kind as WallItem["kind"],
        body: p.body,
        // First name only on the wall.
        author: (author?.name ?? "").split(" ")[0],
        teamId: author?.team_id ?? null,
        mine: p.player_id === player.id,
        status: p.status as WallItem["status"],
        mediaUrl: path ? (urls.get(path) ?? null) : null,
        createdAt: p.created_at,
      };
    });
}

export function initialPostStatus(guest: GuestContext, kind: "text" | "voice" | "photo"): "visible" | "pending" {
  if (kind !== "text") return "pending"; // media waits for processing; photos also for approval
  return guest.invitation.kind !== "open" && guest.player?.approved ? "visible" : "pending";
}

// Reports count only from approved players who came through a personal or
// group link (review F8): walk-ins waiting for approval can still press the
// button, but it changes nothing. The count and the hide-at-three rule are
// applied in one statement, which re-checks the reporter in the database.
export function reportCounts(guest: GuestContext): boolean {
  return Boolean(guest.player?.approved) && guest.invitation.kind !== "open";
}

export async function reportPost(event: PublicEvent, guest: GuestContext, postId: string): Promise<boolean> {
  if (!guest.player || !reportCounts(guest)) return false;
  const { data, error } = await adminDb().rpc("wall_report", {
    p_event_id: event.id,
    p_post_id: postId,
    p_player_id: guest.player.id,
    p_threshold: REPORTS_TO_HIDE,
  });
  if (error) throw new Error(`report failed: ${error.message}`);
  return data === true;
}
