import { describe, expect, it } from "vitest";
import { NOW, cluesConfig, predictionConfig, predictionTruth, quizConfig, quizInput, quizTruth, thisOrThatConfig, thisOrThatTruth } from "./fixtures";
import { MAX_CONFIG_BYTES, getModule, isGameKind, openGame, parseGame, storedBytes } from "./registry";
import { GAME_KINDS } from "./types";

describe("registry", () => {
  it("has a module for every kind", () => {
    for (const kind of GAME_KINDS) expect(getModule(kind).kind).toBe(kind);
    expect(isGameKind("quiz")).toBe(true);
    expect(isGameKind("bingo")).toBe(false);
  });

  it("parses a config and reports readable issues", () => {
    const good = parseGame("quiz", quizInput);
    expect(good).toEqual({ ok: true, game: { kind: "quiz", config: quizConfig } });
    const bad = parseGame("quiz", { ...quizInput, answers: { q1: "b" }, secondsPerQuestion: 2 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues.join("\n")).toMatch(/secondsPerQuestion/);
    expect(parseGame("bingo", {})).toEqual({ ok: false, issues: ["unknown game kind"] });
    expect(parseGame("quiz", null).ok).toBe(false);
  });

  it("measures a config the way Postgres stores jsonb", () => {
    // jsonb text: {"a": 1, "b": [1, 2], "c": {"d": "ص"}}
    expect(storedBytes({ a: 1, b: [1, 2], c: { d: "ص" } })).toBe(39);
    expect(storedBytes({})).toBe(2);
  });

  it("rejects a config larger than the database allows", () => {
    const long = (n: number) => ({ ar: "ص".repeat(n), en: "ص".repeat(n) });
    const questions = (count: number) =>
      Array.from({ length: count }, (_, q) => ({
        id: `q${q}`,
        prompt: long(160),
        options: Array.from({ length: 8 }, (_, o) => ({ id: `o${o}`, label: long(60) })),
      }));
    expect(parseGame("vote", { title: long(80), questions: questions(20) })).toEqual({ ok: false, issues: ["the game is too large"] });
    expect(parseGame("vote", { title: long(80), questions: questions(10) }).ok).toBe(true);
    expect(MAX_CONFIG_BYTES).toBe(60_000);
  });
});

describe("openGame", () => {
  it("returns null for anything invalid", () => {
    expect(openGame("quiz", { title: { en: "x" } })).toBeNull();
    expect(openGame("nope", quizInput)).toBeNull();
  });

  it("runs a quiz end to end from raw JSON", () => {
    const game = openGame("quiz", quizInput)!;
    expect(game.needsTruthOnSubmit).toBe(true);
    expect(game.questionIds).toEqual(["q1", "q2", "q3"]);
    expect(game.parseTruth(quizTruth)).toEqual({ ok: true, truth: quizTruth });
    expect(game.parseTruth({ answers: { q1: "b" } }).ok).toBe(false);
    expect(game.parseTruth("junk").ok).toBe(false);

    expect(game.acceptAnswer("q1", { optionId: "b" }, { now: NOW })).toEqual({ optionId: "b" });
    expect(game.acceptAnswer("q1", { optionId: "zz" }, { now: NOW })).toBeNull();
    expect(game.acceptAnswer("q1", { optionId: "b", extra: 1 }, { now: NOW })).toBeNull();
    expect(game.acceptAnswer("q1", "b", { now: NOW })).toBeNull();

    const timing = { servedAt: NOW, answeredAt: NOW };
    expect(game.scoreOnSubmit(quizTruth, "q1", { optionId: "b" }, timing)).toBe(13);
    expect(game.scoreOnSubmit(quizTruth, "q1", { optionId: "nope" }, timing)).toBe(0);
    expect(game.scoreOnSubmit(quizTruth, "q1", "junk", timing)).toBe(0);
    expect(game.scoreOnSettle(quizTruth, "q1", { optionId: "b" })).toBe(0);
    expect(game.nextQuestionId(["q1"])).toBe("q2");

    const tally = game.tally("closed", [{ questionId: "q1", answer: { optionId: "b" } }, { questionId: "q1", answer: "junk" }], { viewerHasAnswered: true });
    expect(tally.questions[0].total).toBe(1);
    expect(game.results(quizTruth)).toEqual({ answers: [
      { questionId: "q1", optionId: "b" },
      { questionId: "q2", optionId: "c" },
      { questionId: "q3", optionId: "yes" },
    ] });
  });

  it("settles a this_or_that and refuses reveal answers where they do not belong", () => {
    const game = openGame("vote", thisOrThatConfig)!;
    expect(game.settle(thisOrThatTruth)).toEqual({ ok: true, truth: thisOrThatTruth });
    expect(game.settle(thisOrThatTruth, { late: "one" }).ok).toBe(false);
    expect(game.scoreOnSettle(thisOrThatTruth, "cook", { optionId: "two" })).toBe(5);
  });

  it("settles a prediction with the reveal answer injected", () => {
    const game = openGame("prediction", predictionConfig)!;
    expect(game.parseTruth(predictionTruth).ok).toBe(true);
    expect(game.parseTruth({ answers: { ...predictionTruth.answers, team: "boy" } }).ok).toBe(false);
    expect(game.settle(predictionTruth).ok).toBe(false);
    const settled = game.settle(predictionTruth, { team: "boy" });
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(game.scoreOnSettle(settled.truth, "team", { value: "boy" })).toBe(15);
    expect(game.scoreOnSettle(settled.truth, "delay", { value: 30 })).toBe(8);
  });

  it("handles clues, which have no truth and no results", () => {
    const game = openGame("clues", cluesConfig)!;
    expect(game.parseTruth({})).toEqual({ ok: true, truth: {} });
    expect(game.acceptAnswer("c3", { seen: true }, { now: NOW })).toBeNull();
    expect(game.scoreOnSubmit(null, "c1", { seen: true }, { servedAt: null, answeredAt: NOW })).toBe(1);
    expect(game.scoreOnSubmit(null, "c3", { seen: true }, { servedAt: null, answeredAt: NOW })).toBe(0);
    expect(game.results({})).toBeNull();
  });
});
