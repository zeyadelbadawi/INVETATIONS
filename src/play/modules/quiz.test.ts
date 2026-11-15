import { describe, expect, it } from "vitest";
import { NOW, quizConfig, quizInput, quizTruth, untimedQuiz } from "../fixtures";
import { LATE_GRACE_MS, isExpired, quiz, quizConfigSchema, type QuizView } from "./quiz";

const pick = (optionId: string) => ({ optionId });
const at = (elapsedMs: number) => ({ servedAt: NOW, answeredAt: NOW + elapsedMs });

describe("quiz config", () => {
  it("applies defaults", () => {
    expect(quizConfig).toMatchObject({ timed: true, secondsPerQuestion: 20, pointsCorrect: 10, speedBonus: 3 });
    expect(quizConfig.questions[0].image).toBeNull();
  });

  it("rejects truth-looking and unknown keys at every level", () => {
    const [first, ...rest] = quizInput.questions;
    const bad = [
      { ...quizInput, answers: { q1: "b" } },
      { ...quizInput, truth: quizTruth },
      { ...quizInput, questions: [{ ...first, correct: "b" }, ...rest] },
      { ...quizInput, questions: [{ ...first, answer: "b" }, ...rest] },
      { ...quizInput, questions: [{ ...first, options: [{ ...first.options[0], correct: true }, first.options[1]] }, ...rest] },
      { ...quizInput, title: { ar: "س", en: "Q", html: "<b>" } },
    ];
    for (const input of bad) expect(quizConfigSchema.safeParse(input).success).toBe(false);
  });

  it("enforces option counts, time range, ids and required text", () => {
    const [first] = quizInput.questions;
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `o${i}`, label: { en: "x" } }));
    const bad = [
      { ...quizInput, questions: [{ ...first, options: first.options.slice(0, 1) }] },
      { ...quizInput, questions: [{ ...first, options: many }] },
      { ...quizInput, questions: [] },
      { ...quizInput, secondsPerQuestion: 4 },
      { ...quizInput, secondsPerQuestion: 61 },
      { ...quizInput, speedBonus: 6 },
      { ...quizInput, questions: [first, first] },
      { ...quizInput, questions: [{ ...first, options: [first.options[0], first.options[0]] }] },
      { ...quizInput, questions: [{ ...first, id: "Bad Id" }] },
      { ...quizInput, questions: [{ ...first, prompt: { ar: " ", en: "" } }] },
      { ...quizInput, questions: [{ ...first, image: "not-a-uuid" }] },
    ];
    for (const input of bad) expect(quizConfigSchema.safeParse(input).success).toBe(false);
  });
});

describe("quiz truth", () => {
  it("accepts a complete key", () => {
    expect(quiz.checkTruth(quizConfig, quizTruth)).toEqual([]);
  });

  it("reports missing answers, unknown questions and unknown options", () => {
    expect(quiz.checkTruth(quizConfig, { answers: { q1: "b", q2: "c" } })).toHaveLength(1);
    expect(quiz.checkTruth(quizConfig, { answers: { ...quizTruth.answers, q9: "a" } })).toHaveLength(1);
    expect(quiz.checkTruth(quizConfig, { answers: { ...quizTruth.answers, q2: "d" } })).toHaveLength(1);
  });

  it("rejects extra keys in the truth object", () => {
    expect(quiz.truthSchema.safeParse({ answers: {}, note: "x" }).success).toBe(false);
  });
});

describe("quiz answers", () => {
  it("accepts only an existing option of an existing question", () => {
    expect(quiz.validateAnswer(quizConfig, "q1", pick("a"), { now: NOW })).toBe(true);
    expect(quiz.validateAnswer(quizConfig, "q2", pick("d"), { now: NOW })).toBe(false);
    expect(quiz.validateAnswer(quizConfig, "nope", pick("a"), { now: NOW })).toBe(false);
    expect(quiz.answerSchema.safeParse({ optionId: "a", score: 99 }).success).toBe(false);
  });

  it("walks the questions in order", () => {
    expect(quiz.nextQuestionId(quizConfig, [])).toBe("q1");
    expect(quiz.nextQuestionId(quizConfig, ["q1", "q3"])).toBe("q2");
    expect(quiz.nextQuestionId(quizConfig, ["q1", "q2", "q3"])).toBeNull();
  });
});

