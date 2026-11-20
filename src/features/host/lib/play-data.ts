import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { isGameKind } from "@/play/registry";
import type { GameKind, GameState } from "@/play/types";

// Reads for the host's control page. Callers authorise first; every query is
// filtered by the event id, so nothing from another event can come back.

export type PlayerView = {
  id: string;
  name: string;
  teamId: string | null;
  invitation: string;
  invitationKind: "personal" | "group" | "open" | null;
  approved: boolean;
};

export type PostView = {
  id: string;
  kind: "text" | "voice" | "photo";
  body: string | null;
  status: "visible" | "pending" | "hidden";
  reported: number;
  locked: boolean;
  author: string;
  createdAt: string;
  // Present when the post has media; `ready` once the upload has been checked and re-encoded.
  media: { id: string; ready: boolean } | null;
};

export type GameView = {
  id: string;
  kind: GameKind;
  config: unknown;
  state: GameState;
  answers: number;
  // Whether correct answers are stored. Only ever a yes/no: the answers themselves stay on the server.
  hasTruth: boolean;
};

export type RevealStatus = {
  exists: boolean;
  sealedAt: string | null;
  sealCount: number;
  revealAt: string | null;
  revealedAt: string | null;
};

export type LiveView = { phase: "idle" | "countdown" | "revealed"; revealAt: string | null; answer: ("boy" | "girl")[] | null };

export async function loadPlayers(db: AdminClient, eventId: string): Promise<PlayerView[]> {
  const [{ data: players }, { data: invitations }] = await Promise.all([
    db
      .from("players")
      .select("id, name, team_id, approved, invitation_id, created_at")
      .eq("event_id", eventId)
      .is("removed_at", null)
      .order("created_at")
      .limit(3000),
    db.from("invitations").select("id, label, kind").eq("event_id", eventId).limit(3000),
  ]);
  const label = new Map((invitations ?? []).map((i) => [i.id, i.label]));
  const kind = new Map((invitations ?? []).map((i) => [i.id, i.kind as PlayerView["invitationKind"]]));
  return (players ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    teamId: p.team_id,
    invitation: label.get(p.invitation_id) ?? "",
    invitationKind: kind.get(p.invitation_id) ?? null,
    approved: p.approved,
  }));
}

export async function loadPosts(db: AdminClient, eventId: string): Promise<PostView[]> {
  const { data: posts } = await db
    .from("wall_posts")
    .select("id, kind, body, media_id, status, reported_count, removed_by_staff_at, player_id, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (!posts || posts.length === 0) return [];
  const playerIds = [...new Set(posts.map((p) => p.player_id))];
  const mediaIds = posts.flatMap((p) => (p.media_id ? [p.media_id] : []));
  const [{ data: players }, { data: media }] = await Promise.all([
    db.from("players").select("id, name").eq("event_id", eventId).in("id", playerIds),
    mediaIds.length > 0
      ? db.from("media").select("id, state").eq("event_id", eventId).in("id", mediaIds)
      : Promise.resolve({ data: [] as { id: string; state: string }[] }),
  ]);
  const name = new Map((players ?? []).map((p) => [p.id, p.name]));
  const state = new Map((media ?? []).map((m) => [m.id, m.state]));
  return posts.map((p) => ({
    id: p.id,
    kind: p.kind as PostView["kind"],
    body: p.body,
    status: p.status as PostView["status"],
    reported: p.reported_count,
    locked: p.removed_by_staff_at !== null,
    author: name.get(p.player_id) ?? "",
    createdAt: p.created_at,
    media: p.media_id ? { id: p.media_id, ready: state.get(p.media_id) === "processed" } : null,
  }));
}

export async function loadGames(db: AdminClient, eventId: string, includeTruthFlag: boolean): Promise<GameView[]> {
  const { data: games } = await db
    .from("games")
    .select("id, kind, config, state, position")
    .eq("event_id", eventId)
    .order("position")
    .limit(30);
  const rows = (games ?? []).filter((g) => isGameKind(g.kind));
  if (rows.length === 0) return [];
  const ids = rows.map((g) => g.id);
  const [counts, secrets] = await Promise.all([
    Promise.all(
      ids.map((id) =>
        db.from("game_answers").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("game_id", id),
      ),
    ),
    // Only the ids of games that have answers stored — never the answers.
    includeTruthFlag ? db.from("game_secrets").select("game_id").in("game_id", ids) : Promise.resolve({ data: [] as { game_id: string }[] }),
  ]);
  const withTruth = new Set((secrets.data ?? []).map((s) => s.game_id));
  return rows.map((g, index) => ({
    id: g.id,
    kind: g.kind as GameKind,
    config: g.config,
    state: g.state as GameState,
    answers: counts[index].count ?? 0,
    hasTruth: withTruth.has(g.id),
  }));
}

// Progress of the reveal without anything about the answer: the sealed value,
// its nonce and the key version are never selected here (security R1, rule 29).
export async function readRevealStatus(db: AdminClient, eventId: string): Promise<RevealStatus> {
  const { data } = await db
    .from("reveals")
    .select("sealed_at, seal_count, reveal_at, revealed_at")
    .eq("event_id", eventId)
    .maybeSingle();
  return {
    exists: data !== null,
    sealedAt: data?.sealed_at ?? null,
    sealCount: data?.seal_count ?? 0,
    revealAt: data?.reveal_at ?? null,
    revealedAt: data?.revealed_at ?? null,
  };
}

export async function readLiveView(db: AdminClient, eventId: string): Promise<LiveView> {
  const { data } = await db.from("live_state").select("phase, public_payload").eq("event_id", eventId).maybeSingle();
  const payload = (data?.public_payload ?? {}) as { revealAt?: unknown; answer?: unknown };
  const phase = data?.phase === "countdown" || data?.phase === "revealed" ? data.phase : "idle";
  const answer =
    phase === "revealed" && Array.isArray(payload.answer)
      ? payload.answer.filter((a): a is "boy" | "girl" => a === "boy" || a === "girl")
      : null;
  return { phase, revealAt: typeof payload.revealAt === "string" ? payload.revealAt : null, answer };
}

export const SIGNED_URL_SECONDS = 600;

// Short-lived read links for wall photos and voice notes (security V2: at most
// ten minutes). The storage path is never sent to the browser.
export async function signWallMedia(db: AdminClient, eventId: string, mediaIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(mediaIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 80);
  if (ids.length === 0) return {};
  const { data: rows } = await db
    .from("media")
    .select("id, clean_path")
    .eq("event_id", eventId)
    .in("id", ids)
    .eq("state", "processed")
    .in("purpose", ["wall_photo", "wall_voice"]);
  const ready = (rows ?? []).filter((r): r is { id: string; clean_path: string } => typeof r.clean_path === "string");
  if (ready.length === 0) return {};
  const { data: signed, error } = await db.storage.from("media").createSignedUrls(
    ready.map((r) => r.clean_path),
    SIGNED_URL_SECONDS,
  );
  if (error || !signed) return {};
  const out: Record<string, string> = {};
  signed.forEach((entry, index) => {
    if (entry.signedUrl) out[ready[index].id] = entry.signedUrl;
  });
  return out;
}
