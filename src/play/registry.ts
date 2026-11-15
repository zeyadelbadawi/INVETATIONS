// One place to reach the modules. `getModule` keeps full types for code that
// knows the kind; `openGame` binds a module to a stored config and takes raw
// JSON (truth, answers) so API routes need no generics.
import type { z } from "zod";
import { clues } from "./modules/clues";
import { prediction } from "./modules/prediction";
import { quiz } from "./modules/quiz";
import { vote } from "./modules/vote";
import { GAME_KINDS, type GameKind, type GameModule, type GameState, type SettleResult, type Tally, type Timing, type ViewOptions, type QuestionOptions } from "./types";

export const modules = { quiz, vote, prediction, clues } as const;

export type ModuleOf<K extends GameKind> = (typeof modules)[K];
export type ConfigOf<K extends GameKind> = z.output<ModuleOf<K>["configSchema"]>;
export type TruthOf<K extends GameKind> = z.output<ModuleOf<K>["truthSchema"]>;
export type AnswerOf<K extends GameKind> = z.output<ModuleOf<K>["answerSchema"]>;
export type Game = { [K in GameKind]: { kind: K; config: ConfigOf<K> } }[GameKind];

// Matches the size check on `games.config` in the database.
export const MAX_CONFIG_BYTES = 60_000;

export const isGameKind = (kind: unknown): kind is GameKind => GAME_KINDS.includes(kind as GameKind);

export function getModule<K extends GameKind>(kind: K): ModuleOf<K> {
  return modules[kind];
}

const describe = (error: z.ZodError): string[] =>
  error.issues.map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message));

export type ParsedGame = { ok: true; game: Game } | { ok: false; issues: string[] };

// Validates a config for storage. Unknown keys — including anything that looks like an answer key — are rejected.
export function parseGame(kind: unknown, config: unknown): ParsedGame {
  if (!isGameKind(kind)) return { ok: false, issues: ["unknown game kind"] };
  const parsed = modules[kind].configSchema.safeParse(config);
  if (!parsed.success) return { ok: false, issues: describe(parsed.error) };
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).length > MAX_CONFIG_BYTES) {
    return { ok: false, issues: ["the game is too large"] };
  }
  return { ok: true, game: { kind, config: parsed.data } as Game };
}

export interface BoundGame {
  kind: GameKind;
  config: Game["config"];
  needsTruthOnSubmit: boolean;
  questionIds: string[];
  // Parses and checks a host-entered truth; returns the clean value to store in game_secrets.
  parseTruth(rawTruth: unknown): SettleResult<unknown>;
  // The truth to score with at settle; `derived` = reveal-derived answers by question id.
  settle(rawTruth: unknown, derived?: Record<string, string>): SettleResult<unknown>;
  publicView(state: GameState, opts: ViewOptions): unknown;
  question(questionId: string, opts: QuestionOptions): unknown;
  nextQuestionId(doneIds: readonly string[]): string | null;
  // The clean payload to store, or null when the answer is not acceptable.
  acceptAnswer(questionId: string, rawAnswer: unknown, opts: { now: number }): unknown | null;
  scoreOnSubmit(rawTruth: unknown | null, questionId: string, rawAnswer: unknown, timing: Timing): number;
  scoreOnSettle(settledTruth: unknown, questionId: string, rawAnswer: unknown): number;
  tally(state: GameState, answers: readonly { questionId: string; answer: unknown }[], opts: { viewerHasAnswered: boolean }): Tally;
  // Correct answers for display; null for kinds without any. Only after close/settle.
  results(rawTruth: unknown): unknown;
}

function bind<C extends Game["config"], T, A>(module: GameModule<C, T, A>, config: C): BoundGame {
  const truthOf = (raw: unknown): T => module.truthSchema.parse(raw);
  const answerOf = (raw: unknown): A | null => {
    const parsed = module.answerSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  };
  const checked = (rawTruth: unknown): SettleResult<T> => {
    const parsed = module.truthSchema.safeParse(rawTruth);
    if (!parsed.success) return { ok: false, issues: describe(parsed.error) };
    const issues = module.checkTruth(config, parsed.data);
    return issues.length > 0 ? { ok: false, issues } : { ok: true, truth: parsed.data };
  };

  return {
    kind: module.kind,
    config,
    needsTruthOnSubmit: module.needsTruthOnSubmit,
    questionIds: module.questionIds(config),
    parseTruth: checked,
    settle(rawTruth, derived = {}) {
      if (!module.settle) {
        return Object.keys(derived).length > 0 ? { ok: false, issues: ["this game takes no reveal answers"] } : checked(rawTruth);
      }
      const parsed = module.truthSchema.safeParse(rawTruth);
      return parsed.success ? module.settle(config, parsed.data, derived) : { ok: false, issues: describe(parsed.error) };
    },
    publicView: (state, opts) => module.publicView(config, state, opts),
    question: (questionId, opts) => module.question(config, questionId, opts),
    nextQuestionId: (doneIds) => module.nextQuestionId(config, doneIds),
    acceptAnswer(questionId, rawAnswer, opts) {
      const answer = answerOf(rawAnswer);
      return answer !== null && module.validateAnswer(config, questionId, answer, opts) ? answer : null;
    },
    scoreOnSubmit(rawTruth, questionId, rawAnswer, timing) {
      const answer = answerOf(rawAnswer);
      if (answer === null || !module.validateAnswer(config, questionId, answer, { now: timing.answeredAt })) return 0;
      return module.scoreOnSubmit(config, rawTruth === null ? null : truthOf(rawTruth), questionId, answer, timing);
    },
    scoreOnSettle(settledTruth, questionId, rawAnswer) {
      const answer = answerOf(rawAnswer);
      if (answer === null || !module.scoreOnSettle) return 0;
      return module.scoreOnSettle(config, truthOf(settledTruth), questionId, answer);
    },
    tally(state, answers, opts) {
      const clean = answers.flatMap(({ questionId, answer }) => {
        const parsed = answerOf(answer);
        return parsed === null ? [] : [{ questionId, answer: parsed }];
      });
      return module.tally(config, state, clean, opts);
    },
    results: (rawTruth) => (module.results ? module.results(config, truthOf(rawTruth)) : null),
  };
}

// Parses a stored `{ kind, config }` and returns it ready to use, or null when it is not valid.
export function openGame(kind: unknown, config: unknown): BoundGame | null {
  const parsed = parseGame(kind, config);
  if (!parsed.ok) return null;
  const { game } = parsed;
  switch (game.kind) {
    case "quiz":
      return bind(quiz, game.config);
    case "vote":
      return bind(vote, game.config);
    case "prediction":
      return bind(prediction, game.config);
    case "clues":
      return bind(clues, game.config);
  }
}
