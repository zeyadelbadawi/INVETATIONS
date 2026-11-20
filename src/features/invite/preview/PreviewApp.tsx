"use client";

// Runs inside the editor's sandboxed iframe (sandbox="allow-scripts": opaque
// origin, no cookies, no authenticated requests). It renders the same
// Invitation component guests get, from a draft posted by the parent window.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { GUEST_ONLY_BLOCKS } from "@/content/schema";
import { getPalette, getTemplate } from "@/templates/registry";
import { Invitation, type InvitationDemo } from "../Invitation";
import { getMessages } from "../messages";
import type { LoadedScene } from "../server/scenes";
import type { InviteEvent } from "../types";
import { draftMessageSchema, PREVIEW_READY, type DraftMessage } from "./contract";
import { demoExtras, demoLive, demoMe } from "./demo-data";
import { Gate } from "../entry/Gate";
import type { Locale } from "@/i18n/config";
import "../invite.css";

// How long the frame waits for the editor's first draft before it says so.
const WAIT_MS = 8000;

const subscribeNever = () => () => {};
// The editor may name its language in the frame URL (/preview?lang=en); without
// it the waiting screen speaks both languages, one per line.
function useFrameLocale(): Locale | null {
  return useSyncExternalStore(
    subscribeNever,
    () => {
      const lang = new URLSearchParams(window.location.search).get("lang");
      return lang === "ar" || lang === "en" ? lang : null;
    },
    () => null,
  );
}

function Waiting({ failed }: { failed: boolean }) {
  const only = useFrameLocale();
  const locales: Locale[] = only ? [only] : ["ar", "en"];
  return (
    <Gate locale={only ?? "ar"} busy={!failed}>
      <div className="inv-preview-waits" data-testid={failed ? "preview-failed" : "preview-waiting"}>
        {locales.map((locale) => {
          const t = getMessages(locale).preview;
          return (
            <div key={locale} lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className="inv-preview-wait">
              <p className={failed ? "inv-preview-wait__title" : "inv-gate__body"} role={failed ? "alert" : "status"}>
                {failed ? t.failed : t.waiting}
              </p>
              {failed ? <p className="inv-gate__body">{t.failedHint}</p> : null}
            </div>
          );
        })}
      </div>
    </Gate>
  );
}

// The frame's own origin is opaque, but its URL still names the app it was
// loaded from; the editor lives on that same origin.
function appOrigin(): string {
  try {
    return new URL(window.location.href).origin;
  } catch {
    return "";
  }
}

export function PreviewApp({ scenes }: { scenes: Record<string, LoadedScene> }) {
  const [draft, setDraft] = useState<DraftMessage | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (draft) return;
    const timer = setTimeout(() => setTimedOut(true), WAIT_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || window.parent === window) return;
      if (event.origin !== appOrigin()) return;
      const parsed = draftMessageSchema.safeParse(event.data);
      if (parsed.success) setDraft(parsed.data);
    };
    window.addEventListener("message", onMessage);
    // The target origin cannot be narrowed from an opaque origin; the message carries nothing but its type.
    if (window.parent !== window) window.parent.postMessage({ type: PREVIEW_READY }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const view = useMemo(() => {
    if (!draft) return null;
    const template = getTemplate(draft.templateId, draft.templateVersion);
    if (!template || template.kind !== draft.kind) return null;
    const enabled = draft.content.blocks.filter((block) => block.enabled);
    const event: InviteEvent = {
      slug: "preview",
      kind: draft.kind,
      status: draft.status ?? "published",
      startsAt: draft.startsAt ?? null,
      endsAt: draft.endsAt ?? null,
      timezone: draft.timezone ?? "Africa/Cairo",
      fields: draft.content.fields,
      blocks: enabled.filter((block) => !GUEST_ONLY_BLOCKS.has(block.type)),
      order: enabled.map((block) => block.id),
      preview: draft.content.preview,
      settings: { sharingEnabled: draft.settings?.sharingEnabled ?? true, rosterVisible: draft.settings?.rosterVisible ?? true, lockTeams: draft.settings?.lockTeams ?? false, wallEnabled: draft.settings?.wallEnabled ?? true },
      entitlements: { games: true, share_cards: true, reveal: true, voice: true, photos: true },
    };
    const guestBlocks = enabled.filter((block) => GUEST_ONLY_BLOCKS.has(block.type));
    const reveal = draft.demo?.reveal ?? "idle";
    const sections = draft.demo?.sections ?? false;
    const demo: InvitationDemo = {
      me: demoMe(template, draft.locale, guestBlocks, (draft.demo?.joined ?? false) || sections),
      live: demoLive(template, reveal === "countdown" ? "countdown" : "idle"),
      answer: reveal === "open" || reveal === "result" ? (draft.demo?.answer ?? ["girl"]) : undefined,
      interactiveReveal: reveal === "open",
      extras: sections ? demoExtras(template, draft.locale) : undefined,
    };
    const sceneRef = template.scenes[0];
    return { template, event, demo, palette: getPalette(template, draft.theme.palette), scene: sceneRef ? (scenes[sceneRef.id] ?? null) : null };
  }, [draft, scenes]);

  // No draft yet: waiting, then a clear failure. A draft that names a template
  // this build does not have is a failure straight away.
  if (!draft || !view) return <Waiting failed={draft !== null || timedOut} />;

  return (
    <div lang={draft.locale} dir={draft.locale === "ar" ? "rtl" : "ltr"} data-testid="preview-root">
      <p className="inv-preview-flag">{getMessages(draft.locale).preview.demo}</p>
      <Invitation
        key={`${draft.templateId}:${draft.locale}:${draft.demo?.reveal ?? ""}:${draft.demo?.revealStyle ?? ""}`}
        event={view.event}
        template={view.template}
        palette={view.palette}
        locale={draft.locale}
        scene={view.scene}
        revealStyle={draft.demo?.revealStyle}
        demo={view.demo}
      />
    </div>
  );
}
