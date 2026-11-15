// The host's game controls: form state -> truth payloads, and edited configs,
// checked against the play engine's own validation.
import { describe, expect, it } from "vitest";
import { OCCASIONS, starterGames } from "@/play/banks";
import { cluesConfig, pollConfig, predictionConfig, quizConfig, thisOrThatConfig } from "@/play/fixtures";
import { openGame, parseGame } from "@/play/registry";
import {
  asEditConfig,
  buildTruth,
  formatCountdown,
  gameTitle,
  leadUntil,
  limitsFor,
  newGameItem,
  prepareConfig,
  truthInputs,
  type EditConfig,
} from "@/features/host/lib/play";

const edit = (config: unknown) => asEditConfig(JSON.parse(JSON.stringify(config)))!;

describe("correct-answer forms", () => {
  it("quiz: every question is required and the payload passes the engine's check", () => {
    const inputs = truthInputs("quiz", edit(quizConfig));
    expect(inputs.map((i) => [i.id, i.input, "required" in i && i.required])).toEqual([
      ["q1", "choice", true],
      ["q2", "choice", true],
      ["q3", "choice", true],
    ]);
    const partial = buildTruth(inputs, { q1: "b", q2: "" });
    expect(partial.missing).toEqual(["q2", "q3"]);

    const built = buildTruth(inputs, { q1: "b", q2: "c", q3: "yes" });
    expect(built.missing).toEqual([]);
    expect(built.invalid).toEqual([]);
    expect(openGame("quiz", quizConfig)!.parseTruth(built.truth)).toEqual({ ok: true, truth: { answers: { q1: "b", q2: "c", q3: "yes" } } });
  });

  it("quiz: an option that is not on the question is refused before it is sent", () => {
    const inputs = truthInputs("quiz", edit(quizConfig));
    const built = buildTruth(inputs, { q1: "zzz", q2: "c", q3: "yes" });
    expect(built.invalid).toEqual(["q1"]);
    expect(built.truth.answers).not.toHaveProperty("q1");
  });

  it("this-or-that: answers are optional; polls ask for nothing", () => {
    const inputs = truthInputs("vote", edit(thisOrThatConfig));
    expect(inputs.every((i) => i.input === "choice" && !i.required)).toBe(true);
    const built = buildTruth(inputs, { late: "one" });
    expect(built.missing).toEqual([]);
    expect(built.truth).toEqual({ answers: { late: "one" } });
    expect(openGame("vote", thisOrThatConfig)!.parseTruth(built.truth).ok).toBe(true);
    expect(openGame("vote", thisOrThatConfig)!.parseTruth(buildTruth(inputs, {}).truth).ok).toBe(true);

    expect(truthInputs("vote", edit(pollConfig))).toEqual([]);
    expect(truthInputs("clues", edit(cluesConfig))).toEqual([]);
  });

  it("prediction: choice, number, clock and date values; reveal questions are never entered", () => {
    const inputs = truthInputs("prediction", edit(predictionConfig));
    expect(inputs.map((i) => [i.id, i.input])).toEqual([
      ["tears", "choice"],
      ["delay", "number"],
      ["ends", "clock"],
      ["born", "date"],
      ["team", "reveal"],
    ]);
    // Even if a value for the reveal question is somehow in the form state, it is dropped.
    const built = buildTruth(inputs, { tears: "mum", delay: "٢٥", ends: "23:50", born: "2027-03-10", team: "boy" });
    expect(built.missing).toEqual([]);
    expect(built.invalid).toEqual([]);
    expect(built.truth).toEqual({ answers: { tears: "mum", delay: 25, ends: "23:50", born: "2027-03-10" } });
    const game = openGame("prediction", predictionConfig)!;
    expect(game.parseTruth(built.truth).ok).toBe(true);
    // The engine itself refuses a host-entered reveal answer.
    expect(game.parseTruth({ answers: { ...built.truth.answers, team: "boy" } }).ok).toBe(false);
    // And the same payload settles once the reveal supplies its part.
    expect(game.settle(built.truth, { team: "girl" })).toMatchObject({ ok: true, truth: { answers: { team: "girl", delay: 25 } } });
  });

  it("prediction: out-of-range numbers and malformed times are flagged", () => {
    const inputs = truthInputs("prediction", edit(predictionConfig));
    const built = buildTruth(inputs, { tears: "nobody", delay: "500", ends: "25:00", born: "10/03/2027" });
    expect(built.invalid).toEqual(["tears", "delay", "ends", "born"]);
    expect(built.truth.answers).toEqual({});
    expect(buildTruth(inputs, { tears: "mum", delay: "abc", ends: "23:50", born: "2027-03-10" }).invalid).toEqual(["delay"]);
    expect(buildTruth(inputs, {}).missing).toEqual(["tears", "delay", "ends", "born"]);
  });

  it("every starter game yields a form whose filled-in payload the engine accepts", () => {
    for (const occasion of OCCASIONS) {
      for (const game of starterGames(occasion)) {
        const config = edit(game.config);
        const inputs = truthInputs(game.kind, config);
        const values: Record<string, string> = {};
        for (const input of inputs) {
          if (input.input === "choice") values[input.id] = input.options[0].id;
          else if (input.input === "number") values[input.id] = String(input.min);
          else if (input.input === "clock") values[input.id] = "21:30";
          else if (input.input === "date") values[input.id] = "2027-01-15";
        }
        const built = buildTruth(inputs, values);
        expect(built.missing, `${occasion}/${game.key}`).toEqual([]);
        expect(built.invalid, `${occasion}/${game.key}`).toEqual([]);
        if (game.kind !== "clues") {
          const checked = openGame(game.kind, game.config)!.parseTruth(built.truth);
          expect(checked.ok, `${occasion}/${game.key}: ${JSON.stringify(checked)}`).toBe(true);
        }
      }
    }
  });
});

