import { describe, expect, it } from "vitest";
import { getModule, parseGame } from "../registry";
import {
  OCCASIONS,
  awardsFromBank,
  cluesFromBank,
  getBank,
  pollFromBank,
  predictionFromBank,
  quizFromBank,
  starterGames,
  thisOrThatFromBank,
  type BankGroup,
} from "./index";
import type { Localized } from "../types";

const wedding = getBank("wedding");
const reveal = getBank("gender_reveal");
const corporate = getBank("corporate");

const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;

type AnyItem = { id: string; prompt?: Localized; text?: Localized; hostPrompt?: Localized; options?: Localized[]; answer?: { type: string; options?: Localized[]; unit?: Localized } };
const groups: [string, BankGroup<AnyItem>, number][] = [
  ["wedding.quiz", wedding.quiz, 20],
  ["wedding.thisOrThat", wedding.thisOrThat, 20],
  ["wedding.predictions", wedding.predictions, 10],
  ["wedding.polls", wedding.polls, 8],
  ["gender_reveal.clues", reveal.clues, 12],
  ["gender_reveal.quiz", reveal.quiz, 12],
  ["gender_reveal.predictions", reveal.predictions, 8],
  ["gender_reveal.namePolls", reveal.namePolls, 6],
  ["corporate.polls", corporate.polls, 10],
  ["corporate.predictions", corporate.predictions, 8],
  ["corporate.awards", corporate.awards, 8],
  ["corporate.teasers", corporate.teasers, 6],
];

function texts(item: AnyItem): Localized[] {
  const direct = [item.prompt, item.text, item.hostPrompt, item.answer?.unit].filter((value): value is Localized => value !== undefined);
  return [...direct, ...(item.options ?? []), ...(item.answer?.options ?? [])];
}

function expectBilingual(value: Localized, where: string) {
  expect(value.ar.trim(), `${where} ar`).not.toBe("");
  expect(value.en.trim(), `${where} en`).not.toBe("");
  // "٪" / "%" style units have no letters; everything else must be in the right script.
  if (value.ar.length > 2) expect(value.ar, `${where} ar script`).toMatch(ARABIC);
  if (value.en.length > 2) expect(value.en, `${where} en script`).toMatch(LATIN);
  expect(value.ar, `${where} ar has no Latin letters`).not.toMatch(LATIN);
  expect(value.en, `${where} en has no Arabic letters`).not.toMatch(ARABIC);
}

describe("bank content", () => {
  it("covers every occasion", () => {
    expect(OCCASIONS).toEqual(["wedding", "gender_reveal", "corporate"]);
  });

  it.each(groups)("%s has enough items, all bilingual and short", (name, group, minimum) => {
    expect(group.items.length).toBeGreaterThanOrEqual(minimum);
    expectBilingual(group.title, `${name} title`);
    if (group.intro) expectBilingual(group.intro, `${name} intro`);
    for (const item of group.items) {
      expect(item.prompt ?? item.text, item.id).toBeDefined();
      for (const value of texts(item)) expectBilingual(value, item.id);
      if (item.prompt) {
        expect(item.prompt.ar.length, item.id).toBeLessThanOrEqual(70);
        expect(item.prompt.en.length, item.id).toBeLessThanOrEqual(70);
      }
    }
  });

  it("uses stable ids that are unique across all banks and valid as question ids", () => {
    const ids = groups.flatMap(([, group]) => group.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[wgc]-[a-z]+(-[a-z]+)+$/);
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(40);
  });

  it("keeps option counts within what each game accepts", () => {
    const between = (group: BankGroup<AnyItem>, min: number, max: number) => {
      for (const item of group.items) {
        const options = item.options ?? item.answer?.options;
        if (!options) continue;
        expect(options.length, item.id).toBeGreaterThanOrEqual(min);
        expect(options.length, item.id).toBeLessThanOrEqual(max);
        const labels = options.flatMap((o) => [o.ar, o.en]);
        expect(new Set(labels).size, `${item.id} repeats an option`).toBe(labels.length);
      }
    };
    between(wedding.quiz, 2, 6);
    between(reveal.quiz, 2, 6);
    for (const group of [wedding.polls, reveal.namePolls, corporate.polls, wedding.predictions, reveal.predictions, corporate.predictions]) {
      between(group, 2, 8);
    }
  });

  it("stays clear of what the experience design rules out", () => {
    const banned = [/\b(bet|betting|wager|gambl\w*|odds|jackpot|alcohol|beer|wine|champagne|cocktail|toast|kiss\w*)\b/i, /(^|\s)(ال)?(رهان|مراهنة|مراهنات|قمار|خمر|خمرة|بيرة|نبيذ|بوسة)(\s|$|[؟،.])/];
    for (const [, group] of groups) {
      for (const item of group.items) {
        for (const value of texts(item)) {
          for (const pattern of banned) expect(`${value.ar} ${value.en}`, item.id).not.toMatch(pattern);
        }
      }
    }
  });

  it("presents every old wives' tale as folklore and names both outcomes", () => {
    expect(reveal.clues.intro?.en).toMatch(/not medical/i);
    expect(reveal.clues.intro?.ar).toContain("مش كلام دكاترة");
    const folk = reveal.clues.items.filter((item) => item.id !== "g-clue-calendar");
    for (const item of folk) {
      expect(item.text.en, item.id).toMatch(/boy/);
      expect(item.text.en, item.id).toMatch(/girl/);
      expect(item.text.ar, item.id).toContain("ولد");
      expect(item.text.ar, item.id).toMatch(/بنت/);
      expect(item.hostPrompt, item.id).toBeDefined();
    }
    // Neither outcome is always mentioned first.
    const boyFirst = folk.filter((item) => item.text.en.indexOf("boy") < item.text.en.indexOf("girl")).length;
    expect(boyFirst).toBeGreaterThanOrEqual(folk.length / 3);
    expect(boyFirst).toBeLessThanOrEqual((2 * folk.length) / 3);
  });
});

