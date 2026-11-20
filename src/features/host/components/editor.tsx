"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/card";
import { choiceClass } from "@/components/ui/input";
import type { BlockType, EventContent, EventTheme } from "@/content/schema";
import type { Locale } from "@/i18n/config";
import type { Template } from "@/templates/types";
import { saveDraftAction } from "../actions/events";
import { withoutBlockDates } from "../lib/blocks";
import type { HostErrorCode } from "../lib/errors";
import { errorText, hostMessages } from "../messages";
import { BlocksPanel } from "./blocks-panel";
import { EditorMediaProvider, ImageField } from "./blocks/media";
import { LocalizedField } from "./editor-parts";

type Props = {
  lang: Locale;
  eventId: string;
  template: Template;
  initialContent: EventContent;
  initialTheme: EventTheme;
  timezone: string;
  // events.starts_at / ends_at: the event's date, set in Settings.
  startsAt: string | null;
  endsAt: string | null;
  settingsHref: string;
  allowed: BlockType[];
};

type Draft = { content: EventContent; theme: EventTheme };
type SaveStatus = "saved" | "dirty" | "saving" | "error";

const PREVIEW_DEBOUNCE_MS = 300;
const AUTOSAVE_DEBOUNCE_MS = 1500;

export function Editor({ lang, eventId, template, initialContent, initialTheme, timezone, startsAt, endsAt, settingsHref, allowed }: Props) {
  const t = hostMessages(lang);
  const [draft, setDraft] = useState<Draft>({ content: initialContent, theme: initialTheme });
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [failure, setFailure] = useState<HostErrorCode | null>(null);
  const [pane, setPane] = useState<"form" | "preview">("form");
  const [previewLocale, setPreviewLocale] = useState<Locale>(lang);

  const { id: templateId, version: templateVersion, kind } = template;

  const iframe = useRef<HTMLIFrameElement>(null);
  // The newest draft and its revision, readable from timers without waiting for a render.
  const latest = useRef<Draft & { revision: number; locale: Locale }>({
    content: initialContent,
    theme: initialTheme,
    revision: 0,
    locale: lang,
  });
  const saving = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function postDraft() {
    // The preview iframe is sandboxed without allow-same-origin, so its origin
    // is opaque ("null") and a message addressed to our own origin would never
    // be delivered: the target origin has to be "*". That is acceptable only
    // because (1) the message goes to this one window object, the iframe we
    // created from our own /preview route, (2) the payload is nothing but this
    // host's own draft, and (3) messages coming back are accepted only when
    // event.source is that same window (see the listener below).
    iframe.current?.contentWindow?.postMessage(
      {
        type: "lamma:draft",
        // The preview shows the event's own date, as the published page will.
        content: withoutBlockDates(latest.current.content),
        theme: latest.current.theme,
        locale: latest.current.locale,
        startsAt,
        endsAt,
        timezone,
        // Which template the preview should render; fixed for an event, taken from its row.
        templateId: template.id,
        templateVersion: template.version,
        kind: template.kind,
      },
      "*",
    );
  }

  async function save() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    // One save at a time; a change made meanwhile is picked up afterwards.
    if (saving.current) return;
    saving.current = true;
    setStatus("saving");
    const revision = latest.current.revision;
    let result: Awaited<ReturnType<typeof saveDraftAction>>;
    try {
      result = await saveDraftAction(eventId, latest.current.content, latest.current.theme);
    } catch {
      result = { ok: false, error: "unknown" };
    }
    saving.current = false;
    if (!result.ok) {
      setFailure(result.error);
      setStatus("error");
      return;
    }
    setFailure(null);
    if (latest.current.revision === revision) setStatus("saved");
    else {
      setStatus("dirty");
      saveTimer.current = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
    }
  }

  function change(next: Draft) {
    latest.current = { ...latest.current, ...next, revision: latest.current.revision + 1 };
    setDraft(next);
    setStatus("dirty");
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(postDraft, PREVIEW_DEBOUNCE_MS);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
  }

  const setContent = (content: EventContent) => change({ content, theme: latest.current.theme });
  const setTheme = (theme: EventTheme) => change({ content: latest.current.content, theme });

  function choosePreviewLocale(locale: Locale) {
    latest.current.locale = locale;
    setPreviewLocale(locale);
    postDraft();
  }

  // The preview announces when it is ready to receive the draft.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Only our own iframe may talk to the editor; its origin is opaque, so
      // the window identity is the check that matters.
      if (!iframe.current || event.source !== iframe.current.contentWindow) return;
      const data: unknown = event.data;
      if (typeof data === "object" && data !== null && (data as { type?: unknown }).type === "lamma:preview-ready") {
        iframe.current.contentWindow?.postMessage(
          {
            type: "lamma:draft",
            content: withoutBlockDates(latest.current.content),
            theme: latest.current.theme,
            locale: latest.current.locale,
            startsAt,
            endsAt,
            timezone,
            templateId,
            templateVersion,
            kind,
          },
          "*",
        );
      }
    }
    window.addEventListener("message", onMessage);
    // Sent again whenever the template identity changes; harmless before the
    // preview is listening, because it asks for the draft when it is ready.
    onMessage({ source: iframe.current?.contentWindow, data: { type: "lamma:preview-ready" } } as MessageEvent);
    return () => window.removeEventListener("message", onMessage);
  }, [templateId, templateVersion, kind, startsAt, endsAt, timezone]);

  // Leaving with unsaved work: ask the browser to confirm, and try a last save
  // when the editor is unmounted by in-app navigation.
  useEffect(() => {
    if (status === "saved") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  useEffect(() => {
    const pending = saveTimer;
    const newest = latest;
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      if (pending.current) {
        clearTimeout(pending.current);
        void saveDraftAction(eventId, newest.current.content, newest.current.theme);
      }
    };
  }, [eventId]);

  const { content, theme } = draft;
  const palette = theme.palette ?? template.palettes[0]?.id;
  const statusClass = status === "error" ? "text-danger font-medium" : status === "dirty" ? "text-fg" : "text-muted";

  return (
    <div className="flex flex-col gap-6">
      {/* Save state and the phone switch stay under the top bar while the form scrolls. */}
      <div className="sticky top-14 z-20 -mx-4 flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2 sm:-mx-6 sm:px-6">
        <p aria-live="polite" role="status" className={`flex items-center gap-2 text-sm transition-colors duration-150 ${statusClass}`}>
          {status === "saved" ? (
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 text-accent-ink" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
          {status === "error" && failure ? errorText(t, failure) : t.editor.status[status]}
        </p>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div role="group" aria-label={t.editor.title} className="grid flex-1 grid-cols-2 rounded-control border border-line bg-raised p-0.5 lg:hidden">
            {(["form", "preview"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={pane === p}
                onClick={() => setPane(p)}
                className={`min-h-10 rounded-[4px] px-4 text-sm font-medium transition-colors duration-150 ${
                  pane === p ? "bg-ink text-paper" : "text-muted hover:text-fg"
                }`}
              >
                {t.editor[p]}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" disabled={status === "saved" || status === "saving"} onClick={save}>
            {status === "saving" ? t.common.saving : t.editor.saveNow}
          </Button>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-14">
        <div className={`flex min-w-0 flex-col gap-10 ${pane === "form" ? "" : "hidden lg:flex"}`}>
          <section aria-labelledby="fields-heading">
            <SectionHeading id="fields-heading" title={t.editor.fieldsTitle} lead={t.editor.fieldsLead} />
            <div className="flex flex-col gap-6">
              {template.fields.map((field) => (
                <LocalizedField
                  key={field.key}
                  id={`field-${field.key}`}
                  // The free-text date line is only a display override; the date itself is in Settings.
                  label={field.key === "date_line" ? t.editor.dateLineLabel : field.label[lang]}
                  hint={field.key === "date_line" ? t.editor.dateLineHint : undefined}
                  value={content.fields[field.key] ?? { ar: "", en: "" }}
                  max={field.maxLength}
                  required={field.required}
                  placeholder={field.placeholder}
                  lang={lang}
                  onChange={(value) => setContent({ ...content, fields: { ...content.fields, [field.key]: value } })}
                />
              ))}
            </div>
          </section>

          <section className="border-t border-line pt-8">
            <fieldset>
              <legend className="text-lg font-semibold">{t.editor.paletteTitle}</legend>
              <p className="mb-4 mt-1 text-sm text-muted">{t.editor.paletteLead}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {template.palettes.map((p) => (
                  <label key={p.id} className={`${choiceClass} items-center`}>
                    <input
                      type="radio"
                      name="palette"
                      className="size-4 shrink-0 accent-fg"
                      checked={palette === p.id}
                      onChange={() => setTheme({ ...theme, palette: p.id })}
                    />
                    {/* Swatch colours come from the template registry, never from user input. */}
                    <span aria-hidden="true" className="flex overflow-hidden rounded-[4px] border border-line">
                      {[p.tokens.paper, p.tokens.accent, p.tokens.ink].map((color) => (
                        <span key={color} className="block h-7 w-4" style={{ background: color }} />
                      ))}
                    </span>
                    <span className="text-sm font-medium">{p.name[lang]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <EditorMediaProvider eventId={eventId} lang={lang}>
            <div className="border-t border-line pt-8">
              <BlocksPanel
                blocks={content.blocks}
                allowed={allowed}
                lang={lang}
                timezone={timezone}
                eventStart={startsAt}
                settingsHref={settingsHref}
                onChange={(blocks) => setContent({ ...content, blocks })}
              />
            </div>

            <section aria-labelledby="share-heading" className="border-t border-line pt-8">
              <SectionHeading id="share-heading" title={t.images.previewTitle} lead={t.images.previewLead} />
              <div className="flex flex-col gap-6">
                <LocalizedField
                  id="preview-title"
                  label={t.images.previewHeading}
                  value={content.preview.title}
                  max={80}
                  lang={lang}
                  onChange={(title) => setContent({ ...content, preview: { ...content.preview, title } })}
                />
                <LocalizedField
                  id="preview-description"
                  label={t.images.previewDescription}
                  value={content.preview.description}
                  max={160}
                  lang={lang}
                  multiline
                  onChange={(description) => setContent({ ...content, preview: { ...content.preview, description } })}
                />
                <ImageField
                  label={t.images.previewImage}
                  value={content.preview.image}
                  alt={t.images.previewImage}
                  onChange={(image) => setContent({ ...content, preview: { ...content.preview, image } })}
                />
              </div>
            </section>
          </EditorMediaProvider>
        </div>

        <aside
          aria-label={t.editor.previewTitle}
          className={`lg:sticky lg:top-[8.5rem] lg:self-start ${pane === "preview" ? "" : "hidden lg:block"}`}
        >
          <div className="mx-auto mb-3 flex max-w-[390px] items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted">{t.editor.previewTitle}</h2>
            <div role="group" aria-label={t.editor.previewLanguage} className="flex rounded-control border border-line bg-raised p-0.5">
              {(["ar", "en"] as const).map((locale) => (
                <button
                  key={locale}
                  type="button"
                  aria-pressed={previewLocale === locale}
                  onClick={() => choosePreviewLocale(locale)}
                  className={`min-h-9 rounded-[4px] px-3 text-sm font-medium transition-colors duration-150 ${
                    previewLocale === locale ? "bg-ink text-paper" : "text-muted hover:text-fg"
                  }`}
                >
                  {locale === "ar" ? t.common.arabic : t.common.english}
                </button>
              ))}
            </div>
          </div>
          {/* allow-scripts only: the preview runs with an opaque origin, so it
              cannot read the host's cookies or storage or call the app as the
              host, whatever the draft contains (security C1, rule 16). */}
          <iframe
            ref={iframe}
            title={t.editor.previewTitle}
            src="/preview"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="mx-auto block h-[calc(100dvh-14rem)] max-h-[800px] min-h-[520px] w-full max-w-[390px] rounded-[28px] border-[6px] border-ink bg-raised"
          />
        </aside>
      </div>
    </div>
  );
}
