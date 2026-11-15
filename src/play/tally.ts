import type { NumberStats, OptionCount, QuestionTally, StoredAnswer, Suppressed } from "./types";

export function groupByQuestion<Answer>(answers: readonly StoredAnswer<Answer>[]): Map<string, Answer[]> {
  const groups = new Map<string, Answer[]>();
  for (const { questionId, answer } of answers) {
    const group = groups.get(questionId);
    if (group) group.push(answer);
    else groups.set(questionId, [answer]);
  }
  return groups;
}

// Counts per option in the config's order; picks of unknown options are dropped.
export function countOptions(options: readonly { id: string }[], picks: readonly string[]): OptionCount[] {
  const counts = new Map(options.map((o) => [o.id, 0]));
  for (const pick of picks) {
    const current = counts.get(pick);
    if (current !== undefined) counts.set(pick, current + 1);
  }
  return options.map((o) => ({ id: o.id, count: counts.get(o.id) ?? 0 }));
}

export function numberStats(values: readonly number[]): NumberStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { min: sorted[0], max: sorted[sorted.length - 1], median };
}

export const withheld = (id: string, total: number, suppressed: Suppressed): QuestionTally => ({
  id,
  total,
  options: null,
  numbers: null,
  suppressed,
});
