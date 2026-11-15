// Property-style check of security rules 22–23: whatever a guest can be sent
// while a game is hidden or open — the view, every question, every tally, for
// many players and answer mixes — carries no truth.
//
// The correct option of a choice question is necessarily public as ONE OF the
// options, so the sentinel is allowed in exactly one place: the `id` of an entry
// in a complete `options` list. Anywhere else (a field of its own, a quiz tally,
// a timed quiz's up-front view) it is a leak. Truth values that are not options
// (numbers, times, dates) must not appear at all.
import { describe, expect, it } from "vitest";
import { NOW } from "./fixtures";
import { openGame } from "./registry";
import { deterministicShuffle } from "./scoring";
import type { GameKind, Tally } from "./types";

const SECRET = "zz-secret";
const TRUTH_KEYS = /^(answers?|truth|correct.*|solution|key)$/i;
const l = (en: string) => ({ ar: `${en} ع`, en });

type Value = string | number;
type Case = { name: string; kind: GameKind; config: unknown; truth: { answers: Record<string, Value> }; picks: Record<string, Value[]> };

// Questions whose correct option is the only one with SECRET in its id, at a different position each time.
function choiceQuestions(count: number, optionCount: number) {
  return Array.from({ length: count }, (_, q) => ({
    id: `q${q}`,
    prompt: l(`Question ${q}`),
    options: Array.from({ length: optionCount }, (_, o) => ({
      id: o === q % optionCount ? `${SECRET}-${q}` : `o${o}`,
      label: l(`Option ${q}-${o}`),
    })),
  }));
}

type Choice = ReturnType<typeof choiceQuestions>;
const keyFor = (questions: Choice) => Object.fromEntries(questions.map((q, i) => [q.id, `${SECRET}-${i}`]));
const picksFor = (questions: Choice) => Object.fromEntries(questions.map((q) => [q.id, q.options.map((o) => o.id)]));

function cases(): Case[] {
  const quizQuestions = choiceQuestions(8, 4);
  const pairs = choiceQuestions(6, 2);
  const choices = choiceQuestions(3, 3);
  return [
    ...[true, false].map((timed) => ({
      name: `quiz timed=${timed}`,
      kind: "quiz" as const,
      config: { title: l("Quiz"), timed, questions: quizQuestions },
      truth: { answers: keyFor(quizQuestions) },
      picks: picksFor(quizQuestions),
    })),
    ...(["always", "after_vote", "after_close"] as const).map((showTally) => ({
      name: `this_or_that showTally=${showTally}`,
      kind: "vote" as const,
      config: { title: l("Vote"), mode: "this_or_that", showTally, minTallyVotes: 1, questions: pairs },
      truth: { answers: keyFor(pairs) },
      picks: picksFor(pairs),
    })),
    {
      name: "prediction",
      kind: "prediction",
      config: {
        title: l("Predictions"),
        questions: [
          ...choices.map((q) => ({ ...q, type: "choice" })),
          { id: "num", prompt: l("How many?"), type: "number", min: 0, max: 99999, unit: l("x"), tolerance: 5 },
          { id: "clock", prompt: l("When?"), type: "time", tolerance: 10 },
          { id: "date", prompt: l("Which day?"), type: "time", format: "date", tolerance: 2 },
        ],
      },
      // Sentinels no guest picks: 73519, 03:47, 2031-07-19.
      truth: { answers: { ...keyFor(choices), num: 73519, clock: "03:47", date: "2031-07-19" } },
      picks: { ...picksFor(choices), num: [1, 2, 3, 400], clock: ["10:00", "11:30"], date: ["2030-01-01"] },
    },
  ];
}

type Finding = { path: string[]; value: string };

// Every string or number in a JSON value, with the keys leading to it, plus every object key seen.
function walk(node: unknown, path: string[], findings: Finding[], keys: Set<string>): void {
  if (Array.isArray(node)) node.forEach((item) => walk(item, [...path, "[]"], findings, keys));
  else if (node !== null && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) {
      keys.add(key);
      walk(child, [...path, key], findings, keys);
    }
  } else if (typeof node === "string" || typeof node === "number") findings.push({ path, value: String(node) });
}

const isOptionId = (path: string[]) => path.slice(-3).join("/") === "options/[]/id";

