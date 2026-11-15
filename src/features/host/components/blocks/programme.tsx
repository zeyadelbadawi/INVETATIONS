"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { hostMessages } from "../../messages";
import { ItemList, LocalizedField } from "../editor-parts";
import { EMPTY, type BlockFormProps } from "./types";

export function ProgrammeForm({ block, onChange, lang }: BlockFormProps<"programme">) {
  const t = hostMessages(lang).editor.f;
  const id = `b-${block.id}`;
  return (
    <>
      <LocalizedField id={`${id}-title`} label={t.sectionTitle} value={block.title} max={80} lang={lang} onChange={(title) => onChange({ ...block, title })} />
      <ItemList
        items={block.items}
        max={40}
        lang={lang}
        make={(itemId) => ({ id: itemId, time: "", title: EMPTY, note: EMPTY })}
        onChange={(items) => onChange({ ...block, items })}
        render={(item, update) => (
          <>
            <Field label={t.time} htmlFor={`${id}-${item.id}-time`}>
              <Input
                id={`${id}-${item.id}-time`}
                value={item.time}
                maxLength={20}
                placeholder="19:30"
                onChange={(e) => update({ ...item, time: e.target.value })}
              />
            </Field>
            <LocalizedField id={`${id}-${item.id}-title`} label={t.itemTitle} value={item.title} max={120} lang={lang} onChange={(title) => update({ ...item, title })} />
            <LocalizedField id={`${id}-${item.id}-note`} label={t.itemNote} value={item.note} max={200} lang={lang} onChange={(note) => update({ ...item, note })} />
          </>
        )}
      />
    </>
  );
}
