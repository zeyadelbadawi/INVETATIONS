// Clues: cards revealed on a schedule — old wives' tales in the gender reveal,
// staged teasers for corporate events. No answers and no truth; viewing a card
// may earn participation points. A locked card's text never leaves the server.
import { z } from "zod";
import { checkIds, common, gameId, points, text } from "../schema";
import { withheld } from "../tally";
import type { GameModule, GameState, Localized } from "../types";

const clueSchema = z.strictObject({
  id: gameId,
  text: text(300),
  hint: text(200).optional(),
  // Null: visible as soon as the game opens.
  revealAt: z.iso.datetime({ offset: true }).nullable().default(null),
});

export const cluesConfigSchema = z
  .strictObject({
    ...common,
    clues: z.array(clueSchema).min(1).max(20),
    // Per card viewed.
    pointsParticipation: points(1, 5),
  })
  .superRefine((config, ctx) => checkIds(config.clues, ctx, "clues"));

export const cluesTruthSchema = z.strictObject({});
export const cluesAnswerSchema = z.strictObject({ seen: z.literal(true) });

export type CluesConfig = z.infer<typeof cluesConfigSchema>;
export type CluesTruth = z.infer<typeof cluesTruthSchema>;
export type CluesAnswer = z.infer<typeof cluesAnswerSchema>;

export type ClueView =
  | { id: string; locked: false; text: Localized; hint: Localized | null }
  | { id: string; locked: true; revealAt: string };
export type CluesView = {
  kind: "clues";
  state: Exclude<GameState, "hidden">;
  title: Localized;
  intro: Localized | null;
  pointsParticipation: number;
  clues: ClueView[];
};

type Clue = CluesConfig["clues"][number];

const isRevealed = (clue: Clue, now: number) => clue.revealAt === null || Date.parse(clue.revealAt) <= now;

function clueView(clue: Clue, now: number): ClueView {
  if (clue.revealAt !== null && !isRevealed(clue, now)) return { id: clue.id, locked: true, revealAt: clue.revealAt };
  return { id: clue.id, locked: false, text: clue.text, hint: clue.hint ?? null };
}

export const clues: GameModule<CluesConfig, CluesTruth, CluesAnswer, CluesView, ClueView, never> = {
  kind: "clues",
  configSchema: cluesConfigSchema,
  truthSchema: cluesTruthSchema,
  answerSchema: cluesAnswerSchema,
  needsTruthOnSubmit: false,

  checkTruth: () => [],

  questionIds: (config) => config.clues.map((c) => c.id),

  publicView(config, state, opts) {
    if (state === "hidden") return { kind: "clues", state };
    return {
      kind: "clues",
      state,
      title: config.title,
      intro: config.intro ?? null,
      pointsParticipation: config.pointsParticipation,
      clues: config.clues.map((clue) => clueView(clue, opts.now)),
    };
  },

  question(config, questionId, opts) {
    const clue = config.clues.find((c) => c.id === questionId);
    return clue && isRevealed(clue, opts.now) ? clueView(clue, opts.now) : null;
  },

  // The next revealed-or-not card the player has not opened, in the host's order.
  nextQuestionId(config, doneIds) {
    const done = new Set(doneIds);
    return config.clues.find((c) => !done.has(c.id))?.id ?? null;
  },

  // "Seen" only counts for a card that is already revealed.
  validateAnswer(config, questionId, _answer, opts) {
    const clue = config.clues.find((c) => c.id === questionId);
    return clue !== undefined && isRevealed(clue, opts.now);
  },

  scoreOnSubmit: (config) => config.pointsParticipation,

  tally(config, state, answers) {
    return {
      questions: config.clues.map((clue) => {
        if (state === "hidden") return withheld(clue.id, 0, "state");
        const views = answers.filter((a) => a.questionId === clue.id).length;
        return { id: clue.id, total: views, options: null, numbers: null, suppressed: null };
      }),
    };
  },
};
