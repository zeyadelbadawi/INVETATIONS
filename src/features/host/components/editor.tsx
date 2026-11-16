"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionHeading } from "@/components/ui/card";
import type { BlockType, EventContent, EventTheme } from "@/content/schema";
import type { Locale } from "@/i18n/config";
import type { Template } from "@/templates/types";
import { saveDraftAction } from "../actions/events";
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
  allowed: BlockType[];
};

type Draft = { content: EventContent; theme: EventTheme };
type SaveStatus = "saved" | "dirty" | "saving" | "error";

const PREVIEW_DEBOUNCE_MS = 300;
const AUTOSAVE_DEBOUNCE_MS = 1500;

export function Editor({ lang, eventId, template, initialContent, initialTheme, timezone, allowed }: Props) {
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
        content: latest.current.content,
        theme: latest.current.theme,
        locale: latest.current.locale,
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
            content: latest.current.content,
            theme: latest.current.theme,
            locale: latest.current.locale,
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
  }, [templateId, templateVersion, kind]);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-[61px] z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur">
        <p aria-live="polite" role="status" className={`text-sm ${status === "error" ? "text-danger" : "text-muted"}`}>
          {status === "error" && failure ? errorText(t, failure) : t.editor.status[status]}
        </p>
        <div className="flex items-center gap-2">
          <div role="group" aria-label={t.editor.title} className="flex rounded-xl border border-line bg-raised p-0.5 lg:hidden">
            {(["form", "preview"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={pane === p}
                onClick={() => setPane(p)}
                className={`min-h-10 rounded-lg px-3 text-sm font-medium ${pane === p ? "bg-fg text-raised" : "text-muted"}`}
              >
                {t.editor[p]}
              </button>
            ))}
          </div>
          <Button size="sm" disabled={status === "saved" || status === "saving"} onClick={save}>
            {status === "saving" ? t.common.saving : t.editor.saveNow}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className={`flex flex-col gap-6 ${pane === "form" ? "" : "hidden lg:flex"}`}>
          <Card>
            <SectionHeading title={t.editor.fieldsTitle} lead={t.editor.fieldsLead} />
            <div className="flex flex-col gap-4">
              {template.fields.map((field) => (
                <LocalizedField
                  key={field.key}
                  id={`field-${field.key}`}
                  label={field.label[lang]}
                  value={content.fields[field.key] ?? { ar: "", en: "" }}
                  max={field.maxLength}
                  required={field.required}
                  placeholder={field.placeholder}
                  lang={lang}
                  onChange={(value) => setContent({ ...content, fields: { ...content.fields, [field.key]: value } })}
                />
              ))}
            </div>
          </Card>

          <Card>
            <fieldset>
              <legend className="text-lg font-semibold">{t.editor.paletteTitle}</legend>
              <p className="mb-4 mt-1 text-sm text-muted">{t.editor.paletteLead}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {template.palettes.map((p) => (
                  <label
                    key={p.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line p-3 has-[:checked]:border-secondary has-[:checked]:ring-2 has-[:checked]:ring-secondary/30 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-secondary"
                  >
                    <input
                      type="radio"
                      name="palette"
                      className="sr-only"
                      checked={palette === p.id}
                      onChange={() => setTheme({ ...theme, palette: p.id })}
                    />
                    {/* Swatch colours come from the template registry, never from user input. */}
                    <span aria-hidden="true" className="flex overflow-hidden rounded-lg border border-line">
                      {[p.tokens.paper, p.tokens.accent, p.tokens.ink].map((color) => (
                        <span key={color} className="block h-8 w-5" style={{ background: color }} />
                      ))}
                    </span>
                    <span className="text-sm font-medium">{p.name[lang]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>

          <EditorMediaProvider eventId={eventId} lang={lang}>
            <BlocksPanel
              blocks={content.blocks}
              allowed={allowed}
              lang={lang}
              timezone={timezone}
              onChange={(blocks) => setContent({ ...content, blocks })}
            />

            <Card>
              <SectionHeading title={t.images.previewTitle} lead={t.images.previewLead} />
              <div className="flex flex-col gap-4">
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
            </Card>
          </EditorMediaProvider>
        </div>

        <aside
          aria-label={t.editor.previewTitle}
          className={`lg:sticky lg:top-32 lg:self-start ${pane === "preview" ? "" : "hidden lg:block"}`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted">{t.editor.previewTitle}</h2>
            <div role="group" aria-label={t.editor.previewLanguage} className="flex rounded-xl border border-line bg-raised p-0.5">
              {(["ar", "en"] as const).map((locale) => (
                <button
                  key={locale}
                  type="button"
                  aria-pressed={previewLocale === locale}
                  onClick={() => choosePreviewLocale(locale)}
                  className={`min-h-10 rounded-lg px-3 text-sm font-medium ${previewLocale === locale ? "bg-fg text-raised" : "text-muted"}`}
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
            className="mx-auto block h-[72vh] max-h-[780px] w-full max-w-[390px] rounded-[2rem] border border-line bg-raised shadow-sm"
          />
        </aside>
      </div>
    </div>
  );
}