describe("bank instantiation", () => {
  const accepted = (kind: "quiz" | "vote" | "prediction" | "clues", config: unknown) => {
    const result = parseGame(kind, config);
    expect(result.ok ? [] : result.issues).toEqual([]);
    // Parsing the parsed config again changes nothing.
    expect(getModule(kind).configSchema.parse(config)).toEqual(config);
  };

  it("turns every group, in full, into a valid config", () => {
    accepted("quiz", quizFromBank(wedding.quiz));
    accepted("vote", thisOrThatFromBank(wedding.thisOrThat));
    accepted("prediction", predictionFromBank(wedding.predictions));
    accepted("vote", pollFromBank(wedding.polls));
    accepted("clues", cluesFromBank(reveal.clues));
    accepted("quiz", quizFromBank(reveal.quiz));
    accepted("prediction", predictionFromBank(reveal.predictions));
    accepted("vote", pollFromBank(reveal.namePolls));
    accepted("vote", pollFromBank(corporate.polls));
    accepted("prediction", predictionFromBank(corporate.predictions));
    accepted("vote", awardsFromBank(corporate.awards));
    accepted("clues", cluesFromBank(corporate.teasers));
  });

  it("uses bank ids for questions and generated ids for options", () => {
    const quiz = quizFromBank(wedding.quiz, { limit: 3 });
    expect(quiz.questions.map((q) => q.id)).toEqual(wedding.quiz.items.slice(0, 3).map((item) => item.id));
    expect(quiz.questions[0].options.map((o) => o.id)).toEqual(["o1", "o2", "o3", "o4"]);
    expect(quiz.title).toEqual(wedding.quiz.title);
  });

  it("selects by id, in the given order, skipping unknown and repeated ids", () => {
    const ids = ["w-quiz-honeymoon", "nope", "w-quiz-first-meet", "w-quiz-honeymoon"];
    expect(quizFromBank(wedding.quiz, { ids }).questions.map((q) => q.id)).toEqual(["w-quiz-honeymoon", "w-quiz-first-meet"]);
  });

  it("caps at what the game allows", () => {
    expect(thisOrThatFromBank(wedding.thisOrThat).questions).toHaveLength(20);
    expect(quizFromBank(wedding.quiz, { limit: 999 }).questions.length).toBeLessThanOrEqual(25);
  });

  it("fills this-or-that options with the two partners as one / two", () => {
    const partners: [Localized, Localized] = [{ ar: "كريم", en: "Karim" }, { ar: "سلمى", en: "Salma" }];
    const config = thisOrThatFromBank(wedding.thisOrThat, { limit: 2, partners });
    expect(config.mode).toBe("this_or_that");
    for (const question of config.questions) {
      expect(question.options).toEqual([{ id: "one", label: partners[0] }, { id: "two", label: partners[1] }]);
    }
    expect(thisOrThatFromBank(wedding.thisOrThat, { limit: 1 }).questions[0].options[0].label.en).toBe("The groom");
  });

  it("keeps award results back until the vote closes", () => {
    const config = awardsFromBank(corporate.awards, { nominees: [{ ar: "منى", en: "Mona" }, { ar: "عمر", en: "Omar" }] });
    expect(config).toMatchObject({ mode: "award", showTally: "after_close", minTallyVotes: 5 });
    expect(config.questions[0].options.map((o) => o.label.en)).toEqual(["Mona", "Omar"]);
  });

  it("schedules clue cards and never copies editor prompts into the game", () => {
    const config = cluesFromBank(corporate.teasers, { limit: 3, revealAt: ["2026-12-01T09:00:00+02:00", null] });
    expect(config.clues.map((c) => c.revealAt)).toEqual(["2026-12-01T09:00:00+02:00", null, null]);
    expect(config.clues.every((c) => c.hint === undefined)).toBe(true);
  });

  it("never marks a bank prediction as reveal-derived", () => {
    for (const group of [wedding.predictions, reveal.predictions, corporate.predictions]) {
      for (const question of predictionFromBank(group).questions) {
        if (question.type === "choice") expect(question.truthFromReveal).toBe(false);
      }
    }
  });

  it.each(OCCASIONS)("builds a starter set for %s", (occasion) => {
    const games = starterGames(occasion);
    expect(games).toHaveLength(4);
    expect(new Set(games.map((g) => g.key)).size).toBe(4);
    for (const game of games) accepted(game.kind, game.config);
  });
});
