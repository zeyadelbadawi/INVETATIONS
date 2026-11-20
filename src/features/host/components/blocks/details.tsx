"use client";

import type { Route } from "next";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { displayDateTime, isoToZoned, zonedToIso } from "../../lib/time";
import { hostMessages } from "../../messages";
import { LocalizedField } from "../editor-parts";
import type { BlockFormProps } from "./types";

// The start is not typed here: it is the event's own date from Settings, so the
// invitation, countdown, calendar button and dashboard can never disagree.
export function DetailsForm({ block, onChange, lang, timezone, eventStart, settingsHref }: BlockFormProps<"details">) {
  const t = hostMessages(lang).editor.f;
  const zones = hostMessages(lang).settings.zones as Record<string, string>;
  const id = `b-${block.id}`;
  const start = displayDateTime(eventStart, timezone, lang);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <p id={`${id}-starts-label`} className="text-sm font-medium text-fg">
            {t.startsAt}
          </p>
          <div aria-labelledby={`${id}-starts-label`} className="flex min-h-11 flex-col justify-center gap-0.5 rounded-control border border-dashed border-line px-3 py-2">
            <p className={start ? "font-medium text-fg" : "text-muted"}>{start ?? t.dateNone}</p>
            <Link href={settingsHref as Route} className="self-start text-sm font-medium text-accent-ink underline underline-offset-4 hover:text-fg">
              {start ? t.dateChange : t.dateSet}
            </Link>
          </div>
        </div>
        <Field label={t.doorsAt} htmlFor={`${id}-doors`} hint={t.timeHint.replace("{tz}", zones[timezone] ?? timezone)}>
          <Input
            id={`${id}-doors`}
            type="datetime-local"
            dir="ltr"
            value={isoToZoned(block.doorsAt, timezone)}
            aria-describedby={`${id}-doors-hint`}
            onChange={(e) => onChange({ ...block, doorsAt: zonedToIso(e.target.value, timezone) })}
          />
        </Field>
      </div>
      <p className="text-sm text-muted">{t.dateFromSettings}</p>
      <LocalizedField id={`${id}-venue`} label={t.venue} value={block.venue} max={120} lang={lang} onChange={(venue) => onChange({ ...block, venue })} />
      <LocalizedField id={`${id}-city`} label={t.city} value={block.city} max={80} lang={lang} onChange={(city) => onChange({ ...block, city })} />
    </>
  );
}
