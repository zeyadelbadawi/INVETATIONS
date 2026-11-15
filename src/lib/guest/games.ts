import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import type { PublicEvent } from "@/lib/events/published";
import type { GuestContext } from "@/lib/guest/session";
import { award } from "@/lib/guest/scores";
import { openGame, type BoundGame } from "@/play/registry";
import { gameRef, submitReason } from "@/play/scoring";
import { isExpired, type QuizConfig } from "@/play/modules/quiz";
import type { GameState } from "@/play/types";

type GameRow = { id: string; kind: string; config: unknown; state: string; opens_at: string | null; closes_at: string | null };

function effectiveState(row: GameRow, now: number): GameState {
  if (row.state === "open") {
    if (row.opens_at && new Date(row.opens_at).getTime() > now) return "hidden";
    if (row.closes_at && new Date(row.closes_at).getTime() <= now) return "closed";
  }
  return row.state as GameState;
}

const seedFor = (gameId: string, playerId: string | undefined) => `${gameId}:${playerId ?? "anon"}`;

export type GameSummary = {
  id: string;
  kind: string;
  state: GameState;
  view: unknown;
  answered: string[];
  myPoints: number;
  tally: unknown;
  results: unknown;
};

// Everything a guest may see about the event's games. Truth is read only for
// games that are closed or settled, and only to show results.
export async function listGames(event: PublicEvent, guest: GuestContext | null): Promise<GameSummary[]> {
  if (!event.entitlements.games) return [];
  const db = adminDb();
  const now = Date.now();
  const { data: rows } = await db
    .from("games")
    .select("id, kind, config, state, opens_at, closes_at")
    .eq("event_id", event.id)
    .neq("state", "hidden")
    .order("position");
  const games = (rows ?? []).filter((g) => effectiveState(g, now) !== "hidden");
  if (games.length === 0) return [];

  const player = guest?.player?.approved ? guest.player : null;
  const ids = games.map((g) => g.id);
  const { data: answers } = await db
    .from("game_answers")
    .select("game_id, player_id, question_id, payload, score")
    .eq("event_id", event.id)
    .in("game_id", ids);

  const finished = games.filter((g) => ["closed", "settled"].includes(effectiveState(g, now))).map((g) => g.id);
  const { data: secrets } = finished.length > 0
    ? await db.from("game_secrets").select("game_id, truth").in("game_id", finished)
    : { data: [] as { game_id: string; truth: unknown }[] };
  const truthById = new Map((secrets ?? []).map((s) => [s.game_id, s.truth]));

  const out: GameSummary[] = [];
  for (const row of games) {
    const bound = openGame(row.kind, row.config);
    if (!bound) continue;
    const state = effectiveState(row, now);
    const all = (answers ?? []).filter((a) => a.game_id === row.id);
    const mine = player ? all.filter((a) => a.player_id === player.id) : [];
    const truth = truthById.get(row.id);
    // Prediction results wait for settlement; quiz and vote show theirs once closed.
    const showResults = truth !== undefined && (state === "settled" || (state === "closed" && row.kind !== "prediction"));
    out.push({
      id: row.id,
      kind: row.kind,
      state,
      view: bound.publicView(state, { now, seed: seedFor(row.id, player?.id) }),
      answered: mine.map((a) => a.question_id),
      myPoints: mine.reduce((sum, a) => sum + a.score, 0),
      tally: player
        ? bound.tally(state, all.map((a) => ({ questionId: a.question_id, answer: a.payload })), { viewerHasAnswered: mine.length > 0 })
        : null,
      results: showResults ? bound.results(truth) : null,
    });
  }
  return out;
}

async function loadOpenGame(event: PublicEvent, gameId: string): Promise<{ row: GameRow; bound: BoundGame } | null> {
  const { data: row } = await adminDb()
    .from("games")
    .select("id, kind, config, state, opens_at, closes_at")
    .eq("event_id", event.id)
    .eq("id", gameId)
    .maybeSingle();
  if (!row || effectiveState(row, Date.now()) !== "open") return null;
  const bound = openGame(row.kind, row.config);
  return bound ? { row, bound } : null;
}

