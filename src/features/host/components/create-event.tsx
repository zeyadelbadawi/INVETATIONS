"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { choiceClass, Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import type { EventKind } from "@/templates/types";
import { createEventAction } from "../actions/events";
import type { HostErrorCode } from "../lib/errors";
import { fmt } from "../lib/text";
import { errorText, hostMessages } from "../messages";

export type TemplateChoice = {
  id: string;
  kind: EventKind;
  name: string;
  description: string;
  // Swatch colours come from the template registry, not from user input.
  swatch: { paper: string; ink: string; accent: string };
};

const KINDS: EventKind[] = ["wedding", "gender_reveal", "corporate"];

// One numbered step of the form: the number sits in the margin, the question is the legend.
function Step({ n, total, lang, title, children }: { n: number; total: number; lang: Locale; title: string; children: React.ReactNode }) {
  const t = hostMessages(lang);
  const digit = String(n);
  return (
    <fieldset>
      <legend className="flex items-baseline gap-3 text-lg font-semibold text-fg sm:gap-4">
        <span aria-hidden="true" className="w-6 font-display text-xl font-bold text-accent-ink sm:w-10 sm:text-2xl">
          {digit}
        </span>
        <span>
          <span className="sr-only">{fmt(t.create.step, { n: digit, total })}: </span>
          {title}
        </span>
      </legend>
      <div className="mt-3 sm:ps-14">{children}</div>
    </fieldset>
  );
}

export function CreateEvent({ lang, templates }: { lang: Locale; templates: TemplateChoice[] }) {
  const t = hostMessages(lang);
  const [kind, setKind] = useState<EventKind | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<HostErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const options = templates.filter((tpl) => tpl.kind === kind);
  const ready = kind !== null && templateId !== null && name.trim().length > 0;
  // With one look for the occasion there is nothing to pick: that step is skipped.
  const pickLook = kind === null || options.length > 1;
  const total = pickLook ? 3 : 2;
  const why = kind === null ? t.create.needKind : templateId === null ? t.create.needTemplate : name.trim() === "" ? t.create.needName : null;

  function chooseKind(next: EventKind) {
    setKind(next);
    const first = templates.filter((tpl) => tpl.kind === next);
    // With a single template there is nothing to choose; select it.
    setTemplateId(first.length === 1 ? first[0].id : null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createEventAction({ kind, templateId, name, locale: lang });
      // On success the action redirects to the editor and never returns here.
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-10">
      <Step n={1} total={total} lang={lang} title={t.create.stepKind}>
        <div className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <label key={k} className={choiceClass}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => chooseKind(k)} className="mt-0.5 size-5 shrink-0 accent-fg" />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{t.kinds[k]}</span>
                <span className="text-sm text-muted">{t.kindHints[k]}</span>
              </span>
            </label>
          ))}
        </div>
      </Step>

      {kind && pickLook ? (
        <Step n={2} total={total} lang={lang} title={t.create.stepTemplate}>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((tpl) => (
              <label key={tpl.id} className={`${choiceClass} flex-col items-stretch gap-3`}>
                <span
                  aria-hidden="true"
                  className="flex h-28 items-center justify-center rounded-control text-xl font-semibold"
                  style={{ background: tpl.swatch.paper, color: tpl.swatch.ink }}
                >
                  <span className="border-b-2 pb-1" style={{ borderColor: tpl.swatch.accent }}>
                    {tpl.name}
                  </span>
                </span>
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="template"
                    value={tpl.id}
                    checked={templateId === tpl.id}
                    onChange={() => setTemplateId(tpl.id)}
                    className="mt-1 size-4 shrink-0 accent-fg"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold">{tpl.name}</span>
                    <span className="text-sm text-muted">{tpl.description}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Step>
      ) : null}

      {kind && templateId ? (
        <Step n={total} total={total} lang={lang} title={t.create.stepName}>
          <div className="max-w-md">
            <Field label={t.create.nameLabel} htmlFor="event-name" hint={t.create.nameHint}>
              <Input
                id="event-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                placeholder={t.create.namePlaceholder}
                aria-describedby="event-name-hint"
                autoComplete="off"
              />
            </Field>
          </div>
        </Step>
      ) : null}

      <div className="flex flex-col items-start gap-4 sm:ps-14">
        <div aria-live="polite" className="w-full max-w-xl">
          {error ? <Notice tone="danger">{errorText(t, error)}</Notice> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" disabled={!ready || pending} aria-busy={pending} aria-describedby={why ? "create-why" : undefined}>
            {pending ? t.create.creating : t.create.submit}
          </Button>
          {why ? (
            <p id="create-why" className="text-sm text-muted">
              {why}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
