import type { Localized } from "@/content/schema";
import type { GameKind } from "@/play/types";
import { latinDigits, newItemId } from "./text";

// Pure helpers behind the host's game controls: what the "correct answers" form
// asks for each kind of game, how its values become the truth payload the play
// engine validates, and how an edited config is tidied before saving.

export type EditOption = { id: string; label: Localized };
export type EditItem = {
  id: string;
  prompt?: Localized;
  text?: Localized;
  hint?: Localized;
  revealAt?: string | null;
  options?: EditOption[];
  type?: "choice" | "number" | "time";
  format?: "clock" | "date";
  min?: number;
  max?: number;
  truthFromReveal?: boolean;
  [key: string]: unknown;
};
// A stored game config, loosely typed: the editor changes text and list
// membership only and passes every other key through untouched. The server
// validates the result with the module's strict schema.
export type EditConfig = {
  title: Localized;
  intro?: Localized;
  mode?: "poll" | "this_or_that" | "award";
  questions?: EditItem[];
  clues?: EditItem[];
  [key: string]: unknown;
};

const EMPTY: Localized = { ar: "", en: "" };
const isLocalized = (value: unknown): value is Localized =>
  typeof value === "object" && value !== null && typeof (value as Localized).ar === "string" && typeof (value as Localized).en === "string";

export function asEditConfig(raw: unknown): EditConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const config = raw as EditConfig;
  if (!isLocalized(config.title)) return null;
  if (config.questions !== undefined && !Array.isArray(config.questions)) return null;
  if (config.clues !== undefined && !Array.isArray(config.clues)) return null;
  return config;
}

export function gameTitle(raw: unknown, locale: "ar" | "en", fallback: string): string {
  const config = asEditConfig(raw);
  if (!config) return fallback;
  return config.title[locale] || config.title[locale === "ar" ? "en" : "ar"] || fallback;
}

// Limits of each module's schema (src/play/modules/*.ts), so the editor can
// stop at them instead of sending something the server will refuse.
export function limitsFor(kind: GameKind, config: EditConfig) {
  switch (kind) {
    case "quiz":
      return { list: "questions" as const, maxItems: 25, minOptions: 2, maxOptions: 6 };
    case "vote":
      return config.mode === "this_or_that"
        ? { list: "questions" as const, maxItems: 20, minOptions: 2, maxOptions: 2 }
        : { list: "questions" as const, maxItems: 20, minOptions: 2, maxOptions: 8 };
    case "prediction":
      return { list: "questions" as const, maxItems: 20, minOptions: 2, maxOptions: 8 };
    case "clues":
      return { list: "clues" as const, maxItems: 20, minOptions: 0, maxOptions: 0 };
  }
}

export function newOption(): EditOption {
  return { id: `o${newItemId()}`, label: EMPTY };
}

export function newGameItem(kind: GameKind): EditItem {
  const id = `q${newItemId()}`;
  if (kind === "clues") return { id, text: EMPTY, revealAt: null };
  const options = [newOption(), newOption()];
  return kind === "prediction" ? { id, prompt: EMPTY, type: "choice", options, truthFromReveal: false } : { id, prompt: EMPTY, options };
}

const blank = (value: Localized | undefined) => !value || (value.ar.trim() === "" && value.en.trim() === "");

// Optional text that was left empty is removed: the schemas accept a missing
// intro or hint, but not an empty one.
export function prepareConfig(kind: GameKind, config: EditConfig): EditConfig {
  const next: EditConfig = { ...config };
  if (blank(next.intro)) delete next.intro;
  if (kind === "clues" && next.clues) {
    next.clues = next.clues.map((clue) => {
      const copy = { ...clue };
      if (blank(copy.hint)) delete copy.hint;
      return copy;
    });
  }
  return next;
}

export type TruthInput =
  | { id: string; prompt: Localized; input: "choice"; options: EditOption[]; required: boolean }
  | { id: string; prompt: Localized; input: "number"; min: number; max: number; required: true }
  | { id: string; prompt: Localized; input: "clock" | "date"; required: true }
  // Decided by the gender reveal; the host can never enter it (security R1).
  | { id: string; prompt: Localized; input: "reveal" };

// What the host is asked for. Empty for games that have no correct answers.
export function truthInputs(kind: GameKind, config: EditConfig): TruthInput[] {
  const questions = config.questions ?? [];
  if (kind === "quiz") {
    return questions.map((q) => ({ id: q.id, prompt: q.prompt ?? EMPTY, input: "choice", options: q.options ?? [], required: true }));
  }
  if (kind === "vote") {
    if (config.mode !== "this_or_that") return [];
    return questions.map((q) => ({ id: q.id, prompt: q.prompt ?? EMPTY, input: "choice", options: q.options ?? [], required: false }));
  }
  if (kind === "prediction") {
    return questions.map((q): TruthInput => {
      const prompt = q.prompt ?? EMPTY;
      if (q.type === "number") return { id: q.id, prompt, input: "number", min: q.min ?? 0, max: q.max ?? 0, required: true };
      if (q.type === "time") return { id: q.id, prompt, input: q.format === "date" ? "date" : "clock", required: true };
      if (q.truthFromReveal) return { id: q.id, prompt, input: "reveal" };
      return { id: q.id, prompt, input: "choice", options: q.options ?? [], required: true };
    });
  }
  return [];
}

export type BuiltTruth = { truth: { answers: Record<string, string | number> }; missing: string[]; invalid: string[] };

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Form values (strings keyed by question id) -> the truth payload. `missing`
// and `invalid` list the question ids that still stop it from being saved.
export function buildTruth(inputs: TruthInput[], values: Record<string, string>): BuiltTruth {
  const answers: Record<string, string | number> = {};
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const input of inputs) {
    if (input.input === "reveal") continue;
    const raw = (values[input.id] ?? "").trim();
    if (raw === "") {
      if (input.required) missing.push(input.id);
      continue;
    }
    if (input.input === "choice") {
      if (input.options.some((o) => o.id === raw)) answers[input.id] = raw;
      else invalid.push(input.id);
    } else if (input.input === "number") {
      const text = latinDigits(raw).replace("٫", ".");
      const value = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
      if (Number.isFinite(value) && value >= input.min && value <= input.max) answers[input.id] = value;
      else invalid.push(input.id);
    } else if ((input.input === "clock" ? CLOCK : DATE).test(raw)) answers[input.id] = raw;
    else invalid.push(input.id);
  }
  return { truth: { answers }, missing, invalid };
}

// Seconds from `now` until HH:MM today on the device's clock; null when that is
// less than the minimum lead or already past.
export function leadUntil(time: string, now: Date, minSeconds = 60): number | null {
  const match = CLOCK.exec(time);
  if (!match) return null;
  const [hours, minutes] = time.split(":").map(Number);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  const seconds = Math.floor((target.getTime() - now.getTime()) / 1000);
  return seconds >= minSeconds ? seconds : null;
}

export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
