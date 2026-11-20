"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, normalisePhone } from "../../lib/text";
import { hostMessages } from "../../messages";
import { IconButton, ItemList, LocalizedField } from "../editor-parts";
import { ImageField } from "./media";
import { EMPTY, type BlockFormProps } from "./types";

export function PeopleForm({ block, onChange, lang }: BlockFormProps<"people">) {
  const t = hostMessages(lang).editor;
  const images = hostMessages(lang).images;
  const id = `b-${block.id}`;
  return (
    <>
      <LocalizedField id={`${id}-title`} label={t.f.sectionTitle} value={block.title} max={80} lang={lang} onChange={(title) => onChange({ ...block, title })} />
      <ItemList
        items={block.items}
        max={24}
        lang={lang}
        make={(itemId) => ({ id: itemId, name: EMPTY, role: EMPTY, photo: null })}
        onChange={(items) => onChange({ ...block, items })}
        render={(item, update) => (
          <>
            <LocalizedField id={`${id}-${item.id}-name`} label={t.f.personName} value={item.name} max={80} lang={lang} onChange={(name) => update({ ...item, name })} />
            <LocalizedField id={`${id}-${item.id}-role`} label={t.f.personRole} value={item.role} max={120} lang={lang} onChange={(role) => update({ ...item, role })} />
            <ImageField
              label={images.personPhoto}
              value={item.photo}
              alt={fmt(images.personPhotoAlt, { name: item.name[lang] || item.name.ar || item.name.en })}
              onChange={(photo) => update({ ...item, photo })}
            />
          </>
        )}
      />
    </>
  );
}

// Same rule as the content schema: web, phone and mail links only.
function validLink(value: string): boolean {
  if (value.length > 300) return false;
  try {
    return ["https:", "tel:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function ContactForm({ block, onChange, lang }: BlockFormProps<"contact">) {
  const t = hostMessages(lang).editor;
  const id = `b-${block.id}`;
  // What is typed stays on screen; only a valid value reaches the draft.
  const [phone, setPhone] = useState(block.phone ?? "");
  const [link, setLink] = useState(block.link ?? "");
  const phoneBad = phone.trim() !== "" && normalisePhone(phone) === null;
  const linkBad = link.trim() !== "" && !validLink(link.trim());
  return (
    <>
      <LocalizedField id={`${id}-name`} label={t.f.contactName} value={block.name} max={80} lang={lang} onChange={(name) => onChange({ ...block, name })} />
      <Field label={t.f.phone} htmlFor={`${id}-phone`} error={phoneBad ? t.invalidPhone : null}>
        <Input
          id={`${id}-phone`}
          type="tel"
          dir="ltr"
          inputMode="tel"
          value={phone}
          maxLength={24}
          aria-invalid={phoneBad}
          aria-describedby={phoneBad ? `${id}-phone-error` : undefined}
          onChange={(e) => {
            setPhone(e.target.value);
            onChange({ ...block, phone: normalisePhone(e.target.value) });
          }}
        />
      </Field>
      <Field label={t.f.link} htmlFor={`${id}-link`} error={linkBad ? t.invalidLink : null}>
        <Input
          id={`${id}-link`}
          type="url"
          dir="ltr"
          inputMode="url"
          value={link}
          maxLength={300}
          placeholder="https://"
          aria-invalid={linkBad}
          aria-describedby={linkBad ? `${id}-link-error` : undefined}
          onChange={(e) => {
            setLink(e.target.value);
            const value = e.target.value.trim();
            onChange({ ...block, link: value !== "" && validLink(value) ? value : null });
          }}
        />
      </Field>
    </>
  );
}

export function DressCodeForm({ block, onChange, lang }: BlockFormProps<"dress_code">) {
  const t = hostMessages(lang);
  const id = `b-${block.id}`;
  return (
    <>
      <LocalizedField id={`${id}-note`} label={t.editor.f.dressNote} value={block.note} max={300} lang={lang} multiline onChange={(note) => onChange({ ...block, note })} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t.editor.f.colors}</legend>
        <ul className="flex flex-wrap items-center gap-3">
          {block.colors.map((color, index) => (
            // Colours can repeat and reorder only by removal, so position is a stable key here.
            <li key={index} className="flex items-center gap-1">
              <input
                type="color"
                aria-label={fmt(t.editor.f.color, { n: index + 1 })}
                value={color.toLowerCase()}
                onChange={(e) => onChange({ ...block, colors: block.colors.map((c, i) => (i === index ? e.target.value : c)) })}
                className="size-11 cursor-pointer rounded-control border border-line bg-raised p-1"
              />
              <IconButton
                label={`${t.common.remove} — ${fmt(t.editor.f.color, { n: index + 1 })}`}
                onClick={() => onChange({ ...block, colors: block.colors.filter((_, i) => i !== index) })}
              >
                ×
              </IconButton>
            </li>
          ))}
          {block.colors.length < 6 ? (
            <li>
              <Button variant="secondary" size="sm" onClick={() => onChange({ ...block, colors: [...block.colors, "#1f8a7a"] })}>
                {t.editor.f.addColor}
              </Button>
            </li>
          ) : null}
        </ul>
      </fieldset>
    </>
  );
}
