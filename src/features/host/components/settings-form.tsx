"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, Notice, SectionHeading } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { updateSettingsAction } from "../actions/events";
import type { ActionResult } from "../lib/errors";
import { TIMEZONES } from "../lib/time";
import { errorText, hostMessages } from "../messages";

export type SettingsValues = {
  startsAt: string;
  endsAt: string;
  timezone: string;
  defaultLocale: Locale;
  rosterVisible: boolean;
  sharingEnabled: boolean;
  openLinkApproval: boolean;
  photosHostOnly: boolean;
  lockTeams: boolean;
  rsvpDeadline: string;
};

type Props = { lang: Locale; eventId: string; initial: SettingsValues; hasPasscode: boolean };

const TOGGLES = ["rosterVisible", "sharingEnabled", "openLinkApproval", "photosHostOnly", "lockTeams"] as const;

export function SettingsForm({ lang, eventId, initial, hasPasscode }: Props) {
  const t = hostMessages(lang);
  const s = t.settings;
  const [values, setValues] = useState(initial);
  const [passcodeMode, setPasscodeMode] = useState<"keep" | "set" | "clear">("keep");
  const [passcode, setPasscode] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setResult(null);
  };
  const endsBeforeStart = values.startsAt !== "" && values.endsAt !== "" && values.endsAt < values.startsAt;
  const passcodeShort = passcodeMode === "set" && passcode.length < 6;
  const hints: Partial<Record<(typeof TOGGLES)[number], string>> = {
    rosterVisible: s.rosterVisibleHint,
    openLinkApproval: s.openLinkApprovalHint,
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (endsBeforeStart || passcodeShort) return;
    startTransition(async () => {
      const outcome = await updateSettingsAction(eventId, {
        ...values,
        passcode: passcodeMode === "set" ? { mode: "set", value: passcode } : { mode: passcodeMode },
      });
      setResult(outcome);
      if (outcome.ok) {
        setPasscode("");
        setPasscodeMode("keep");
      }
    });
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Card>
        <SectionHeading title={s.whenTitle} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={s.startsAt} htmlFor="starts-at">
            <Input id="starts-at" type="datetime-local" dir="ltr" value={values.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
          </Field>
          <Field label={s.endsAt} htmlFor="ends-at" error={endsBeforeStart ? s.endsBeforeStart : null}>
            <Input
              id="ends-at"
              type="datetime-local"
              dir="ltr"
              value={values.endsAt}
              min={values.startsAt || undefined}
              aria-invalid={endsBeforeStart}
              aria-describedby={endsBeforeStart ? "ends-at-error" : undefined}
              onChange={(e) => set("endsAt", e.target.value)}
            />
          </Field>
          <Field label={s.timezone} htmlFor="timezone">
            <Select id="timezone" dir="ltr" value={values.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={s.defaultLocale} htmlFor="default-locale">
            <Select id="default-locale" value={values.defaultLocale} onChange={(e) => set("defaultLocale", e.target.value as Locale)}>
              <option value="ar">{t.common.arabic}</option>
              <option value="en">{t.common.english}</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeading title={s.guestsTitle} />
        <div className="flex flex-col divide-y divide-line">
          {TOGGLES.map((key) => (
            <Checkbox key={key} label={s[key]} hint={hints[key]} checked={values[key]} onChange={(e) => set(key, e.target.checked)} />
          ))}
        </div>
        <div className="mt-4">
          <Field label={s.rsvpDeadline} htmlFor="rsvp-deadline" hint={s.rsvpDeadlineHint} badge={t.common.optional}>
            <Input
              id="rsvp-deadline"
              type="datetime-local"
              dir="ltr"
              value={values.rsvpDeadline}
              aria-describedby="rsvp-deadline-hint"
              onChange={(e) => set("rsvpDeadline", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeading title={s.passcodeTitle} lead={s.passcodeLead} />
        <fieldset className="flex flex-col">
          <legend className="mb-2 text-sm font-medium">{hasPasscode ? s.passcodeOn : s.passcodeOff}</legend>
          {(hasPasscode ? (["keep", "set", "clear"] as const) : (["keep", "set"] as const)).map((mode) => (
            <label key={mode} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="passcode-mode"
                className="size-5 accent-secondary"
                checked={passcodeMode === mode}
                onChange={() => setPasscodeMode(mode)}
              />
              <span>{mode === "keep" ? s.passcodeKeep : mode === "set" ? s.passcodeSet : s.passcodeClear}</span>
            </label>
          ))}
        </fieldset>
        {passcodeMode === "set" ? (
          <div className="mt-3">
            <Field label={s.passcodeLabel} htmlFor="passcode" hint={s.passcodeHint}>
              <Input
                id="passcode"
                type="text"
                dir="ltr"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                minLength={6}
                maxLength={64}
                value={passcode}
                aria-describedby="passcode-hint"
                onChange={(e) => setPasscode(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || endsBeforeStart || passcodeShort} aria-busy={pending}>
          {pending ? t.common.saving : t.common.save}
        </Button>
        <div aria-live="polite" className="min-w-0 flex-1">
          {result?.ok ? <Notice tone="success">{s.saved}</Notice> : null}
          {result && !result.ok ? <Notice tone="danger">{errorText(t, result.error, result.detail)}</Notice> : null}
        </div>
      </div>
    </form>
  );
}
