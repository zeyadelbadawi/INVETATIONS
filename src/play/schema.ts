// Building blocks shared by every game module's schemas. All objects are strict:
// an unknown key (say, a stray `correct: true`) fails validation instead of being
// stored in the public config (security rule 22).
import "@/lib/zod-jitless";
import { z } from "zod";

// Matches the `game_answers.question_id` check in the database.
export const gameId = z.string().regex(/^[a-z0-9_-]{1,40}$/);

const line = (max: number) => z.string().trim().max(max);

// Strict twin of `localized()` in src/content/schema.ts, and at least one language must be filled.
export const text = (max: number) =>
  z
    .strictObject({ ar: line(max).default(""), en: line(max).default("") })
    .refine((value) => value.ar !== "" || value.en !== "", "text is required in at least one language");

export const optionSchema = z.strictObject({ id: gameId, label: text(60) });
export type GameOption = z.infer<typeof optionSchema>;

export const points = (fallback: number, max = 50) => z.number().int().min(0).max(max).default(fallback);

// Shared head of every game config.
export const common = { title: text(80), intro: text(300).optional() };

export const choiceAnswerSchema = z.strictObject({ optionId: gameId });
export type ChoiceAnswer = z.infer<typeof choiceAnswerSchema>;

export const choiceTruthSchema = z.strictObject({ answers: z.record(gameId, gameId).default({}) });
export type ChoiceTruth = z.infer<typeof choiceTruthSchema>;

export function duplicateIds(items: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { id } of items) (seen.has(id) ? repeated : seen).add(id);
  return [...repeated];
}

type WithOptions = { id: string; options?: readonly { id: string }[] };

// Refinement for a list of questions: ids unique across the game, option ids unique per question.
export function checkIds(questions: readonly WithOptions[], ctx: z.RefinementCtx, key = "questions"): void {
  for (const id of duplicateIds(questions)) {
    ctx.addIssue({ code: "custom", message: `duplicate id "${id}"`, path: [key] });
  }
  questions.forEach((question, index) => {
    for (const id of duplicateIds(question.options ?? [])) {
      ctx.addIssue({ code: "custom", message: `duplicate option id "${id}"`, path: [key, index, "options"] });
    }
  });
}

// Checks a `{ questionId: optionId }` answer key against questions with options.
export function checkChoiceTruth(
  questions: readonly { id: string; options: readonly { id: string }[] }[],
  answers: Record<string, string>,
  opts: { requireAll: boolean },
): string[] {
  const issues: string[] = [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const [questionId, optionId] of Object.entries(answers)) {
    const question = byId.get(questionId);
    if (!question) issues.push(`answer for unknown question "${questionId}"`);
    else if (!question.options.some((o) => o.id === optionId)) {
      issues.push(`question "${questionId}": option "${optionId}" does not exist`);
    }
  }
  if (opts.requireAll) {
    for (const { id } of questions) if (!(id in answers)) issues.push(`question "${id}" has no answer`);
  }
  return issues;
}
