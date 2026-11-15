"use client";

import { hostMessages } from "../../messages";
import { ItemList, LocalizedField } from "../editor-parts";
import { EMPTY, type BlockFormProps } from "./types";

export function StoryForm({ block, onChange, lang }: BlockFormProps<"story">) {
  const t = hostMessages(lang).editor.f;
  const id = `b-${block.id}`;
  return (
    <>
      <LocalizedField id={`${id}-title`} label={t.sectionTitle} value={block.title} max={80} lang={lang} onChange={(title) => onChange({ ...block, title })} />
      <LocalizedField id={`${id}-body`} label={t.storyBody} value={block.body} max={1500} lang={lang} multiline onChange={(body) => onChange({ ...block, body })} />
    </>
  );
}

export function QuoteForm({ block, onChange, lang }: BlockFormProps<"quote">) {
  const t = hostMessages(lang).editor.f;
  const id = `b-${block.id}`;
  return (
    <>
      <LocalizedField id={`${id}-body`} label={t.quoteBody} value={block.body} max={500} lang={lang} multiline onChange={(body) => onChange({ ...block, body })} />
      <LocalizedField id={`${id}-source`} label={t.quoteSource} value={block.source} max={120} lang={lang} onChange={(source) => onChange({ ...block, source })} />
    </>
  );
}

export function FamiliesForm({ block, onChange, lang }: BlockFormProps<"families">) {
  const t = hostMessages(lang).editor.f;
  const id = `b-${block.id}`;
  return (
    <ItemList
      items={block.sides}
      max={4}
      lang={lang}
      addLabel={t.addSide}
      make={(itemId) => ({ id: itemId, title: EMPTY, names: EMPTY })}
      onChange={(sides) => onChange({ ...block, sides })}
      render={(side, update) => (
        <>
          <LocalizedField id={`${id}-${side.id}-title`} label={t.sideTitle} value={side.title} max={80} lang={lang} onChange={(title) => update({ ...side, title })} />
          <LocalizedField id={`${id}-${side.id}-names`} label={t.sideNames} value={side.names} max={300} lang={lang} multiline onChange={(names) => update({ ...side, names })} />
        </>
      )}
    />
  );
}

export function NotesForm({ block, onChange, lang }: BlockFormProps<"notes">) {
  const t = hostMessages(lang).editor.f;
  const id = `b-${block.id}`;
  return (
    <>
      <LocalizedField id={`${id}-title`} label={t.sectionTitle} value={block.title} max={80} lang={lang} onChange={(title) => onChange({ ...block, title })} />
      <ItemList
        items={block.items}
        max={12}
        lang={lang}
        make={(itemId) => ({ id: itemId, body: EMPTY })}
        onChange={(items) => onChange({ ...block, items })}
        render={(item, update) => (
          <LocalizedField id={`${id}-${item.id}-body`} label={t.noteBody} value={item.body} max={300} lang={lang} multiline onChange={(body) => update({ ...item, body })} />
        )}
      />
    </>
  );
}

export function FaqForm({ block, onChange, lang }: BlockFormProps<"faq">) {
  const t = hostMessages(lang).editor.f;
  const id = `b-${block.id}`;
  return (
    <ItemList
      items={block.items}
      max={20}
      lang={lang}
      make={(itemId) => ({ id: itemId, question: EMPTY, answer: EMPTY })}
      onChange={(items) => onChange({ ...block, items })}
      render={(item, update) => (
        <>
          <LocalizedField id={`${id}-${item.id}-q`} label={t.question} value={item.question} max={160} lang={lang} onChange={(question) => update({ ...item, question })} />
          <LocalizedField id={`${id}-${item.id}-a`} label={t.answer} value={item.answer} max={600} lang={lang} multiline onChange={(answer) => update({ ...item, answer })} />
        </>
      )}
    />
  );
}

export function CountdownForm({ lang }: BlockFormProps<"countdown">) {
  return <p className="text-sm text-muted">{hostMessages(lang).editor.f.countdownNote}</p>;
}

// Media upload is not built yet; the section can be kept so its place is held.
export function GalleryForm({ lang }: BlockFormProps<"gallery">) {
  const t = hostMessages(lang);
  return (
    <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
      <span className="font-medium text-fg">{t.common.comingSoon}. </span>
      {t.editor.f.gallerySoon}
    </p>
  );
}
