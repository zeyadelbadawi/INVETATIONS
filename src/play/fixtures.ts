// Sample games for tests. Truth values use SECRET-marked option ids and labels
// nobody else uses, so a leak is easy to spot in serialised output.
import { cluesConfigSchema } from "./modules/clues";
import { predictionConfigSchema } from "./modules/prediction";
import { quizConfigSchema } from "./modules/quiz";
import { voteConfigSchema } from "./modules/vote";

const l = (en: string) => ({ ar: `${en} بالعربي`, en });
const options = (...ids: string[]) => ids.map((id) => ({ id, label: l(`label ${id}`) }));

export const NOW = Date.parse("2026-11-15T12:00:00Z");

export const quizInput = {
  title: l("Quiz"),
  questions: [
    { id: "q1", prompt: l("First?"), options: options("a", "b", "c", "d") },
    { id: "q2", prompt: l("Second?"), options: options("a", "b", "c") },
    { id: "q3", prompt: l("Third?"), image: "3f0e8a52-6f0b-4c62-9d0e-2a4f1f6f7b11", options: options("yes", "no") },
  ],
};
export const quizConfig = quizConfigSchema.parse(quizInput);
export const untimedQuiz = quizConfigSchema.parse({ ...quizInput, timed: false });
export const quizTruth = { answers: { q1: "b", q2: "c", q3: "yes" } };

export const pollConfig = voteConfigSchema.parse({
  title: l("Poll"),
  mode: "poll",
  questions: [
    { id: "cake", prompt: l("Cake?"), options: options("choc", "vanilla", "berry") },
    { id: "music", prompt: l("Music?"), options: options("live", "dj") },
  ],
});

export const thisOrThatConfig = voteConfigSchema.parse({
  title: l("Which one?"),
  mode: "this_or_that",
  minTallyVotes: 1,
  questions: [
    { id: "late", prompt: l("Late?"), options: options("one", "two") },
    { id: "cook", prompt: l("Cook?"), options: options("one", "two") },
  ],
});
export const thisOrThatTruth = { answers: { late: "one", cook: "two" } };

export const predictionConfig = predictionConfigSchema.parse({
  title: l("Predictions"),
  questions: [
    { id: "tears", prompt: l("Tears?"), type: "choice", options: options("groom", "bride", "mum") },
    { id: "delay", prompt: l("Delay?"), type: "number", min: 0, max: 180, unit: l("min"), tolerance: 10 },
    { id: "ends", prompt: l("Ends?"), type: "time", tolerance: 30 },
    { id: "born", prompt: l("Born?"), type: "time", format: "date", tolerance: 3 },
    { id: "team", prompt: l("Team?"), type: "choice", truthFromReveal: true, options: options("boy", "girl") },
  ],
});
export const predictionTruth = { answers: { tears: "mum", delay: 25, ends: "23:50", born: "2027-03-10" } };

export const cluesConfig = cluesConfigSchema.parse({
  title: l("Clues"),
  clues: [
    { id: "c1", text: l("Always visible"), hint: l("a hint") },
    { id: "c2", text: l("Visible since yesterday"), revealAt: "2026-11-14T12:00:00Z" },
    { id: "c3", text: l("LOCKED-TEXT tomorrow"), hint: l("LOCKED-HINT"), revealAt: "2026-11-16T12:00:00+02:00" },
  ],
});
