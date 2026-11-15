"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

const choiceClass =
  "flex min-h-16 cursor-pointer flex-col justify-center gap-1 rounded-2xl border border-line bg-raised p-4 " +
  "has-[:checked]:border-secondary has-[:checked]:ring-2 has-[:checked]:ring-secondary/30 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-secondary";

export function CreateEvent({ lang, templates }: { lang: Locale; templates: TemplateChoice[] }) {
  const t = hostMessages(lang);
  const [kind, setKind] = useState<EventKind | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<HostErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const options = templates.filter((tpl) => tpl.kind === kind);
  const ready = kind !== null && templateId !== null && name.trim().length > 0;

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
    <form onSubmit={submit} className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-3 text-lg font-semibold">
          <span className="block text-sm font-normal text-muted">{fmt(t.create.step, { n: lang === "ar" ? "١" : 1 })}</span>
          {t.create.stepKind}
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {KINDS.map((k) => (
            <label key={k} className={choiceClass}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => chooseKind(k)} className="sr-only" />
              <span className="font-semibold">{t.kinds[k]}</span>
              <span className="text-sm text-muted">{t.kindHints[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind ? (
        <fieldset>
          <legend className="mb-3 text-lg font-semibold">
            <span className="block text-sm font-normal text-muted">{fmt(t.create.step, { n: lang === "ar" ? "٢" : 2 })}</span>
            {t.create.stepTemplate}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((tpl) => (
              <label key={tpl.id} className={choiceClass}>
                <input
                  type="radio"
                  name="template"
                  value={tpl.id}
                  checked={templateId === tpl.id}
                  onChange={() => setTemplateId(tpl.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className="mb-2 flex h-20 items-center justify-center rounded-xl border border-line text-lg font-semibold"
                  style={{ background: tpl.swatch.paper, color: tpl.swatch.ink }}
                >
                  <span className="border-b-2 pb-1" style={{ borderColor: tpl.swatch.accent }}>
                    {tpl.name}
                  </span>
                </span>
                <span className="font-semibold">{tpl.name}</span>
                <span className="text-sm text-muted">{tpl.description}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {kind && templateId ? (
        <Card>
          <p className="text-sm text-muted">{fmt(t.create.step, { n: lang === "ar" ? "٣" : 3 })}</p>
          <h2 className="mb-3 text-lg font-semibold">{t.create.stepName}</h2>
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
        </Card>
      ) : null}

      <div aria-live="polite">{error ? <Notice tone="danger">{errorText(t, error)}</Notice> : null}</div>

      <div>
        <Button type="submit" disabled={!ready || pending} aria-busy={pending}>
          {pending ? t.create.creating : t.create.submit}
        </Button>
      </div>
    </form>
  );
}
