"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { Localized } from "@/content/schema";
import type { Locale } from "@/i18n/config";
import { fmt, newItemId } from "../lib/text";
import { hostMessages } from "../messages";

type LocalizedFieldProps = {
  id: string;
  label: string;
  value: Localized;
  onChange: (value: Localized) => void;
  max: number;
  lang: Locale;
  multiline?: boolean;
  required?: boolean;
  placeholder?: Localized;
  hint?: string;
};

// One piece of text in both languages. The host's own language comes first;
// each input keeps its natural direction whatever the page direction is.
export function LocalizedField({ id, label, value, onChange, max, lang, multiline, required, placeholder, hint }: LocalizedFieldProps) {
  const t = hostMessages(lang).common;
  const order: Locale[] = lang === "ar" ? ["ar", "en"] : ["en", "ar"];
  const Control = multiline ? Textarea : Input;
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 flex items-baseline gap-2 text-[0.9375rem] font-semibold text-fg">
        <span>{label}</span>
        {required ? <span className="text-sm font-normal text-muted">({t.required})</span> : null}
        {!required && hint ? <span className="text-sm font-normal text-muted">({t.optional})</span> : null}
      </legend>
      {hint ? (
        <p id={`${id}-hint`} className="-mt-1 mb-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
        {order.map((locale) => (
          <div key={locale} className="flex flex-col gap-1">
            <label htmlFor={`${id}-${locale}`} className="text-sm text-muted">
              {locale === "ar" ? t.arabic : t.english}
            </label>
            <Control
              id={`${id}-${locale}`}
              lang={locale}
              dir={locale === "ar" ? "rtl" : "ltr"}
              value={value[locale]}
              maxLength={max}
              placeholder={placeholder?.[locale]}
              aria-describedby={hint ? `${id}-hint` : undefined}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                onChange({ ...value, [locale]: e.target.value })
              }
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-11 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-fg/[0.06] hover:text-fg disabled:pointer-events-none disabled:opacity-30 sm:size-9"
    >
      <span aria-hidden="true" className="flex">
        {children}
      </span>
    </button>
  );
}

export function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export const glyphs = { up: "M8 12.5v-9M4 7.5l4-4 4 4", down: "M8 3.5v9M4 8.5l4 4 4-4", remove: "M4 4l8 8M12 4l-8 8" } as const;

export function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

type ItemListProps<T extends { id: string }> = {
  items: T[];
  onChange: (items: T[]) => void;
  max: number;
  make: (id: string) => T;
  render: (item: T, update: (item: T) => void, index: number) => ReactNode;
  lang: Locale;
  addLabel?: string;
};

// Repeating rows (programme items, questions, families…) with add, remove and
// up/down buttons — no dragging, so it works with a keyboard and on a phone.
export function ItemList<T extends { id: string }>({ items, onChange, max, make, render, lang, addLabel }: ItemListProps<T>) {
  const t = hostMessages(lang);
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={item.id} className="rounded-control border border-line bg-surface/60 p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted tabular-nums">{fmt(t.editor.item, { n: index + 1 })}</span>
              <div className="flex gap-0.5">
                <IconButton
                  label={`${t.common.moveUp} — ${fmt(t.editor.item, { n: index + 1 })}`}
                  disabled={index === 0}
                  onClick={() => onChange(move(items, index, -1))}
                >
                  <Glyph d="M8 12.5v-9M4 7.5l4-4 4 4" />
                </IconButton>
                <IconButton
                  label={`${t.common.moveDown} — ${fmt(t.editor.item, { n: index + 1 })}`}
                  disabled={index === items.length - 1}
                  onClick={() => onChange(move(items, index, 1))}
                >
                  <Glyph d="M8 3.5v9M4 8.5l4 4 4-4" />
                </IconButton>
                <IconButton
                  label={`${t.editor.removeItem} — ${fmt(t.editor.item, { n: index + 1 })}`}
                  onClick={() => onChange(items.filter((other) => other.id !== item.id))}
                >
                  <Glyph d="M4 4l8 8M12 4l-8 8" />
                </IconButton>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {render(item, (next) => onChange(items.map((other) => (other.id === item.id ? next : other))), index)}
            </div>
          </li>
        ))}
      </ol>
      {items.length < max ? (
        <div>
          <Button variant="secondary" size="sm" onClick={() => onChange([...items, make(newItemId())])}>
            {addLabel ?? t.editor.addItem}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