describe("quiz scoring", () => {
  const limit = quizConfig.secondsPerQuestion * 1000;
  const score = (optionId: string, elapsed: number) => quiz.scoreOnSubmit(quizConfig, quizTruth, "q1", pick(optionId), at(elapsed));

  it("gives nothing for a wrong answer, however fast", () => {
    expect(score("a", 0)).toBe(0);
  });

  it("adds the full speed bonus at zero elapsed and none at the limit", () => {
    expect(score("b", 0)).toBe(13);
    expect(score("b", limit / 2)).toBe(12); // 1.5 rounds up
    expect(score("b", limit - 1)).toBe(10);
    expect(score("b", limit)).toBe(10);
  });

  it("still counts within the grace period, then scores zero", () => {
    expect(score("b", limit + LATE_GRACE_MS)).toBe(10);
    expect(score("b", limit + LATE_GRACE_MS + 1)).toBe(0);
  });

  it("never exceeds the full bonus when the clocks disagree", () => {
    expect(score("b", -5000)).toBe(13);
  });

  it("scores zero for a timed answer that was never served, or without truth", () => {
    expect(quiz.scoreOnSubmit(quizConfig, quizTruth, "q1", pick("b"), { servedAt: null, answeredAt: NOW })).toBe(0);
    expect(quiz.scoreOnSubmit(quizConfig, null, "q1", pick("b"), at(0))).toBe(0);
  });

  it("has no bonus and no time limit when untimed", () => {
    expect(quiz.scoreOnSubmit(untimedQuiz, quizTruth, "q1", pick("b"), { servedAt: null, answeredAt: NOW })).toBe(10);
    expect(quiz.scoreOnSubmit(untimedQuiz, quizTruth, "q1", pick("b"), at(3_600_000))).toBe(10);
  });

  it("knows when a served question has run out", () => {
    expect(isExpired(quizConfig, NOW, NOW + limit + LATE_GRACE_MS)).toBe(false);
    expect(isExpired(quizConfig, NOW, NOW + limit + LATE_GRACE_MS + 1)).toBe(true);
    expect(isExpired(untimedQuiz, NOW, NOW + 10 * limit)).toBe(false);
  });
});

describe("quiz views", () => {
  it("shows nothing when hidden", () => {
    expect(quiz.publicView(quizConfig, "hidden", { now: NOW })).toEqual({ kind: "quiz", state: "hidden" });
  });

  it("exposes only ids up front while a timed quiz is open", () => {
    const view = quiz.publicView(quizConfig, "open", { now: NOW, seed: "s" }) as QuizView;
    expect(view.questions).toBeNull();
    expect(view.questionIds).toEqual(["q1", "q2", "q3"]);
  });

  it("serves full questions when untimed or finished", () => {
    expect((quiz.publicView(untimedQuiz, "open", { now: NOW }) as QuizView).questions).toHaveLength(3);
    expect((quiz.publicView(quizConfig, "closed", { now: NOW }) as QuizView).questions).toHaveLength(3);
  });

  it("shuffles options per player, deterministically", () => {
    const ids = (seed: string) => quiz.question(quizConfig, "q1", { now: NOW, seed })!.options.map((o) => o.id);
    expect(ids("game:p1")).toEqual(ids("game:p1"));
    expect([...ids("game:p1")].sort()).toEqual(["a", "b", "c", "d"]);
    const orders = new Set(Array.from({ length: 12 }, (_, i) => ids(`game:p${i}`).join("")));
    expect(orders.size).toBeGreaterThan(3);
    expect(quiz.question(quizConfig, "nope", { now: NOW, seed: "s" })).toBeNull();
  });
});

describe("quiz tally", () => {
  const answers = [
    { questionId: "q1", answer: pick("b") },
    { questionId: "q1", answer: pick("b") },
    { questionId: "q1", answer: pick("a") },
    { questionId: "q2", answer: pick("c") },
  ];

  it("gives only answer counts while open", () => {
    const tally = quiz.tally(quizConfig, "open", answers, { viewerHasAnswered: true });
    expect(tally.questions.map((q) => [q.total, q.options, q.suppressed])).toEqual([
      [3, null, "state"],
      [1, null, "state"],
      [0, null, "state"],
    ]);
  });

  it("gives per-option counts once closed", () => {
    const tally = quiz.tally(quizConfig, "closed", answers, { viewerHasAnswered: false });
    expect(tally.questions[0]).toMatchObject({ total: 3, suppressed: null });
    expect(tally.questions[0].options).toEqual([
      { id: "a", count: 1 },
      { id: "b", count: 2 },
      { id: "c", count: 0 },
      { id: "d", count: 0 },
    ]);
  });

  it("reveals the key through results", () => {
    expect(quiz.results!(quizConfig, quizTruth).answers).toEqual([
      { questionId: "q1", optionId: "b" },
      { questionId: "q2", optionId: "c" },
      { questionId: "q3", optionId: "yes" },
    ]);
  });
});
