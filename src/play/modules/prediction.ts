// Prediction: guests guess before the day; the host enters what really happened
// and points are awarded at settle. A choice question flagged `truthFromReveal`
// takes its truth from the gender reveal at release time — a host can never
// enter it, so the answer is not stored early as game truth (security R1).
import { z } from "zod";
import { checkIds, common, gameId, optionSchema, points, text, type GameOption } from "../schema";
import { countOptions, groupByQuestion, numberStats, withheld } from "../tally";
import { isFinished, type GameModule, type GameState, type Localized, type QuestionTally } from "../types";

const base = { id: gameId, prompt: text(160) };

const choiceQuestion = z.strictObject({
  ...base,
  type: z.literal("choice"),
  options: z.array(optionSchema).min(2).max(8),
  truthFromReveal: z.boolean().default(false),
});

const numberQuestion = z.strictObject({
  ...base,
  type: z.literal("number"),
  min: z.number(),
  max: z.number(),
  unit: text(20),
  // A guess within this distance of the truth earns `pointsClose`. 0: exact only.
  tolerance: z.number().min(0).default(0),
});

// `clock` answers are "HH:MM" with the tolerance in minutes; `date` answers are
// "YYYY-MM-DD" with the tolerance in days.
const timeQuestion = z.strictObject({
  ...base,
  type: z.literal("time"),
  format: z.enum(["clock", "date"]).default("clock"),
  tolerance: z.number().int().min(0).max(720).default(0),
});

const questionSchema = z.discriminatedUnion("type", [choiceQuestion, numberQuestion, timeQuestion]);

export const predictionConfigSchema = z
  .strictObject({
    ...common,
    questions: z.array(questionSchema).min(1).max(20),
    pointsParticipation: points(2),
    pointsExact: points(15),
    pointsClose: points(8),
  })
  .superRefine((config, ctx) => {
    checkIds(config.questions, ctx);
    config.questions.forEach((question, index) => {
      if (question.type === "number" && question.min >= question.max) {
        ctx.addIssue({ code: "custom", message: "min must be below max", path: ["questions", index, "min"] });
      }
    });
  });

const value = z.union([z.string().max(40), z.number()]);
export const predictionTruthSchema = z.strictObject({ answers: z.record(gameId, value).default({}) });
export const predictionAnswerSchema = z.strictObject({ value });

export type PredictionConfig = z.infer<typeof predictionConfigSchema>;
export type PredictionTruth = z.infer<typeof predictionTruthSchema>;
export type PredictionAnswer = z.infer<typeof predictionAnswerSchema>;
export type PredictionQuestion = PredictionConfig["questions"][number];
type Value = string | number;

export type PredictionQuestionView =
  | { id: string; prompt: Localized; type: "choice"; options: GameOption[]; truthFromReveal: boolean }
  | { id: string; prompt: Localized; type: "number"; min: number; max: number; unit: Localized; tolerance: number }
  | { id: string; prompt: Localized; type: "time"; format: "clock" | "date"; tolerance: number };
export type PredictionView = {
  kind: "prediction";
  state: Exclude<GameState, "hidden">;
  title: Localized;
  intro: Localized | null;
  pointsParticipation: number;
  pointsExact: number;
  pointsClose: number;
  questions: PredictionQuestionView[];
};
export type PredictionResults = { answers: { questionId: string; value: Value }[] };

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MINUTES = 1440;