describe("nothing a guest can receive before close contains truth", () => {
  for (const sample of cases()) {
    it(sample.name, () => {
      const game = openGame(sample.kind, sample.config)!;
      expect(game.parseTruth(sample.truth).ok).toBe(true);

      const views: unknown[] = [];
      const tallies: Tally[] = [];
      for (const state of ["hidden", "open"] as const) {
        for (let player = 0; player < 25; player++) {
          const seed = `game:${player}`;
          views.push(game.publicView(state, { now: NOW + player, seed }));
          if (state === "open") for (const id of game.questionIds) views.push(game.question(id, { now: NOW, seed }));

          // A different mix of answers each round, often with everyone on the truth.
          const answers = Object.entries(sample.picks).flatMap(([questionId, values]) =>
            deterministicShuffle([...values, ...values, ...values, sample.truth.answers[questionId]], seed)
              .slice(0, 2 + (player % 9))
              .map((value) => ({ questionId, answer: sample.kind === "prediction" ? { value } : { optionId: value } })),
          );
          for (const viewerHasAnswered of [true, false]) tallies.push(game.tally(state, answers, { viewerHasAnswered }));
        }
      }

      // The payload is what actually crosses the wire.
      const payload: unknown = JSON.parse(JSON.stringify({ views, tallies }));
      const findings: Finding[] = [];
      const keys = new Set<string>();
      walk(payload, [], findings, keys);

      expect([...keys].filter((key) => TRUTH_KEYS.test(key))).toEqual([]);

      const text = JSON.stringify(payload);
      for (const value of Object.values(sample.truth.answers).map(String)) {
        if (!value.startsWith(SECRET)) expect(text).not.toContain(value);
      }

      const sentinels = findings.filter((finding) => finding.value.includes(SECRET));
      expect(sentinels.filter((finding) => !isOptionId(finding.path))).toEqual([]);

      // Quiz and prediction: no per-option data at all while open.
      const inTallies = sentinels.filter((finding) => finding.path[0] === "tallies");
      if (sample.kind !== "vote") expect(inTallies).toEqual([]);
      if (sample.name === "this_or_that showTally=after_close") expect(inTallies).toEqual([]);

      // A timed quiz reveals options only through question(), one at a time.
      if (sample.name === "quiz timed=true") {
        expect(JSON.stringify(views.filter((view) => (view as { kind?: string }).kind === "quiz"))).not.toContain(SECRET);
      }
    });
  }

  it("the check itself can fail: a leaked key is caught", () => {
    const findings: Finding[] = [];
    const keys = new Set<string>();
    walk({ questions: [{ id: "q0", correct: `${SECRET}-0`, options: [{ id: `${SECRET}-0` }] }] }, [], findings, keys);
    expect([...keys].some((key) => TRUTH_KEYS.test(key))).toBe(true);
    expect(findings.filter((f) => f.value.includes(SECRET) && !isOptionId(f.path))).toHaveLength(1);
  });

  it("views do not depend on which option is correct", () => {
    // Same config, opposite truths: a guest's payload is identical, so it cannot encode the truth.
    const config = { title: l("Quiz"), timed: false, questions: choiceQuestions(5, 4) };
    const game = openGame("quiz", config)!;
    const answers = [{ questionId: "q0", answer: { optionId: "o1" } }];
    const snapshot = () =>
      JSON.stringify([
        game.publicView("open", { now: NOW, seed: "s" }),
        game.questionIds.map((id) => game.question(id, { now: NOW, seed: "s" })),
        game.tally("open", answers, { viewerHasAnswered: true }),
      ]);
    const before = snapshot();
    expect(game.scoreOnSubmit({ answers: { q0: "o1" } }, "q0", { optionId: "o1" }, { servedAt: null, answeredAt: NOW })).toBe(10);
    expect(game.scoreOnSubmit({ answers: { q0: `${SECRET}-0` } }, "q0", { optionId: "o1" }, { servedAt: null, answeredAt: NOW })).toBe(0);
    expect(snapshot()).toBe(before);
  });

  it("shuffling does not park the correct option in a fixed slot", () => {
    const game = openGame("quiz", { title: l("Quiz"), questions: choiceQuestions(1, 4) })!;
    const slots = new Set(
      Array.from({ length: 40 }, (_, player) => {
        const question = game.question("q0", { now: NOW, seed: `game:${player}` }) as { options: { id: string }[] };
        return question.options.findIndex((o) => o.id.startsWith(SECRET));
      }),
    );
    expect(slots.size).toBe(4);
  });
});
