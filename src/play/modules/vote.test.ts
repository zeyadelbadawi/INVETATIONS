import { describe, expect, it } from "vitest";
import { NOW, pollConfig, thisOrThatConfig, thisOrThatTruth } from "../fixtures";
import type { GameState } from "../types";
import { vote, voteConfigSchema, type VoteConfig } from "./vote";

const pick = (optionId: string) => ({ optionId });
const votes = (questionId: string, ...optionIds: string[]) => optionIds.map((optionId) => ({ questionId, answer: pick(optionId) }));
const input = {
  title: { en: "Poll" },
  questions: [{ id: "q", prompt: { en: "?" }, options: [{ id: "a", label: { en: "A" } }, { id: "b", label: { en: "B" } }] }],
};

describe("vote config", () => {
  it("applies defaults", () => {
    expect(pollConfig).toMatchObject({ mode: "poll", showTally: "after_vote", pointsParticipation: 2, pointsMatch: 5, minTallyVotes: 5 });
  });

  it("rejects unknown and truth-looking keys", () => {
    expect(voteConfigSchema.safeParse({ ...input, answers: { q: "a" } }).success).toBe(false);
    expect(voteConfigSchema.safeParse({ ...input, questions: [{ ...input.questions[0], realAnswer: "a" }] }).success).toBe(false);
  });

  it("enforces 2–8 options, known modes, and exactly two options for this_or_that", () => {
    const option = (i: number) => ({ id: `o${i}`, label: { en: `O${i}` } });
    const withOptions = (n: number, mode = "poll") => ({ ...input, mode, questions: [{ ...input.questions[0], options: Array.from({ length: n }, (_, i) => option(i)) }] });
    expect(voteConfigSchema.safeParse(withOptions(1)).success).toBe(false);
    expect(voteConfigSchema.safeParse(withOptions(8)).success).toBe(true);
    expect(voteConfigSchema.safeParse(withOptions(9)).success).toBe(false);
    expect(voteConfigSchema.safeParse(withOptions(3, "this_or_that")).success).toBe(false);
    expect(voteConfigSchema.safeParse(withOptions(2, "this_or_that")).success).toBe(true);
    expect(voteConfigSchema.safeParse({ ...input, mode: "bet" }).success).toBe(false);
    expect(voteConfigSchema.safeParse({ ...input, minTallyVotes: 0 }).success).toBe(false);
  });
});

describe("vote truth", () => {
  it("allows the couple's answers only on a this_or_that, and lets them skip a question", () => {
    expect(vote.checkTruth(thisOrThatConfig, thisOrThatTruth)).toEqual([]);
    expect(vote.checkTruth(thisOrThatConfig, { answers: { late: "one" } })).toEqual([]);
    expect(vote.checkTruth(thisOrThatConfig, { answers: { late: "three" } })).toHaveLength(1);
    expect(vote.checkTruth(thisOrThatConfig, { answers: { nope: "one" } })).toHaveLength(1);
    expect(vote.checkTruth(pollConfig, { answers: { cake: "choc" } })).toHaveLength(1);
    expect(vote.checkTruth(pollConfig, { answers: {} })).toEqual([]);
  });
});

describe("vote answers and scoring", () => {
  it("validates the option", () => {
    expect(vote.validateAnswer(pollConfig, "cake", pick("berry"), { now: NOW })).toBe(true);
    expect(vote.validateAnswer(pollConfig, "cake", pick("dj"), { now: NOW })).toBe(false);
    expect(vote.validateAnswer(pollConfig, "nope", pick("dj"), { now: NOW })).toBe(false);
  });

  it("awards participation on submit without needing truth", () => {
    expect(vote.needsTruthOnSubmit).toBe(false);
    expect(vote.scoreOnSubmit(pollConfig, null, "cake", pick("choc"), { servedAt: null, answeredAt: NOW })).toBe(2);
  });

  it("awards match points at settle for a this_or_that only", () => {
    expect(vote.scoreOnSettle!(thisOrThatConfig, thisOrThatTruth, "late", pick("one"))).toBe(5);
    expect(vote.scoreOnSettle!(thisOrThatConfig, thisOrThatTruth, "late", pick("two"))).toBe(0);
    expect(vote.scoreOnSettle!(thisOrThatConfig, { answers: {} }, "late", pick("one"))).toBe(0);
    expect(vote.scoreOnSettle!(pollConfig, { answers: { cake: "choc" } }, "cake", pick("choc"))).toBe(0);
  });

  it("reveals the couple's answers through results", () => {
    expect(vote.results!(thisOrThatConfig, thisOrThatTruth).answers).toEqual([
      { questionId: "late", optionId: "one" },
      { questionId: "cook", optionId: "two" },
    ]);
    expect(vote.results!(pollConfig, { answers: {} }).answers).toEqual([]);
  });
});

describe("vote tally", () => {
  const enough = votes("cake", "choc", "choc", "vanilla", "berry", "choc");
  const withTally = (showTally: VoteConfig["showTally"]): VoteConfig => ({ ...pollConfig, showTally });
  const suppressed = (config: VoteConfig, state: GameState, viewerHasAnswered: boolean) =>
    vote.tally(config, state, enough, { viewerHasAnswered }).questions[0].suppressed;

  it("follows showTally", () => {
    expect(suppressed(withTally("always"), "open", false)).toBeNull();
    expect(suppressed(withTally("after_vote"), "open", false)).toBe("vote_first");
    expect(suppressed(withTally("after_vote"), "open", true)).toBeNull();
    expect(suppressed(withTally("after_close"), "open", true)).toBe("state");
    for (const mode of ["always", "after_vote", "after_close"] as const) {
      expect(suppressed(withTally(mode), "closed", false)).toBeNull();
      expect(suppressed(withTally(mode), "settled", false)).toBeNull();
      expect(suppressed(withTally(mode), "hidden", true)).toBe("state");
    }
  });

  it("counts per option in config order and ignores unknown options", () => {
    const tally = vote.tally(withTally("always"), "open", [...enough, ...votes("cake", "ghost")], { viewerHasAnswered: false });
    expect(tally.questions[0]).toEqual({
      id: "cake",
      total: 5,
      options: [
        { id: "choc", count: 3 },
        { id: "vanilla", count: 1 },
        { id: "berry", count: 1 },
      ],
      numbers: null,
      suppressed: null,
    });
  });

  it("suppresses breakdowns below minTallyVotes, even after close", () => {
    const four = enough.slice(0, 4);
    for (const state of ["open", "closed", "settled"] as const) {
      const question = vote.tally(withTally("always"), state, four, { viewerHasAnswered: true }).questions[0];
      expect(question).toMatchObject({ total: 4, options: null, suppressed: "too_few" });
    }
    // The music question has no votes at all.
    expect(vote.tally(withTally("always"), "closed", enough, { viewerHasAnswered: true }).questions[1].suppressed).toBe("too_few");
    const relaxed = { ...withTally("always"), minTallyVotes: 4 };
    expect(vote.tally(relaxed, "open", four, { viewerHasAnswered: true }).questions[0].suppressed).toBeNull();
  });
});