function clockMinutes(input: string): number | null {
  const match = CLOCK.exec(input);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Days since the epoch, or null for a date that does not exist (2027-02-30).
function dateDays(input: string): number | null {
  const match = DATE.exec(input);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? date.getTime() / 86_400_000 : null;
}

function isValidValue(question: PredictionQuestion, input: Value): boolean {
  if (question.type === "number") {
    return typeof input === "number" && Number.isFinite(input) && input >= question.min && input <= question.max;
  }
  if (typeof input !== "string") return false;
  if (question.type === "choice") return question.options.some((o) => o.id === input);
  return (question.format === "clock" ? clockMinutes(input) : dateDays(input)) !== null;
}

// How far a guess is from the truth, in the question's own unit; null when they cannot be compared.
function distance(question: PredictionQuestion, guess: Value, actual: Value): number | null {
  if (!isValidValue(question, guess) || !isValidValue(question, actual)) return null;
  if (question.type === "choice") return guess === actual ? 0 : Infinity;
  if (question.type === "number") return Math.abs((guess as number) - (actual as number));
  if (question.format === "date") return Math.abs(dateDays(guess as string)! - dateDays(actual as string)!);
  // Clock times wrap at midnight: 23:50 and 00:05 are 15 minutes apart.
  const apart = Math.abs(clockMinutes(guess as string)! - clockMinutes(actual as string)!);
  return Math.min(apart, DAY_MINUTES - apart);
}

const find = (config: PredictionConfig, questionId: string) => config.questions.find((q) => q.id === questionId);
const fromReveal = (question: PredictionQuestion) => question.type === "choice" && question.truthFromReveal;

function questionView(question: PredictionQuestion): PredictionQuestionView {
  return question.type === "choice" ? { ...question, options: [...question.options] } : { ...question };
}

export const prediction: GameModule<
  PredictionConfig,
  PredictionTruth,
  PredictionAnswer,
  PredictionView,
  PredictionQuestionView,
  PredictionResults
> = {
  kind: "prediction",
  configSchema: predictionConfigSchema,
  truthSchema: predictionTruthSchema,
  answerSchema: predictionAnswerSchema,
  needsTruthOnSubmit: false,

  // For what the HOST enters: every question except the reveal-derived ones, which must be absent.
  checkTruth(config, truth) {
    const issues: string[] = [];
    for (const questionId of Object.keys(truth.answers)) {
      if (!find(config, questionId)) issues.push(`answer for unknown question "${questionId}"`);
    }
    for (const question of config.questions) {
      const entered = truth.answers[question.id];
      if (fromReveal(question)) {
        if (entered !== undefined) issues.push(`question "${question.id}" is settled by the reveal and cannot be entered`);
      } else if (entered === undefined) issues.push(`question "${question.id}" has no answer`);
      else if (!isValidValue(question, entered)) issues.push(`question "${question.id}": invalid answer`);
    }
    return issues;
  },

  settle(config, truth, derived) {
    const issues = prediction.checkTruth(config, truth);
    const answers: Record<string, Value> = { ...truth.answers };
    for (const [questionId, optionId] of Object.entries(derived)) {
      const question = find(config, questionId);
      if (!question || !fromReveal(question)) issues.push(`question "${questionId}" does not take its answer from the reveal`);
      else if (!isValidValue(question, optionId)) issues.push(`question "${questionId}": the reveal answer is not one of its options`);
      else answers[questionId] = optionId;
    }
    for (const question of config.questions) {
      if (fromReveal(question) && !(question.id in derived)) issues.push(`question "${question.id}" is waiting for the reveal`);
    }
    return issues.length > 0 ? { ok: false, issues } : { ok: true, truth: { answers } };
  },

  questionIds: (config) => config.questions.map((q) => q.id),

  publicView(config, state) {
    if (state === "hidden") return { kind: "prediction", state };
    return {
      kind: "prediction",
      state,
      title: config.title,
      intro: config.intro ?? null,
      pointsParticipation: config.pointsParticipation,
      pointsExact: config.pointsExact,
      pointsClose: config.pointsClose,
      questions: config.questions.map(questionView),
    };
  },

  question(config, questionId) {
    const question = find(config, questionId);
    return question ? questionView(question) : null;
  },

  nextQuestionId(config, doneIds) {
    const done = new Set(doneIds);
    return config.questions.find((q) => !done.has(q.id))?.id ?? null;
  },

  validateAnswer(config, questionId, answer) {
    const question = find(config, questionId);
    return question !== undefined && isValidValue(question, answer.value);
  },

  scoreOnSubmit: (config) => config.pointsParticipation,

  scoreOnSettle(config, truth, questionId, answer) {
    const question = find(config, questionId);
    const actual = truth.answers[questionId];
    if (!question || actual === undefined) return 0;
    const apart = distance(question, answer.value, actual);
    if (apart === null) return 0;
    if (apart < 1e-9) return config.pointsExact;
    return question.type !== "choice" && apart <= question.tolerance + 1e-9 ? config.pointsClose : 0;
  },

  // While open only the number of guesses shows, so early guesses do not steer later ones.
  tally(config, state, answers) {
    const groups = groupByQuestion(answers);
    return {
      questions: config.questions.map((question): QuestionTally => {
        const values = (groups.get(question.id) ?? []).map((a) => a.value).filter((v) => isValidValue(question, v));
        if (!isFinished(state)) return withheld(question.id, state === "open" ? values.length : 0, "state");
        const shared = { id: question.id, total: values.length, suppressed: null };
        if (question.type === "choice") return { ...shared, options: countOptions(question.options, values as string[]), numbers: null };
        if (question.type === "number") return { ...shared, options: null, numbers: numberStats(values as number[]) };
        return { ...shared, options: null, numbers: null };
      }),
    };
  },

  results: (config, truth) => ({
    answers: config.questions
      .filter((q) => truth.answers[q.id] !== undefined)
      .map((q) => ({ questionId: q.id, value: truth.answers[q.id] })),
  }),
};
