"use client";

import { useState } from "react";
import { saveGameTruth } from "@/features/control/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { pick } from "@/content/schema";
import type { Locale } from "@/i18n/config";
import type { GameKind } from "@/play/types";
import { buildTruth, type TruthInput } from "../../lib/play";
import { fmt } from "../../lib/text";
import { hostMessages } from "../../messages";
import type { ActMessage } from "./use-act";
import { issuesOf } from "./use-act";

type Props = {
  lang: Locale;
  eventId: string;
  gameId: string;
  kind: GameKind;
  inputs: TruthInput[];
  hasTruth: boolean;
  pending: boolean;
  act: <T>(action: () => Promise<T>, done?: (result: T) => ActMessage | null | void) => void;
};

// The correct answers, entered by the owner. They are sent to the server and
// kept there; this form never receives them back, so it always starts empty.
export function TruthForm({ lang, eventId, gameId, kind, inputs, hasTruth, pending, act }: Props) {
  const t = hostMessages(lang);
  const g = t.play.games;
  const [values, setValues] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<{ text: string; ids: string[] } | null>(null);
  const enterable = inputs.filter((input) => input.input !== "reveal");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const built = buildTruth(inputs, values);
    if (built.missing.length > 0) return setProblem({ text: g.truthMissing, ids: built.missing });
    if (built.invalid.length > 0) return setProblem({ text: g.truthInvalid, ids: built.invalid });
    setProblem(null);
    act(
      () => saveGameTruth(eventId, gameId, built.truth),
      (result) => {
        const issues = issuesOf(result);
        if (issues) return { tone: "danger", text: g.issues, issues };
        setValues({});
        return { tone: "success", text: g.truthSaved };
      },
    );
  }

  const lead = kind === "quiz" ? g.truthLeadQuiz : kind === "vote" ? g.truthLeadVote : g.truthLeadPrediction;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-control border border-line bg-surface p-3">
      <div>
        <h4 className="font-semibold">{g.truthTitle}</h4>
        <p className="text-sm text-muted">{lead}</p>
        {enterable.length > 0 ? <p className="mt-1 text-sm font-medium">{hasTruth ? g.truthStored : g.truthNone}</p> : null}
      </div>
      <ol className="flex flex-col gap-3">
        {inputs.map((input, index) => {
          const id = `truth-${gameId}-${input.id}`;
          const bad = problem?.ids.includes(input.id) ?? false;
          const set = (value: string) => setValues((current) => ({ ...current, [input.id]: value }));
          const value = values[input.id] ?? "";
          return (
            <li key={input.id} className="flex flex-col gap-1">
              <label htmlFor={id} className="text-sm font-medium">
                {index + 1}. {pick(input.prompt, lang)}
              </label>
              {input.input === "reveal" ? (
                <p id={id} className="text-sm text-muted">
                  {g.byReveal}
                </p>
              ) : input.input === "choice" ? (
                <Select id={id} value={value} aria-invalid={bad} onChange={(e) => set(e.target.value)}>
                  <option value="">{input.required ? g.choose : g.skip}</option>
                  {input.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {pick(option.label, lang)}
                    </option>
                  ))}
                </Select>
              ) : input.input === "number" ? (
                <>
                  <Input id={id} dir="ltr" inputMode="decimal" value={value} aria-invalid={bad} aria-describedby={`${id}-range`} onChange={(e) => set(e.target.value)} />
                  <p id={`${id}-range`} className="text-sm text-muted">
                    {fmt(g.range, { min: input.min, max: input.max })}
                  </p>
                </>
              ) : (
                <Input id={id} dir="ltr" type={input.input === "clock" ? "time" : "date"} value={value} aria-invalid={bad} onChange={(e) => set(e.target.value)} />
              )}
            </li>
          );
        })}
      </ol>
      <div aria-live="polite">{problem ? <p className="text-sm text-danger">{problem.text}</p> : null}</div>
      {enterable.length > 0 ? (
        <div>
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {g.saveTruth}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