describe("editing a game's text", () => {
  it("round-trips every starter game unchanged through the editor's save path", () => {
    for (const occasion of OCCASIONS) {
      for (const game of starterGames(occasion)) {
        const parsed = parseGame(game.kind, prepareConfig(game.kind, edit(game.config)));
        expect(parsed.ok, `${occasion}/${game.key}`).toBe(true);
        if (parsed.ok) expect(parsed.game.config).toEqual(game.config);
      }
    }
  });

  it("drops an emptied hint or intro instead of sending text the schema refuses", () => {
    const config = edit(cluesConfig);
    config.intro = { ar: "", en: " " };
    config.clues![0].hint = { ar: "", en: "" };
    const prepared = prepareConfig("clues", config);
    expect(prepared).not.toHaveProperty("intro");
    expect(prepared.clues![0]).not.toHaveProperty("hint");
    expect(parseGame("clues", prepared).ok).toBe(true);
    // Without the tidy-up the engine would refuse it.
    expect(parseGame("clues", config).ok).toBe(false);
  });

  it("new questions and cards fit their game once their text is filled in", () => {
    const text = { ar: "نص", en: "Text" };
    for (const [kind, base] of [["quiz", quizConfig], ["vote", pollConfig], ["vote", thisOrThatConfig], ["prediction", predictionConfig]] as const) {
      const config = edit(base);
      const item = newGameItem(kind);
      item.prompt = text;
      item.options = item.options!.map((option) => ({ ...option, label: text }));
      config.questions = [...config.questions!, item];
      expect(parseGame(kind, prepareConfig(kind, config)).ok, kind).toBe(true);
      // Left blank, the engine reports it and nothing is stored.
      const blank: EditConfig = { ...edit(base), questions: [...edit(base).questions!, newGameItem(kind)] };
      expect(parseGame(kind, prepareConfig(kind, blank)).ok, `${kind} blank`).toBe(false);
    }
    const clues = edit(cluesConfig);
    clues.clues = [...clues.clues!, { ...newGameItem("clues"), text }];
    expect(parseGame("clues", prepareConfig("clues", clues)).ok).toBe(true);
  });

  it("knows each module's limits", () => {
    expect(limitsFor("quiz", edit(quizConfig))).toMatchObject({ list: "questions", maxItems: 25, minOptions: 2, maxOptions: 6 });
    expect(limitsFor("vote", edit(pollConfig))).toMatchObject({ maxItems: 20, maxOptions: 8 });
    expect(limitsFor("vote", edit(thisOrThatConfig))).toMatchObject({ minOptions: 2, maxOptions: 2 });
    expect(limitsFor("clues", edit(cluesConfig))).toMatchObject({ list: "clues", maxItems: 20 });
  });

  it("reads titles defensively", () => {
    expect(gameTitle(quizConfig, "en", "Quiz game")).toBe("Quiz");
    expect(gameTitle({ title: { ar: "", en: "Only English" } }, "ar", "x")).toBe("Only English");
    expect(gameTitle(null, "en", "Fallback")).toBe("Fallback");
    expect(gameTitle({ title: "<script>" }, "en", "Fallback")).toBe("Fallback");
    expect(asEditConfig({ title: { ar: "", en: "" }, questions: "nope" })).toBeNull();
  });
});

describe("countdown helpers", () => {
  it("computes the lead to a time today and refuses anything under a minute", () => {
    const now = new Date(2026, 10, 15, 20, 0, 0);
    expect(leadUntil("20:05", now)).toBe(300);
    expect(leadUntil("20:01", now)).toBe(60);
    expect(leadUntil("20:00", now)).toBeNull();
    expect(leadUntil("19:00", now)).toBeNull();
    expect(leadUntil("soon", now)).toBeNull();
    expect(leadUntil("20:01", new Date(2026, 10, 15, 20, 0, 30))).toBeNull();
  });

  it("formats the time left", () => {
    expect(formatCountdown(61_000)).toBe("01:01");
    expect(formatCountdown(500)).toBe("00:01");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5000)).toBe("00:00");
    expect(formatCountdown(3_723_000)).toBe("1:02:03");
  });
});
