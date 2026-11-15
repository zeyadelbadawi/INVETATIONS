"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { latinDigits } from "../../lib/text";
import { hostMessages } from "../../messages";
import { LocalizedField } from "../editor-parts";
import type { BlockFormProps } from "./types";

function parseCoordinate(raw: string, limit: number): number | null {
  const text = latinDigits(raw).trim().replace("٫", ".");
  if (text === "" || !/^-?\d{1,3}(\.\d{1,8})?$/.test(text)) return null;
  const value = Number(text);
  return Math.abs(value) <= limit ? value : null;
}

// The place is stored as numbers and a label; the server builds the map link
// (security rule 14), so there is no URL field here.
export function LocationForm({ block, onChange, lang }: BlockFormProps<"location">) {
  const t = hostMessages(lang).editor;
  const id = `b-${block.id}`;
  const [lat, setLat] = useState(block.lat === null ? "" : String(block.lat));
  const [lng, setLng] = useState(block.lng === null ? "" : String(block.lng));
  const latBad = lat.trim() !== "" && parseCoordinate(lat, 90) === null;
  const lngBad = lng.trim() !== "" && parseCoordinate(lng, 180) === null;
  return (
    <>
      <LocalizedField id={`${id}-label`} label={t.f.placeLabel} value={block.label} max={120} lang={lang} onChange={(label) => onChange({ ...block, label })} />
      <LocalizedField id={`${id}-address`} label={t.f.address} value={block.address} max={300} lang={lang} multiline onChange={(address) => onChange({ ...block, address })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.f.latitude} htmlFor={`${id}-lat`} error={latBad ? t.invalidNumber : null} badge={hostMessages(lang).common.optional}>
          <Input
            id={`${id}-lat`}
            dir="ltr"
            inputMode="decimal"
            value={lat}
            placeholder="30.0444"
            aria-invalid={latBad}
            onChange={(e) => {
              setLat(e.target.value);
              onChange({ ...block, lat: parseCoordinate(e.target.value, 90) });
            }}
          />
        </Field>
        <Field label={t.f.longitude} htmlFor={`${id}-lng`} error={lngBad ? t.invalidNumber : null} badge={hostMessages(lang).common.optional}>
          <Input
            id={`${id}-lng`}
            dir="ltr"
            inputMode="decimal"
            value={lng}
            placeholder="31.2357"
            aria-invalid={lngBad}
            onChange={(e) => {
              setLng(e.target.value);
              onChange({ ...block, lng: parseCoordinate(e.target.value, 180) });
            }}
          />
        </Field>
      </div>
      <p className="text-sm text-muted">{t.f.coordsHint}</p>
      <LocalizedField id={`${id}-parking`} label={t.f.parking} value={block.parking} max={300} lang={lang} multiline onChange={(parking) => onChange({ ...block, parking })} />
    </>
  );
}
