"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormSection, Notice } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { updateSettingsAction } from "../actions/events";
import type { ActionResult } from "../lib/errors";
import { weakPasscode } from "../lib/text";
import { displayDateTime, TIMEZONES, zonedToIso } from "../lib/time";
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
  // Native date fields follow the browser's own locale (often mm/dd/yyyy); the
  // line under each one reads the value back in the host's language.
  const readout = (local: string) => (local === "" ? null : displayDateTime(zonedToIso(local, values.timezone), values.timezone, lang));
  const dateReadout = (id: string, local: string) => {
    const text = readout(local);
    return text ? (
      <p id={`${id}-readout`} aria-live="polite" className="text-sm font-medium text-fg">
        {text}
      </p>
    ) : null;
  };
  const endsBeforeStart = values.startsAt !== "" && values.endsAt !== "" && values.endsAt < values.startsAt;
  const passcodeShort = passcodeMode === "set" && weakPasscode(passcode);
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
    <form onSubmit={submit} className="flex w-full max-w-5xl flex-col gap-10">
      <FormSection id="settings-when" title={s.whenTitle}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={s.startsAt} htmlFor="starts-at" hint={s.startsHint}>
            <Input
              id="starts-at"
              type="datetime-local"
              lang={lang}
              dir="ltr"
              value={values.startsAt}
              aria-describedby="starts-at-readout starts-at-hint"
              onChange={(e) => set("startsAt", e.target.value)}
            />
            {dateReadout("starts-at", values.startsAt)}
          </Field>
          <Field label={s.endsAt} htmlFor="ends-at" error={endsBeforeStart ? s.endsBeforeStart : null}>
            <Input
              id="ends-at"
              type="datetime-local"
              lang={lang}
              dir="ltr"
              value={values.endsAt}
              min={values.startsAt || undefined}
              aria-invalid={endsBeforeStart}
              aria-describedby={endsBeforeStart ? "ends-at-readout ends-at-error" : "ends-at-readout"}
              onChange={(e) => set("endsAt", e.target.value)}
            />
            {dateReadout("ends-at", values.endsAt)}
          </Field>
          <Field label={s.timezone} htmlFor="timezone">
            <Select id="timezone" value={values.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {s.zones[zone]}
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
      </FormSection>

      <FormSection id="settings-guests" title={s.guestsTitle}>
        <div className="-my-3 flex flex-col divide-y divide-line">
          {TOGGLES.map((key) => (
            <Checkbox key={key} label={s[key]} hint={hints[key]} checked={values[key]} onChange={(e) => set(key, e.target.checked)} />
          ))}
        </div>
        <div className="mt-5 border-t border-line pt-5">
          <Field label={s.rsvpDeadline} htmlFor="rsvp-deadline" hint={s.rsvpDeadlineHint} badge={t.common.optional}>
            <Input
              id="rsvp-deadline"
              type="datetime-local"
              lang={lang}
              dir="ltr"
              value={values.rsvpDeadline}
              aria-describedby="rsvp-deadline-readout rsvp-deadline-hint"
              onChange={(e) => set("rsvpDeadline", e.target.value)}
            />
            {dateReadout("rsvp-deadline", values.rsvpDeadline)}
          </Field>
        </div>
      </FormSection>

      <FormSection id="settings-passcode" title={s.passcodeTitle} lead={s.passcodeLead}>
        <fieldset className="flex flex-col">
          <legend className="mb-1 text-sm font-medium">{hasPasscode ? s.passcodeOn : s.passcodeOff}</legend>
          {(hasPasscode ? (["keep", "set", "clear"] as const) : (["keep", "set"] as const)).map((mode) => (
            <label key={mode} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="passcode-mode"
                className="size-6 accent-fg"
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
      </FormSection>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:ps-[calc(15rem+2.5rem)] xl:ps-[calc(17rem+2.5rem)]">
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
