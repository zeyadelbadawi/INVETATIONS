// Turns bank items into game configs the modules accept. Question ids are the
// stable bank ids; option ids are generated (`o1`, `o2`…), except this-or-that,
// whose options are always `one` / `two` — the two partners.
import { cluesConfigSchema, type CluesConfig } from "../modules/clues";
import { predictionConfigSchema, type PredictionConfig } from "../modules/prediction";
import { quizConfigSchema, type QuizConfig } from "../modules/quiz";
import { voteConfigSchema, type VoteConfig } from "../modules/vote";
import type { Localized } from "../types";
import { slots, t, type BankGroup, type ClueTemplate, type PollTemplate, type PredictionTemplate, type PromptTemplate, type QuizTemplate } from "./types";

// Pick items by id (in that order), or take the first `limit`; default: as many as the game allows.
export type Selection = { ids?: readonly string[]; limit?: number };

export const DEFAULT_PARTNERS: [Localized, Localized] = [t("العريس", "The groom"), t("العروسة", "The bride")];

function select<Item extends { id: string }>(group: BankGroup<Item>, selection: Selection, max: number): Item[] {
  const limit = Math.min(selection.limit ?? max, max);
  if (!selection.ids) return group.items.slice(0, limit);
  const byId = new Map(group.items.map((item) => [item.id, item]));
  const picked = [...new Set(selection.ids)].flatMap((id) => byId.get(id) ?? []);
  return picked.slice(0, limit);
}

const head = (group: BankGroup<unknown>) => ({ title: group.title, ...(group.intro ? { intro: group.intro } : {}) });
const withIds = (labels: readonly Localized[]) => labels.map((label, i) => ({ id: `o${i + 1}`, label }));

export function quizFromBank(group: BankGroup<QuizTemplate>, selection: Selection = {}): QuizConfig {
  return quizConfigSchema.parse({
    ...head(group),
    questions: select(group, selection, 25).map((item) => ({ id: item.id, prompt: item.prompt, options: withIds(item.options) })),
  });
}

export function thisOrThatFromBank(
  group: BankGroup<PromptTemplate>,
  selection: Selection & { partners?: [Localized, Localized] } = {},
): VoteConfig {
  const [one, two] = selection.partners ?? DEFAULT_PARTNERS;
  return voteConfigSchema.parse({
    ...head(group),
    mode: "this_or_that",
    // A playful family vote; nothing here needs the anonymity threshold.
    minTallyVotes: 1,
    questions: select(group, selection, 20).map((item) => ({
      id: item.id,
      prompt: item.prompt,
      options: [
        { id: "one", label: one },
        { id: "two", label: two },
      ],
    })),
  });
}

export function pollFromBank(group: BankGroup<PollTemplate>, selection: Selection = {}): VoteConfig {
  return voteConfigSchema.parse({
    ...head(group),
    mode: "poll",
    questions: select(group, selection, 20).map((item) => ({ id: item.id, prompt: item.prompt, options: withIds(item.options) })),
  });
}

// Every category gets the same nominees; the host replaces the placeholders.
export function awardsFromBank(
  group: BankGroup<PromptTemplate>,
  selection: Selection & { nominees?: readonly Localized[] } = {},
): VoteConfig {
  const nominees = selection.nominees ?? slots(4, "المرشّح", "Nominee");
  return voteConfigSchema.parse({
    ...head(group),
    mode: "award",
    showTally: "after_close",
    questions: select(group, selection, 20).map((item) => ({ id: item.id, prompt: item.prompt, options: withIds(nominees) })),
  });
}

export function predictionFromBank(group: BankGroup<PredictionTemplate>, selection: Selection = {}): PredictionConfig {
  return predictionConfigSchema.parse({
    ...head(group),
    questions: select(group, selection, 20).map(({ id, prompt, answer }) =>
      answer.type === "choice" ? { id, prompt, type: "choice", options: withIds(answer.options) } : { id, prompt, ...answer },
    ),
  });
}

// `revealAt[i]` schedules the i-th card (ISO date-time with offset); missing or null shows it at once.
export function cluesFromBank(
  group: BankGroup<ClueTemplate>,
  selection: Selection & { revealAt?: readonly (string | null)[] } = {},
): CluesConfig {
  return cluesConfigSchema.parse({
    ...head(group),
    clues: select(group, selection, 20).map((item, i) => ({ id: item.id, text: item.text, revealAt: selection.revealAt?.[i] ?? null })),
  });
}
