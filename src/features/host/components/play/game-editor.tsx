"use client";

import { useState } from "react";
import { upsertGame } from "@/features/control/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Localized } from "@/content/schema";
import type { Locale } from "@/i18n/config";
import type { GameKind } from "@/play/types";
import { limitsFor, newGameItem, newOption, prepareConfig, type EditConfig, type EditItem } from "../../lib/play";
import { fmt } from "../../lib/text";
import { isoToZoned, zonedToIso } from "../../lib/time";
import { hostMessages } from "../../messages";
import { IconButton, LocalizedField } from "../editor-parts";
import type { ActMessage } from "./use-act";
import { issuesOf } from "./use-act";

type Props = {
  lang: Locale;
  eventId: string;
  gameId: string;
  kind: GameKind;
  initial: EditConfig;
  timezone: string;
  pending: boolean;
  act: <T>(action: () => Promise<T>, done?: (result: T) => ActMessage | null | void) => void;
};

const EMPTY: Localized = { ar: "", en: "" };

// Edits the words of a game — title, questions, options, clue cards — for any
// of the game kinds. Scoring settings and ids are passed through untouched,
// and the server validates the result against the game's own schema.
export function GameEditor({ lang, eventId, gameId, kind, initial, timezone, pending, act }: Props) {
  const t = hostMessages(lang);
  const g = t.play.games;
  const [config, setConfig] = useState<EditConfig>(initial);
  const limits = limitsFor(kind, config);
  const items: EditItem[] = config[limits.list] ?? [];
  const isClues = limits.list === "clues";

  const setItems = (next: EditItem[]) => setConfig({ ...config, [limits.list]: next });
  const setItem = (id: string, next: EditItem) => setItems(items.map((item) => (item.id === id ? next : item)));

  function save(event: React.FormEvent) {
    event.preventDefault();
    act(
      () => upsertGame(eventId, { id: gameId, kind, config: prepareConfig(kind, config) }),
      (result) => {
        const issues = issuesOf(result);
        return issues ? { tone: "danger", text: g.issues, issues } : { tone: "success", text: g.gameSaved };
      },
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-control border border-line bg-surface p-3">
      <LocalizedField id={`g-${gameId}-title`} label={g.gameTitle} value={config.title} max={80} lang={lang} onChange={(title) => setConfig({ ...config, title })} />
      <ol className="flex flex-col gap-3">
        {items.map((item, index) => {
          const base = `g-${gameId}-${item.id}`;
          const heading = fmt(isClues ? g.clue : g.question, { n: index + 1 });
          const options = item.options;
          return (
            <li key={item.id} className="flex flex-col gap-3 rounded-control border border-line bg-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <h5 className="text-sm font-semibold text-muted">{heading}</h5>
                <IconButton
                  label={`${isClues ? t.common.remove : g.removeQuestion} — ${heading}`}
                  disabled={items.length <= 1}
                  onClick={() => setItems(items.filter((other) => other.id !== item.id))}
                >
                  ×
                </IconButton>
              </div>
              {isClues ? (
                <>
                  <LocalizedField id={`${base}-text`} label={g.clueText} value={item.text ?? EMPTY} max={300} lang={lang} multiline onChange={(text) => setItem(item.id, { ...item, text })} />
                  <LocalizedField id={`${base}-hint`} label={g.clueHint} value={item.hint ?? EMPTY} max={200} lang={lang} onChange={(hint) => setItem(item.id, { ...item, hint })} />
                  <Field label={g.clueRevealAt} htmlFor={`${base}-at`} hint={g.clueRevealHint} badge={t.common.optional}>
                    <Input
                      id={`${base}-at`}
                      type="datetime-local"
                      dir="ltr"
                      value={isoToZoned(item.revealAt ?? null, timezone)}
                      aria-describedby={`${base}-at-hint`}
                      onChange={(e) => setItem(item.id, { ...item, revealAt: zonedToIso(e.target.value, timezone) })}
                    />
                  </Field>
                </>
              ) : (
                <LocalizedField id={`${base}-prompt`} label={g.prompt} value={item.prompt ?? EMPTY} max={160} lang={lang} onChange={(prompt) => setItem(item.id, { ...item, prompt })} />
              )}
              {options ? (
                <ol className="flex flex-col gap-2 border-s-2 border-line ps-3">
                  {options.map((option, optionIndex) => {
                    const optionName = fmt(g.option, { n: optionIndex + 1 });
                    return (
                      <li key={option.id} className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <LocalizedField
                            id={`${base}-${option.id}`}
                            label={optionName}
                            value={option.label}
                            max={60}
                            lang={lang}
                            onChange={(label) =>
                              setItem(item.id, { ...item, options: options.map((other) => (other.id === option.id ? { ...other, label } : other)) })
                            }
                          />
                        </div>
                        <IconButton
                          label={`${g.removeOption} — ${heading}, ${optionName}`}
                          disabled={options.length <= limits.minOptions}
                          onClick={() => setItem(item.id, { ...item, options: options.filter((other) => other.id !== option.id) })}
                        >
                          ×
                        </IconButton>
                      </li>
                    );
                  })}
                  {options.length < limits.maxOptions ? (
                    <li>
                      <Button variant="secondary" size="sm" onClick={() => setItem(item.id, { ...item, options: [...options, newOption()] })}>
                        {g.addOption}
                        <span className="sr-only"> — {heading}</span>
                      </Button>
                    </li>
                  ) : null}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        {items.length < limits.maxItems ? (
          <Button variant="secondary" size="sm" onClick={() => setItems([...items, newGameItem(kind)])}>
            {isClues ? g.addClue : g.addQuestion}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={pending}>
          {g.saveGame}
        </Button>
      </div>
    </form>
  );
}
