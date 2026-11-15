// Vote: polls, this-or-that (مين فيهم؟) and award voting. Participation scores on
// submit. A this-or-that may carry the couple's real answers as truth: revealed
// only after close, with match points awarded at settle.
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
import { countOptions, groupByQuestion, withheld } from "../tally";
import { isFinished, type GameModule, type GameState, type Localized, type Suppressed } from "../types";

const questionSchema = z.strictObject({
  id: gameId,
  prompt: text(160),
  options: z.array(optionSchema).min(2).max(8),
});

export const voteConfigSchema = z
  .strictObject({
    ...common,
    questions: z.array(questionSchema).min(1).max(20),
    mode: z.enum(["poll", "this_or_that", "award"]).default("poll"),
    showTally: z.enum(["always", "after_vote", "after_close"]).default("after_vote"),
    pointsParticipation: points(2),
    pointsMatch: points(5),
    // Breakdowns with fewer votes than this stay hidden, so a small vote is not traceable to people.
    minTallyVotes: z.number().int().min(1).max(50).default(5),
  })
  .superRefine((config, ctx) => {
    checkIds(config.questions, ctx);
    if (config.mode !== "this_or_that") return;
    config.questions.forEach((question, index) => {
      if (question.options.length !== 2) {
        ctx.addIssue({ code: "custom", message: "this_or_that needs exactly 2 options", path: ["questions", index, "options"] });
      }
    });
  });

export type VoteConfig = z.infer<typeof voteConfigSchema>;
export type VoteTruth = ChoiceTruth;
export type VoteAnswer = ChoiceAnswer;

export type VoteQuestionView = { id: string; prompt: Localized; options: GameOption[] };
export type VoteView = {
  kind: "vote";
  state: Exclude<GameState, "hidden">;
  title: Localized;
  intro: Localized | null;
  mode: VoteConfig["mode"];
  showTally: VoteConfig["showTally"];
  minTallyVotes: number;
  pointsParticipation: number;
  pointsMatch: number;
  questions: VoteQuestionView[];
};
export type VoteResults = { answers: { questionId: string; optionId: string }[] };

function gate(config: VoteConfig, state: GameState, viewerHasAnswered: boolean): Suppressed | null {
  if (isFinished(state)) return null;
  if (state !== "open" || config.showTally === "after_close") return "state";
  if (config.showTally === "after_vote" && !viewerHasAnswered) return "vote_first";
  return null;
}

export const vote: GameModule<VoteConfig, VoteTruth, VoteAnswer, VoteView, VoteQuestionView, VoteResults> = {
  kind: "vote",
  configSchema: voteConfigSchema,
  truthSchema: choiceTruthSchema,
  answerSchema: choiceAnswerSchema,
  needsTruthOnSubmit: false,

  checkTruth(config, truth) {
    if (config.mode !== "this_or_that") {
      return Object.keys(truth.answers).length > 0 ? ["only a this_or_that vote can have real answers"] : [];
    }
    // The couple may skip a question; a skipped one simply awards no match points.
    return checkChoiceTruth(config.questions, truth.answers, { requireAll: false });
  },

  questionIds: (config) => config.questions.map((q) => q.id),

  publicView(config, state) {
    if (state === "hidden") return { kind: "vote", state };
    return {
      kind: "vote",
      state,
      title: config.title,
      intro: config.intro ?? null,
      mode: config.mode,
      showTally: config.showTally,
      minTallyVotes: config.minTallyVotes,
      pointsParticipation: config.pointsParticipation,
      pointsMatch: config.pointsMatch,
      questions: config.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: [...q.options] })),
    };
  },

  question(config, questionId) {
    const question = config.questions.find((q) => q.id === questionId);
    return question ? { id: question.id, prompt: question.prompt, options: [...question.options] } : null;
  },

  nextQuestionId(config, doneIds) {
    const done = new Set(doneIds);
    return config.questions.find((q) => !done.has(q.id))?.id ?? null;
  },

  validateAnswer(config, questionId, answer) {
    const question = config.questions.find((q) => q.id === questionId);
    return question !== undefined && question.options.some((o) => o.id === answer.optionId);
  },

  scoreOnSubmit: (config) => config.pointsParticipation,

  scoreOnSettle(config, truth, questionId, answer) {
    if (config.mode !== "this_or_that") return 0;
    return truth.answers[questionId] === answer.optionId ? config.pointsMatch : 0;
  },

  tally(config, state, answers, opts) {
    const groups = groupByQuestion(answers);
    const blocked = gate(config, state, opts.viewerHasAnswered);
    return {
      questions: config.questions.map((question) => {
        const options = countOptions(question.options, (groups.get(question.id) ?? []).map((a) => a.optionId));
        const total = options.reduce((sum, o) => sum + o.count, 0);
        if (state === "hidden") return withheld(question.id, 0, "state");
        if (blocked) return withheld(question.id, total, blocked);
        if (total < config.minTallyVotes) return withheld(question.id, total, "too_few");
        return { id: question.id, total, options, numbers: null, suppressed: null };
      }),
    };
  },

  results: (config, truth) => ({
    answers: config.questions
      .filter((q) => config.mode === "this_or_that" && q.id in truth.answers)
      .map((q) => ({ questionId: q.id, optionId: truth.answers[q.id] })),
  }),
};
