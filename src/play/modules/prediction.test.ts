import { describe, expect, it } from "vitest";
import { NOW, predictionConfig, predictionTruth } from "../fixtures";
import { prediction, predictionConfigSchema } from "./prediction";

const guess = (value: string | number) => ({ value });
const valid = (questionId: string, value: string | number) => prediction.validateAnswer(predictionConfig, questionId, guess(value), { now: NOW });
const settle = (questionId: string, value: string | number) => prediction.scoreOnSettle!(predictionConfig, predictionTruth, questionId, guess(value));

const base = { title: { en: "P" } };
const number = { id: "n", prompt: { en: "?" }, type: "number", min: 0, max: 10, unit: { en: "kg" } };

describe("prediction config", () => {
  it("applies defaults", () => {
    expect(predictionConfig).toMatchObject({ pointsParticipation: 2, pointsExact: 15, pointsClose: 8 });
    expect(predictionConfig.questions[0]).toMatchObject({ type: "choice", truthFromReveal: false });
    expect(predictionConfig.questions[2]).toMatchObject({ type: "time", format: "clock" });
  });

  it("rejects unknown keys, truth-looking keys and bad ranges", () => {
    const bad = [
      { ...base, questions: [{ ...number, answer: 5 }] },
      { ...base, questions: [number], answers: { n: 5 } },
      { ...base, questions: [{ ...number, min: 10, max: 10 }] },
      { ...base, questions: [{ ...number, tolerance: -1 }] },
      { ...base, questions: [{ ...number, type: "bet" }] },
      { ...base, questions: [{ ...number, truthFromReveal: true }] },
      { ...base, questions: [number, number] },
    ];
    for (const input of bad) expect(predictionConfigSchema.safeParse(input).success).toBe(false);
    expect(predictionConfigSchema.safeParse({ ...base, questions: [number] }).success).toBe(true);
  });
});

describe("prediction answers", () => {
  it("validates by question type", () => {
    expect(valid("tears", "mum")).toBe(true);
    expect(valid("tears", "uncle")).toBe(false);
    expect(valid("tears", 1)).toBe(false);
    expect(valid("delay", 0)).toBe(true);
    expect(valid("delay", 180)).toBe(true);
    expect(valid("delay", 181)).toBe(false);
    expect(valid("delay", -1)).toBe(false);
    expect(valid("delay", "25")).toBe(false);
    expect(valid("delay", Number.NaN)).toBe(false);
    expect(valid("ends", "23:59")).toBe(true);
    expect(valid("ends", "24:00")).toBe(false);
    expect(valid("ends", "9:30")).toBe(false);
    expect(valid("born", "2027-02-28")).toBe(true);
    expect(valid("born", "2027-02-30")).toBe(false);
    expect(valid("born", "10/03/2027")).toBe(false);
    expect(valid("nope", "x")).toBe(false);
  });

  it("awards participation on submit without truth", () => {
    expect(prediction.needsTruthOnSubmit).toBe(false);
    expect(prediction.scoreOnSubmit(predictionConfig, null, "delay", guess(20), { servedAt: null, answeredAt: NOW })).toBe(2);
  });
});

