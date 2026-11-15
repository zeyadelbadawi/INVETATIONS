"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt } from "../../lib/text";
import { isoToZoned, zonedToIso } from "../../lib/time";
import { hostMessages } from "../../messages";
import { LocalizedField } from "../editor-parts";
import type { BlockFormProps } from "./types";

export function DetailsForm({ block, onChange, lang, timezone }: BlockFormProps<"details">) {
  const t = hostMessages(lang).editor.f;
  const id = `b-${block.id}`;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.startsAt} htmlFor={`${id}-starts`}>
          <Input
            id={`${id}-starts`}
            type="datetime-local"
            dir="ltr"
            value={isoToZoned(block.startsAt, timezone)}
            onChange={(e) => onChange({ ...block, startsAt: zonedToIso(e.target.value, timezone) })}
          />
        </Field>
        <Field label={t.doorsAt} htmlFor={`${id}-doors`}>
          <Input
            id={`${id}-doors`}
            type="datetime-local"
            dir="ltr"
            value={isoToZoned(block.doorsAt, timezone)}
            onChange={(e) => onChange({ ...block, doorsAt: zonedToIso(e.target.value, timezone) })}
          />
        </Field>
      </div>
      <p className="text-sm text-muted">{fmt(t.timeHint, { tz: timezone })}</p>
      <LocalizedField id={`${id}-venue`} label={t.venue} value={block.venue} max={120} lang={lang} onChange={(venue) => onChange({ ...block, venue })} />
      <LocalizedField id={`${id}-city`} label={t.city} value={block.city} max={80} lang={lang} onChange={(city) => onChange({ ...block, city })} />
    </>
  );
}
