import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/events/access";
import { refreshScores } from "@/lib/guest/scores";
import { openGame, parseGame } from "@/play/registry";
import { gameRef, settleReason } from "@/play/scoring";
import { starterGames, type Occasion } from "@/play/banks";

// Host-side game management. Callers authorise first and pass the actor.

type Result<T = object> = ({ ok: true } & T) | { ok: false; issues: string[] };

const actorKind = (actor: Actor) => (actor.kind === "staff" ? "staff" : "host");

export async function addStarterGames(eventId: string, actor: Actor, occasion: Occasion): Promise<number> {
  const db = adminDb();
  const { count } = await db.from("games").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if ((count ?? 0) > 0) return 0;
  const rows = starterGames(occasion).map((g, i) => ({ event_id: eventId, kind: g.kind, config: g.config as never, position: i }));
  const { error } = await db.from("games").insert(rows);
  if (error) throw new Error(`starter games failed: ${error.message}`);
  await audit({ actorId: actor.userId, actorKind: actorKind(actor), action: "games.starter_added", eventId, grantId: actor.grantId });
  return rows.length;
}

export async function saveGame(eventId: string, actor: Actor, input: { id?: string; kind: string; config: unknown }): Promise<Result<{ id: string }>> {
  const parsed = parseGame(input.kind, input.config);
  if (!parsed.ok) return parsed;
  const db = adminDb();
  if (input.id) {
    // The questions cannot change once guests have started answering.
    const { count } = await db.from("game_answers").select("id", { count: "exact", head: true }).eq("game_id", input.id);
    if ((count ?? 0) > 0) return { ok: false, issues: ["guests have already answered this game"] };
    const { data, error } = await db
      .from("games")
      .update({ config: parsed.game.config as never })
      .eq("event_id", eventId)
      .eq("id", input.id)
      .eq("kind", parsed.game.kind)
      .select("id");
    if (error) throw new Error(`game update failed: ${error.message}`);
    if (!data || data.length === 0) return { ok: false, issues: ["game not found"] };
    // A changed quiz invalidates the stored answers.
    await db.from("game_secrets").delete().eq("game_id", input.id);
    return { ok: true, id: input.id };
  }
  const { count } = await db.from("games").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if ((count ?? 0) >= 30) return { ok: false, issues: ["too many games"] };
  const { data, error } = await db
    .from("games")
    .insert({ event_id: eventId, kind: parsed.game.kind, config: parsed.game.config as never, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !data) throw new Error(`game insert failed: ${error?.message}`);
  await audit({ actorId: actor.userId, actorKind: actorKind(actor), action: "game.created", eventId, target: data.id, grantId: actor.grantId });
  return { ok: true, id: data.id };
}

async function load(eventId: string, gameId: string) {
  const { data: row } = await adminDb().from("games").select("id, kind, config, state").eq("event_id", eventId).eq("id", gameId).maybeSingle();
  if (!row) return null;
  const bound = openGame(row.kind, row.config);
  return bound ? { row, bound } : null;
}

// Stores the correct answers. They live in their own table that no guest route
// reads while the game is open.
export async function setTruth(eventId: string, gameId: string, rawTruth: unknown): Promise<Result> {
  const game = await load(eventId, gameId);
  if (!game) return { ok: false, issues: ["game not found"] };
  const checked = game.bound.parseTruth(rawTruth);
  if (!checked.ok) return checked;
  const { error } = await adminDb().from("game_secrets").upsert({ game_id: gameId, truth: checked.truth as never });
  if (error) throw new Error(`truth save failed: ${error.message}`);
  return { ok: true };
}

export async function setGameState(eventId: string, actor: Actor, gameId: string, state: "hidden" | "open" | "closed"): Promise<Result> {
  const game = await load(eventId, gameId);
  if (!game) return { ok: false, issues: ["game not found"] };
  if (game.row.state === "settled") return { ok: false, issues: ["this game is already settled"] };
  const db = adminDb();
  if (state === "open" && game.bound.needsTruthOnSubmit) {
    const { data: secret } = await db.from("game_secrets").select("game_id").eq("game_id", gameId).maybeSingle();
    if (!secret) return { ok: false, issues: ["set the correct answers first"] };
  }
  const { error } = await db.from("games").update({ state }).eq("event_id", eventId).eq("id", gameId);
  if (error) throw new Error(`game state failed: ${error.message}`);
  await audit({ actorId: actor.userId, actorKind: actorKind(actor), action: `game.${state}`, eventId, target: gameId, grantId: actor.grantId });
  return { ok: true };
}

// Scores every answer against the truth and marks the game settled. Idempotent:
// each award is keyed by player, reason and question.
export async function settleGame(eventId: string, actor: Actor, gameId: string): Promise<Result<{ awarded: number }>> {
  const game = await load(eventId, gameId);
  if (!game) return { ok: false, issues: ["game not found"] };
  if (game.row.state === "open") return { ok: false, issues: ["close the game first"] };
  const db = adminDb();
  const { data: secret } = await db.from("game_secrets").select("truth").eq("game_id", gameId).maybeSingle();
  // Questions tied to the gender reveal take their answer from the released
  // reveal, never from the host (security R1).
  const derived: Record<string, string> = {};
  const questions = (game.bound.config as { questions?: { id: string; truthFromReveal?: boolean }[] }).questions ?? [];
  const fromReveal = questions.filter((q) => q.truthFromReveal);
  if (fromReveal.length > 0) {
    const { data: live } = await db.from("live_state").select("phase, public_payload").eq("event_id", eventId).maybeSingle();
    const answer = live?.phase === "revealed" ? ((live.public_payload as { answer?: string[] }).answer ?? []) : [];
    if (answer.length === 0) return { ok: false, issues: ["wait for the reveal before settling this game"] };
    if (answer.every((a) => a === answer[0])) for (const q of fromReveal) derived[q.id] = answer[0];
  }
  const settled = game.bound.settle(secret?.truth ?? { answers: {} }, derived);
  if (!settled.ok) return settled;

  const { data: answers } = await db
    .from("game_answers")
    .select("player_id, question_id, payload")
    .eq("event_id", eventId)
    .eq("game_id", gameId);
  const playerIds = [...new Set((answers ?? []).map((a) => a.player_id))];
  const { data: players } = playerIds.length > 0
    ? await db.from("players").select("id, team_id, approved, removed_at").eq("event_id", eventId).in("id", playerIds)
    : { data: [] as { id: string; team_id: string | null; approved: boolean; removed_at: string | null }[] };
  const playerById = new Map((players ?? []).map((p) => [p.id, p]));

  const rows = [];
  for (const a of answers ?? []) {
    const player = playerById.get(a.player_id);
    if (!player || !player.approved || player.removed_at) continue;
    const points = game.bound.scoreOnSettle(settled.truth, a.question_id, a.payload);
    if (points === 0) continue;
    rows.push({
      event_id: eventId, player_id: a.player_id, team_id: player.team_id, points,
      reason: settleReason(game.bound.kind), ref: gameRef(gameId, a.question_id),
    });
  }
  if (rows.length > 0) {
    const { error } = await db.from("score_events").upsert(rows, { onConflict: "player_id,reason,ref", ignoreDuplicates: true });
    if (error) throw new Error(`settle failed: ${error.message}`);
  }
  await db.from("games").update({ state: "settled" }).eq("event_id", eventId).eq("id", gameId);
  await refreshScores(eventId);
  await audit({ actorId: actor.userId, actorKind: actorKind(actor), action: "game.settled", eventId, target: gameId, grantId: actor.grantId });
  return { ok: true, awarded: rows.length };
}