describe("prediction truth", () => {
  it("accepts a complete host truth that leaves reveal-derived questions out", () => {
    expect(prediction.checkTruth(predictionConfig, predictionTruth)).toEqual([]);
  });

  it("never lets a host enter a reveal-derived answer", () => {
    const issues = prediction.checkTruth(predictionConfig, { answers: { ...predictionTruth.answers, team: "girl" } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("reveal");
  });

  it("reports missing, invalid and unknown answers", () => {
    const { tears, ...missing } = predictionTruth.answers;
    expect(tears).toBe("mum");
    expect(prediction.checkTruth(predictionConfig, { answers: missing })).toHaveLength(1);
    expect(prediction.checkTruth(predictionConfig, { answers: { ...predictionTruth.answers, delay: 999 } })).toHaveLength(1);
    expect(prediction.checkTruth(predictionConfig, { answers: { ...predictionTruth.answers, extra: 1 } })).toHaveLength(1);
  });
});

describe("prediction settle", () => {
  it("merges the injected reveal answer into the truth", () => {
    const result = prediction.settle!(predictionConfig, predictionTruth, { team: "girl" });
    expect(result).toEqual({ ok: true, truth: { answers: { ...predictionTruth.answers, team: "girl" } } });
    if (!result.ok) return;
    expect(prediction.scoreOnSettle!(predictionConfig, result.truth, "team", guess("girl"))).toBe(15);
    expect(prediction.scoreOnSettle!(predictionConfig, result.truth, "team", guess("boy"))).toBe(0);
  });

  it("waits for the reveal, and rejects injections that do not belong", () => {
    expect(prediction.settle!(predictionConfig, predictionTruth, {}).ok).toBe(false);
    expect(prediction.settle!(predictionConfig, predictionTruth, { team: "twins" }).ok).toBe(false);
    expect(prediction.settle!(predictionConfig, predictionTruth, { team: "girl", tears: "mum" }).ok).toBe(false);
    expect(prediction.settle!(predictionConfig, { answers: { ...predictionTruth.answers, team: "girl" } }, { team: "girl" }).ok).toBe(false);
  });

  it("scores nothing for a question whose truth is not known yet", () => {
    expect(settle("team", "girl")).toBe(0);
  });
});

describe("prediction scoring at settle", () => {
  it("scores choices exact or nothing", () => {
    expect(settle("tears", "mum")).toBe(15);
    expect(settle("tears", "bride")).toBe(0);
  });

  it("scores numbers exact, close within tolerance, else nothing", () => {
    expect(settle("delay", 25)).toBe(15);
    expect(settle("delay", 35)).toBe(8);
    expect(settle("delay", 15)).toBe(8);
    expect(settle("delay", 36)).toBe(0);
    expect(settle("delay", 14)).toBe(0);
  });

  it("handles decimal tolerances without float surprises", () => {
    const config = predictionConfigSchema.parse({ ...base, questions: [{ ...number, min: 1.5, max: 5.5, tolerance: 0.2 }] });
    const truth = { answers: { n: 3.4 } };
    expect(prediction.scoreOnSettle!(config, truth, "n", guess(3.4))).toBe(15);
    expect(prediction.scoreOnSettle!(config, truth, "n", guess(3.6))).toBe(8);
    expect(prediction.scoreOnSettle!(config, truth, "n", guess(3.2))).toBe(8);
    expect(prediction.scoreOnSettle!(config, truth, "n", guess(3.7))).toBe(0);
  });

  it("scores clock times in minutes, wrapping at midnight", () => {
    expect(settle("ends", "23:50")).toBe(15);
    expect(settle("ends", "23:20")).toBe(8);
    expect(settle("ends", "00:20")).toBe(8);
    expect(settle("ends", "00:21")).toBe(0);
    expect(settle("ends", "22:00")).toBe(0);
  });

  it("scores dates in days", () => {
    expect(settle("born", "2027-03-10")).toBe(15);
    expect(settle("born", "2027-03-13")).toBe(8);
    expect(settle("born", "2027-03-07")).toBe(8);
    expect(settle("born", "2027-03-14")).toBe(0);
  });

  it("scores nothing for a malformed stored answer", () => {
    expect(settle("delay", "25")).toBe(0);
    expect(settle("nope", 25)).toBe(0);
  });
});

describe("prediction tally and results", () => {
  const answers = [
    { questionId: "tears", answer: guess("mum") },
    { questionId: "tears", answer: guess("groom") },
    { questionId: "delay", answer: guess(10) },
    { questionId: "delay", answer: guess(40) },
    { questionId: "delay", answer: guess(20) },
    { questionId: "delay", answer: guess("junk") },
  ];

  it("shows only how many guessed while open", () => {
    const tally = prediction.tally(predictionConfig, "open", answers, { viewerHasAnswered: true });
    expect(tally.questions.slice(0, 2)).toEqual([
      { id: "tears", total: 2, options: null, numbers: null, suppressed: "state" },
      { id: "delay", total: 3, options: null, numbers: null, suppressed: "state" },
    ]);
  });

  it("shows the spread once closed", () => {
    const tally = prediction.tally(predictionConfig, "closed", answers, { viewerHasAnswered: false });
    expect(tally.questions[0].options).toEqual([
      { id: "groom", count: 1 },
      { id: "bride", count: 0 },
      { id: "mum", count: 1 },
    ]);
    expect(tally.questions[1].numbers).toEqual({ min: 10, max: 40, median: 20 });
    expect(tally.questions[2]).toMatchObject({ total: 0, options: null, numbers: null, suppressed: null });
  });

  it("lists the settled answers in question order", () => {
    expect(prediction.results!(predictionConfig, predictionTruth).answers.map((a) => a.questionId)).toEqual(["tears", "delay", "ends", "born"]);
  });
});
