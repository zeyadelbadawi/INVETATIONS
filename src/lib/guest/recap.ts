import "server-only";
import type { Localized } from "@/content/schema";
import { adminDb } from "@/lib/supabase/admin";
import type { PublicEvent } from "@/lib/events/published";
import type { GuestContext } from "@/lib/guest/session";
import { signedMediaUrls } from "@/lib/media/process";

export const RECAP_LIMITS = { topPerTeam: 3, highlights: 12 } as const;

export type Recap = {
  teams: { id: string; key: string; name: Localized; color: string; score: number; players: number }[];
  winnerTeamId: string | null; // null = tie or nobody scored
  // First names only, approved players only (security rule 20, V1).
  topPlayers: { teamId: string; players: { name: string; points: number }[] }[];
  myPoints: number | null;
  highlights: { id: string; kind: "text" | "voice" | "photo"; author: string; text: string; mediaUrl: string | null }[];
};

export function hasEnded(event: Pick<PublicEvent, "status" | "endsAt">, now = Date.now()): boolean {
  if (event.status === "ended") return true;
  return event.status === "published" && event.endsAt !== null && new Date(event.endsAt).getTime() < now;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

// Null until the event is over: nothing about standings or highlights is
// served before then.
export async function readRecap(event: PublicEvent, guest: GuestContext): Promise<Recap | null> {
  if (!hasEnded(event)) return null;
  const db = adminDb();

  const [{ data: teams }, { data: scores }, { data: top, error: topError }, { data: posts }, mine] = await Promise.all([
    db.from("teams").select("id, key, name_ar, name_en, color").eq("event_id", event.id).order("position"),
    db.from("team_scores").select("team_id, score, active_players").eq("event_id", event.id),
    db.rpc("recap_top_players", { p_event_id: event.id, p_per_team: RECAP_LIMITS.topPerTeam }),
    db
      .from("wall_posts")
      .select("id, kind, body, media_id, player_id, created_at")
      .eq("event_id", event.id)
      .eq("highlighted", true)
      .eq("status", "visible")
      .is("removed_by_staff_at", null)
      .order("created_at", { ascending: true })
      .limit(RECAP_LIMITS.highlights * 2),
    guest.player
      ? db.from("score_events").select("points").eq("event_id", event.id).eq("player_id", guest.player.id).limit(1000)
      : Promise.resolve({ data: null as { points: number }[] | null }),
  ]);
  if (topError) throw new Error(`recap top players failed: ${topError.message}`);

  const scoreByTeam = new Map((scores ?? []).map((s) => [s.team_id, s]));
  const teamList = (teams ?? []).map((t) => ({
    id: t.id,
    key: t.key,
    name: { ar: t.name_ar, en: t.name_en },
    color: t.color,
    score: Number(scoreByTeam.get(t.id)?.score ?? 0),
    players: scoreByTeam.get(t.id)?.active_players ?? 0,
  }));
  const best = Math.max(0, ...teamList.map((t) => t.score));
  const leaders = teamList.filter((t) => t.score === best);
  const winnerTeamId = best > 0 && leaders.length === 1 ? leaders[0].id : null;

  const topPlayers = teamList.map((team) => ({
    teamId: team.id,
    players: (top ?? [])
      .filter((row) => row.team_id === team.id)
      .slice(0, RECAP_LIMITS.topPerTeam)
      .map((row) => ({ name: firstName(row.name), points: Number(row.points) })),
  }));

  // Highlights: only visible posts by players who are still approved and in
  // the event. Photos follow the wall's rules: approved players only, and not
  // when the hosts keep photos to themselves (security V2).
  const authorIds = [...new Set((posts ?? []).map((p) => p.player_id))];
  const { data: authors } = authorIds.length
    ? await db.from("players").select("id, name, approved, removed_at").eq("event_id", event.id).in("id", authorIds)
    : { data: [] as { id: string; name: string; approved: boolean; removed_at: string | null }[] };
  const authorById = new Map((authors ?? []).filter((a) => a.approved && !a.removed_at).map((a) => [a.id, a]));
  const showPhotos = Boolean(guest.player?.approved) && !event.settings.photosHostOnly;
  const photoIds = showPhotos
    ? (posts ?? []).filter((p) => p.kind === "photo" && p.media_id && authorById.has(p.player_id)).map((p) => p.media_id as string)
    : [];
  const { data: media } = photoIds.length
    ? await db.from("media").select("id, clean_path").eq("event_id", event.id).in("id", photoIds).eq("state", "processed").eq("purpose", "wall_photo")
    : { data: [] as { id: string; clean_path: string | null }[] };
  const pathById = new Map((media ?? []).filter((m) => m.clean_path).map((m) => [m.id, m.clean_path as string]));
  const urls = await signedMediaUrls([...pathById.values()]);

  const highlights: Recap["highlights"] = [];
  for (const post of posts ?? []) {
    if (highlights.length >= RECAP_LIMITS.highlights) break;
    const author = authorById.get(post.player_id);
    if (!author) continue;
    const path = post.kind === "photo" && post.media_id ? pathById.get(post.media_id) : undefined;
    const mediaUrl = path ? (urls.get(path) ?? null) : null;
    const text = post.body ?? "";
    if (!text && !mediaUrl) continue;
    highlights.push({ id: post.id, kind: post.kind as Recap["highlights"][number]["kind"], author: firstName(author.name), text, mediaUrl });
  }

  const myPoints = mine.data ? mine.data.reduce((sum, row) => sum + row.points, 0) : null;
  return { teams: teamList, winnerTeamId, topPlayers, myPoints, highlights };
}
