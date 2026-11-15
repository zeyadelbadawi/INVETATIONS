// Question banks are plain data in both languages. Items are templates: the host
// picks some, edits the wording or options, and (for quizzes) marks the correct
// answer — a bank never knows the truth.
import type { Localized } from "../types";

export type Occasion = "wedding" | "gender_reveal" | "corporate";

// Options are suggestions the host is expected to edit.
export type QuizTemplate = { id: string; prompt: Localized; options: Localized[] };
export type PollTemplate = { id: string; prompt: Localized; options: Localized[] };

// A prompt whose options come from the event: the two partners, or the award nominees.
export type PromptTemplate = { id: string; prompt: Localized };

export type PredictionTemplate = {
  id: string;
  prompt: Localized;
  answer:
    | { type: "choice"; options: Localized[] }
    | { type: "number"; min: number; max: number; unit: Localized; tolerance: number }
    | { type: "time"; format: "clock" | "date"; tolerance: number };
};

// `hostPrompt` is shown in the editor only: what the host should add to the card.
export type ClueTemplate = { id: string; text: Localized; hostPrompt?: Localized };

export type BankGroup<Item> = { title: Localized; intro?: Localized; items: Item[] };

export type WeddingBank = {
  quiz: BankGroup<QuizTemplate>;
  thisOrThat: BankGroup<PromptTemplate>;
  predictions: BankGroup<PredictionTemplate>;
  polls: BankGroup<PollTemplate>;
};

export type GenderRevealBank = {
  clues: BankGroup<ClueTemplate>;
  quiz: BankGroup<QuizTemplate>;
  predictions: BankGroup<PredictionTemplate>;
  namePolls: BankGroup<PollTemplate>;
};

export type CorporateBank = {
  polls: BankGroup<PollTemplate>;
  predictions: BankGroup<PredictionTemplate>;
  awards: BankGroup<PromptTemplate>;
  teasers: BankGroup<ClueTemplate>;
};

export type Banks = { wedding: WeddingBank; gender_reveal: GenderRevealBank; corporate: CorporateBank };

export const t = (ar: string, en: string): Localized => ({ ar, en });

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const arabicNumber = (n: number) => String(n).replace(/\d/g, (digit) => ARABIC_DIGITS[Number(digit)]);

// Numbered placeholders for the host to replace: "الاختيار ١" / "Option 1".
export const slots = (count: number, ar = "الاختيار", en = "Option"): Localized[] =>
  Array.from({ length: count }, (_, i) => t(`${ar} ${arabicNumber(i + 1)}`, `${en} ${i + 1}`));
