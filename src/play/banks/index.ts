import type { Game } from "../registry";
import { corporateBank } from "./corporate";
import { genderRevealBank } from "./gender-reveal";
import { awardsFromBank, cluesFromBank, pollFromBank, predictionFromBank, quizFromBank, thisOrThatFromBank } from "./instantiate";
import type { Banks, Occasion } from "./types";
import { weddingBank } from "./wedding";

export * from "./instantiate";
export * from "./types";

const banks: Banks = { wedding: weddingBank, gender_reveal: genderRevealBank, corporate: corporateBank };

export const OCCASIONS = Object.keys(banks) as Occasion[];

export function getBank<K extends Occasion>(occasion: K): Banks[K] {
  return banks[occasion];
}

export type StarterGame = Game & { key: string };

// A ready first set of games for a new event, short enough to play in a few minutes each.
export function starterGames(occasion: Occasion): StarterGame[] {
  switch (occasion) {
    case "wedding":
      return [
        { key: "quiz", kind: "quiz", config: quizFromBank(weddingBank.quiz, { limit: 10 }) },
        { key: "this_or_that", kind: "vote", config: thisOrThatFromBank(weddingBank.thisOrThat, { limit: 10 }) },
        { key: "predictions", kind: "prediction", config: predictionFromBank(weddingBank.predictions, { limit: 6 }) },
        { key: "polls", kind: "vote", config: pollFromBank(weddingBank.polls, { limit: 5 }) },
      ];
    case "gender_reveal":
      return [
        { key: "clues", kind: "clues", config: cluesFromBank(genderRevealBank.clues, { limit: 8 }) },
        { key: "quiz", kind: "quiz", config: quizFromBank(genderRevealBank.quiz, { limit: 8 }) },
        { key: "predictions", kind: "prediction", config: predictionFromBank(genderRevealBank.predictions, { limit: 6 }) },
        { key: "name_polls", kind: "vote", config: pollFromBank(genderRevealBank.namePolls, { limit: 4 }) },
      ];
    case "corporate":
      return [
        { key: "polls", kind: "vote", config: pollFromBank(corporateBank.polls, { limit: 5 }) },
        { key: "predictions", kind: "prediction", config: predictionFromBank(corporateBank.predictions, { limit: 5 }) },
        { key: "awards", kind: "vote", config: awardsFromBank(corporateBank.awards, { limit: 5 }) },
        { key: "teasers", kind: "clues", config: cluesFromBank(corporateBank.teasers, { limit: 6 }) },
      ];
  }
}
