"use client";

// Runs inside the editor's sandboxed iframe (sandbox="allow-scripts": opaque
// origin, no cookies, no authenticated requests). It renders the same
// Invitation component guests get, from a draft posted by the parent window.

import { useEffect, useMemo, useState } from "react";
import { GUEST_ONLY_BLOCKS } from "@/content/schema";
import { getPalette, getTemplate } from "@/templates/registry";
import { Invitation, type InvitationDemo } from "../Invitation";
import { getMessages } from "../messages";
import type { LoadedScene } from "../server/scenes";
import type { InviteEvent } from "../types";
import { draftMessageSchema, PREVIEW_READY, type DraftMessage } from "./contract";
import { demoExtras, demoLive, demoMe } from "./demo-data";
import { inviteFontClass } from "../fonts";
import "../invite.css";

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
      settings: { sharingEnabled: draft.settings?.sharingEnabled ?? true, rosterVisible: draft.settings?.rosterVisible ?? true, lockTeams: draft.settings?.lockTeams ?? false },
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

  if (!draft || !view) {
    const t = getMessages("ar").preview;
    return (
      <div className={`inv inv--brand ${inviteFontClass}`} data-scheme="light">
        <p className="inv-gate inv-gate__body" data-testid="preview-waiting">
          <span lang="ar" dir="rtl">
            {t.waiting}
          </span>
          <span lang="en" dir="ltr">
            {getMessages("en").preview.waiting}
          </span>
        </p>
      </div>
    );
  }

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
