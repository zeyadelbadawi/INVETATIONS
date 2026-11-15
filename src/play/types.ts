// Shared types of the play engine. A game is stored as `{ kind, config }` — public,
// never any truth — plus a separate `truth` object that only server scoring code
// reads (security rules 22–23). Everything in src/play is pure: time and seeds are
// passed in, so the same code runs in route handlers and client components.
import type { ZodType } from "zod";
import type { Localized } from "@/content/schema";

export type { Localized };

export const GAME_KINDS = ["quiz", "vote", "prediction", "clues"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export const GAME_STATES = ["hidden", "open", "closed", "settled"] as const;
export type GameState = (typeof GAME_STATES)[number];

// Milliseconds since the epoch, both stamped by the server. `servedAt` is null
// when the question was never served one at a time.
export type Timing = { servedAt: number | null; answeredAt: number };

export type ViewOptions = { now: number; seed?: string };
export type QuestionOptions = { now: number; seed: string };

export type OptionCount = { id: string; count: number };
export type NumberStats = { min: number; max: number; median: number };

// Why a question's breakdown is withheld: the game's state does not allow it yet,
// the viewer must vote first, or too few people answered to keep votes anonymous.
export type Suppressed = "state" | "vote_first" | "too_few";

export type QuestionTally = {
  id: string;
  total: number;
  options: OptionCount[] | null;
  numbers: NumberStats | null;
  suppressed: Suppressed | null;
};
export type Tally = { questions: QuestionTally[] };

export type StoredAnswer<Answer> = { questionId: string; answer: Answer };

export type HiddenView = { kind: GameKind; state: "hidden" };

export type SettleResult<Truth> = { ok: true; truth: Truth } | { ok: false; issues: string[] };

export interface GameModule<Config, Truth, Answer, View = unknown, Question = unknown, Results = unknown> {
  kind: GameKind;
  configSchema: ZodType<Config>;
  truthSchema: ZodType<Truth>;
  // Payload for ONE question; one row per (game, player, question).
  answerSchema: ZodType<Answer>;
  // False where scoreOnSubmit never reads truth, so the caller can skip loading game_secrets.
  needsTruthOnSubmit: boolean;

  // Problems with a host-entered truth for this config; empty when it is usable.
  checkTruth(config: Config, truth: Truth): string[];
  // The truth to score with at settle time. `derived` carries answers the host may
  // never enter (prediction questions flagged `truthFromReveal`, security R1).
  settle?(config: Config, truth: Truth, derived: Record<string, string>): SettleResult<Truth>;

  questionIds(config: Config): string[];
  // What a guest may see. Built from config only, so it cannot contain truth.
  publicView(config: Config, state: GameState, opts: ViewOptions): View | HiddenView;
  // Public shape of one question, or null when it does not exist or is still locked.
  // The caller checks the game's state first.
  question(config: Config, questionId: string, opts: QuestionOptions): Question | null;
  // `doneIds` = answered questions plus, for timed quizzes, served ones whose time ran out.
  nextQuestionId(config: Config, doneIds: readonly string[]): string | null;

  validateAnswer(config: Config, questionId: string, answer: Answer, opts: { now: number }): boolean;
  scoreOnSubmit(config: Config, truth: Truth | null, questionId: string, answer: Answer, timing: Timing): number;
  scoreOnSettle?(config: Config, truth: Truth, questionId: string, answer: Answer): number;

  tally(config: Config, state: GameState, answers: readonly StoredAnswer<Answer>[], opts: { viewerHasAnswered: boolean }): Tally;
  // The reveal of correct answers. Only call once the game is closed or settled.
  results?(config: Config, truth: Truth): Results;
}

export const isFinished = (state: GameState): boolean => state === "closed" || state === "settled";
