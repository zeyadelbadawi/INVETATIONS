import { describe, expect, it } from "vitest";
import { NOW, cluesConfig } from "../fixtures";
import { clues, cluesConfigSchema, type CluesView } from "./clues";

const seen = { seen: true } as const;
const DAY = 86_400_000;

describe("clues config", () => {
  it("applies defaults", () => {
    expect(cluesConfig.pointsParticipation).toBe(1);
    expect(cluesConfig.clues[0].revealAt).toBeNull();
  });

  it("rejects unknown keys, answers, bad dates and duplicate ids", () => {
    const clue = { id: "c1", text: { en: "A sign" } };
    const bad = [
      { title: { en: "C" }, clues: [{ ...clue, answer: "boy" }] },
      { title: { en: "C" }, clues: [clue], truth: {} },
      { title: { en: "C" }, clues: [{ ...clue, revealAt: "tomorrow" }] },
      { title: { en: "C" }, clues: [{ ...clue, revealAt: "2026-11-16T12:00:00" }] },
      { title: { en: "C" }, clues: [clue, clue] },
      { title: { en: "C" }, clues: [] },
      { title: { en: "C" }, clues: [{ ...clue, text: { ar: "", en: "" } }] },
    ];
    for (const input of bad) expect(cluesConfigSchema.safeParse(input).success).toBe(false);
  });

  it("has no truth and a fixed answer payload", () => {
    expect(clues.checkTruth(cluesConfig, {})).toEqual([]);
    expect(clues.truthSchema.safeParse({ answers: {} }).success).toBe(false);
    expect(clues.answerSchema.safeParse({ seen: false }).success).toBe(false);
    expect(clues.answerSchema.safeParse(seen).success).toBe(true);
  });
});

describe("clues schedule", () => {
  it("shows revealed cards and only the time of locked ones", () => {
    const view = clues.publicView(cluesConfig, "open", { now: NOW }) as CluesView;
    expect(view.clues.map((c) => c.locked)).toEqual([false, false, true]);
    expect(view.clues[2]).toEqual({ id: "c3", locked: true, revealAt: "2026-11-16T12:00:00+02:00" });
    expect(JSON.stringify(view)).not.toContain("LOCKED");
  });

  it("unlocks exactly at revealAt", () => {
    const unlock = Date.parse("2026-11-16T12:00:00+02:00");
    expect(clues.question(cluesConfig, "c3", { now: unlock - 1, seed: "s" })).toBeNull();
    expect(clues.question(cluesConfig, "c3", { now: unlock, seed: "s" })).toMatchObject({ id: "c3", locked: false });
    expect(clues.question(cluesConfig, "nope", { now: NOW + 9 * DAY, seed: "s" })).toBeNull();
  });

  it("shows nothing when hidden", () => {
    expect(clues.publicView(cluesConfig, "hidden", { now: NOW + 9 * DAY })).toEqual({ kind: "clues", state: "hidden" });
  });
});

describe("clues answers, scoring and tally", () => {
  it("only counts a view of a revealed card", () => {
    expect(clues.validateAnswer(cluesConfig, "c1", seen, { now: NOW })).toBe(true);
    expect(clues.validateAnswer(cluesConfig, "c3", seen, { now: NOW })).toBe(false);
    expect(clues.validateAnswer(cluesConfig, "c3", seen, { now: NOW + 2 * DAY })).toBe(true);
    expect(clues.validateAnswer(cluesConfig, "nope", seen, { now: NOW })).toBe(false);
  });

  it("awards participation per card and has no settle step", () => {
    expect(clues.scoreOnSubmit(cluesConfig, null, "c1", seen, { servedAt: null, answeredAt: NOW })).toBe(1);
    expect(clues.scoreOnSettle).toBeUndefined();
    expect(clues.results).toBeUndefined();
  });

  it("tallies views per card", () => {
    const answers = [
      { questionId: "c1", answer: seen },
      { questionId: "c1", answer: seen },
      { questionId: "c2", answer: seen },
    ];
    expect(clues.tally(cluesConfig, "open", answers, { viewerHasAnswered: true }).questions.map((q) => q.total)).toEqual([2, 1, 0]);
    expect(clues.tally(cluesConfig, "hidden", answers, { viewerHasAnswered: true }).questions[0]).toMatchObject({ total: 0, suppressed: "state" });
  });
});