export type ServeResult =
  | { ok: true; done: false; question: unknown; servedAt: number; seconds: number | null }
  | { ok: true; done: true }
  | { ok: false; reason: "not_open" };

// Hands a timed quiz to the player one question at a time and stamps when each
// was served, so the answer time is measured by the server (security G2).
export async function serveQuestion(event: PublicEvent, player: NonNullable<GuestContext["player"]>, gameId: string): Promise<ServeResult> {
  const game = await loadOpenGame(event, gameId);
  if (!game) return { ok: false, reason: "not_open" };
  const db = adminDb();
  const now = Date.now();

  const [{ data: answered }, { data: served }] = await Promise.all([
    db.from("game_answers").select("question_id").eq("game_id", gameId).eq("player_id", player.id),
    db.from("game_serves").select("question_id, served_at").eq("game_id", gameId).eq("player_id", player.id),
  ]);
  const config = game.bound.config as QuizConfig;
  const timed = game.row.kind === "quiz" && config.timed;
  const answeredIds = new Set((answered ?? []).map((a) => a.question_id));

  const done = new Set(answeredIds);
  for (const s of served ?? []) {
    const at = new Date(s.served_at).getTime();
    if (answeredIds.has(s.question_id)) continue;
    if (timed && isExpired(config, at, now)) {
      done.add(s.question_id);
    } else {
      // Still running: hand back the same question with its original start time.
      return {
        ok: true, done: false, servedAt: at, seconds: timed ? config.secondsPerQuestion : null,
        question: game.bound.question(s.question_id, { now, seed: seedFor(gameId, player.id) }),
      };
    }
  }

  const next = game.bound.nextQuestionId([...done]);
  if (!next) return { ok: true, done: true };
  const { error } = await db.from("game_serves").insert({
    event_id: event.id, game_id: gameId, player_id: player.id, question_id: next, served_at: new Date(now).toISOString(),
  });
  if (error) throw new Error(`serve failed: ${error.message}`);
  return {
    ok: true, done: false, servedAt: now, seconds: timed ? config.secondsPerQuestion : null,
    question: game.bound.question(next, { now, seed: seedFor(gameId, player.id) }),
  };
}

export type AnswerResult =
  | { ok: true; points: number }
  | { ok: false; reason: "not_open" | "invalid" | "already_answered" };

export async function submitAnswer(
  event: PublicEvent,
  player: NonNullable<GuestContext["player"]>,
  gameId: string,
  questionId: string,
  rawAnswer: unknown,
): Promise<AnswerResult> {
  const game = await loadOpenGame(event, gameId);
  if (!game) return { ok: false, reason: "not_open" };
  const db = adminDb();
  const now = Date.now();
  const payload = game.bound.acceptAnswer(questionId, rawAnswer, { now });
  if (payload === null) return { ok: false, reason: "invalid" };

  const { data: serve } = await db
    .from("game_serves")
    .select("served_at")
    .eq("game_id", gameId)
    .eq("player_id", player.id)
    .eq("question_id", questionId)
    .maybeSingle();
  const servedAt = serve ? new Date(serve.served_at).getTime() : null;

  let truth: unknown = null;
  if (game.bound.needsTruthOnSubmit) {
    const { data: secret } = await db.from("game_secrets").select("truth").eq("game_id", gameId).maybeSingle();
    truth = secret?.truth ?? null;
    if (truth === null) return { ok: false, reason: "not_open" };
  }
  const points = game.bound.scoreOnSubmit(truth, questionId, payload, { servedAt, answeredAt: now });

  // The unique key makes a double submit lose the race instead of scoring twice.
  const { error } = await db.from("game_answers").insert({
    event_id: event.id,
    game_id: gameId,
    player_id: player.id,
    question_id: questionId,
    payload: payload as never,
    score: points,
    served_at: servedAt ? new Date(servedAt).toISOString() : null,
    answered_at: new Date(now).toISOString(),
  });
  if (error) {
    if (error.code === "23505") return { ok: false, reason: "already_answered" };
    throw new Error(`answer failed: ${error.message}`);
  }
  await award(event.id, player, submitReason(game.bound.kind), gameRef(gameId, questionId), points);
  return { ok: true, points };
}
