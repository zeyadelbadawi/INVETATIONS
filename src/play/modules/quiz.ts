// Quiz: one correct option per question, scored on submit. The answer key lives
// in truth only; while the quiz is open nothing per-option is aggregated, and a
// timed quiz hands out one question at a time (security rules 22–23).
import { z } from "zod";
import {
  checkChoiceTruth,
  checkIds,
  choiceAnswerSchema,
  choiceTruthSchema,
  common,
  gameId,
  optionSchema,
  points,
  text,
  type ChoiceAnswer,
  type ChoiceTruth,
  type GameOption,
} from "../schema";
import { deterministicShuffle } from "../scoring";
import { countOptions, groupByQuestion, withheld } from "../tally";
import { isFinished, type GameModule, type GameState, type Localized } from "../types";

const questionSchema = z.strictObject({
  id: gameId,
  prompt: text(160),
  image: z.uuid().nullable().default(null),
  options: z.array(optionSchema).min(2).max(6),
});

export const quizConfigSchema = z
  .strictObject({
    ...common,
    questions: z.array(questionSchema).min(1).max(25),
    timed: z.boolean().default(true),
    secondsPerQuestion: z.number().int().min(5).max(60).default(20),
    pointsCorrect: points(10),
    speedBonus: z.number().int().min(0).max(5).default(3),
  })
  .superRefine((config, ctx) => checkIds(config.questions, ctx));

export type QuizConfig = z.infer<typeof quizConfigSchema>;
export type QuizTruth = ChoiceTruth;
export type QuizAnswer = ChoiceAnswer;

export type QuizQuestionView = { id: string; prompt: Localized; image: string | null; options: GameOption[] };
export type QuizView = {
  kind: "quiz";
  state: Exclude<GameState, "hidden">;
  title: Localized;
  intro: Localized | null;
  timed: boolean;
  secondsPerQuestion: number;
  pointsCorrect: number;
  speedBonus: number;
  questionIds: string[];
  // Null while a timed quiz is open: questions are then served one by one.
  questions: QuizQuestionView[] | null;
};
export type QuizResults = { answers: { questionId: string; optionId: string }[] };

// A timed answer may arrive this late (network, slow phones) and still count, without bonus.
export const LATE_GRACE_MS = 2000;

const limitMs = (config: QuizConfig) => config.secondsPerQuestion * 1000;

// True once a served question can no longer score; the caller then treats it as done.
export function isExpired(config: QuizConfig, servedAt: number, now: number): boolean {
  return config.timed && now - servedAt > limitMs(config) + LATE_GRACE_MS;
}

function questionView(question: QuizConfig["questions"][number], seed?: string): QuizQuestionView {
  const options = seed === undefined ? question.options : deterministicShuffle(question.options, `${seed}:${question.id}`);
  return { id: question.id, prompt: question.prompt, image: question.image, options: [...options] };
}

export const quiz: GameModule<QuizConfig, QuizTruth, QuizAnswer, QuizView, QuizQuestionView, QuizResults> = {
  kind: "quiz",
  configSchema: quizConfigSchema,
  truthSchema: choiceTruthSchema,
  answerSchema: choiceAnswerSchema,
  needsTruthOnSubmit: true,

  checkTruth: (config, truth) => checkChoiceTruth(config.questions, truth.answers, { requireAll: true }),

  questionIds: (config) => config.questions.map((q) => q.id),

  publicView(config, state, opts) {
    if (state === "hidden") return { kind: "quiz", state };
    const oneAtATime = state === "open" && config.timed;
    // Options are shuffled per player only while playing; afterwards everyone sees the host's order.
    const seed = state === "open" ? opts.seed : undefined;
    return {
      kind: "quiz",
      state,
      title: config.title,
      intro: config.intro ?? null,
      timed: config.timed,
      secondsPerQuestion: config.secondsPerQuestion,
      pointsCorrect: config.pointsCorrect,
      speedBonus: config.speedBonus,
      questionIds: config.questions.map((q) => q.id),
      questions: oneAtATime ? null : config.questions.map((q) => questionView(q, seed)),
    };
  },

  question(config, questionId, opts) {
    const question = config.questions.find((q) => q.id === questionId);
    return question ? questionView(question, opts.seed) : null;
  },

  nextQuestionId(config, doneIds) {
    const done = new Set(doneIds);
    return config.questions.find((q) => !done.has(q.id))?.id ?? null;
  },

  validateAnswer(config, questionId, answer) {
    const question = config.questions.find((q) => q.id === questionId);
    return question !== undefined && question.options.some((o) => o.id === answer.optionId);
  },

  scoreOnSubmit(config, truth, questionId, answer, timing) {
    if (!truth || truth.answers[questionId] !== answer.optionId) return 0;
    if (!config.timed) return config.pointsCorrect;
    // A timed answer without a server-stamped serve cannot be trusted.
    if (timing.servedAt === null) return 0;
    const elapsed = Math.max(0, timing.answeredAt - timing.servedAt);
    const limit = limitMs(config);
    if (elapsed > limit + LATE_GRACE_MS) return 0;
    const remaining = Math.max(0, limit - elapsed) / limit;
    return config.pointsCorrect + Math.round(config.speedBonus * remaining);
  },

  tally(config, state, answers) {
    const groups = groupByQuestion(answers);
    return {
      questions: config.questions.map((question) => {
        const picks = (groups.get(question.id) ?? []).map((a) => a.optionId);
        if (!isFinished(state)) return withheld(question.id, state === "open" ? picks.length : 0, "state");
        return { id: question.id, total: picks.length, options: countOptions(question.options, picks), numbers: null, suppressed: null };
      }),
    };
  },

  results: (config, truth) => ({
    answers: config.questions
      .filter((q) => q.id in truth.answers)
      .map((q) => ({ questionId: q.id, optionId: truth.answers[q.id] })),
  }),
};
