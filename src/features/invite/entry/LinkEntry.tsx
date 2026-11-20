"use client";

// The page a guest lands on from WhatsApp: /l/[slug]#<code>. The code is in the
// fragment, so it never reaches a server log or a preview crawler (security rule
// 2). Nothing happens without JavaScript: a plain GET creates no session.

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { defaultLocale as appDefaultLocale, isLocale, type Locale } from "@/i18n/config";
import { apiPost, guestPath } from "../lib/api";
import { getMessages } from "../messages";
import { writeGuestHint } from "../guest/GuestContext";
import { Gate } from "./Gate";
import { useBrowserLocale } from "./useBrowserLocale";

// invalid: the link itself is wrong (unknown, revoked, cut short). busy: rate
// limited. offline: no answer at all. error: the server refused or failed, so
// the link may well be fine and trying again makes sense.
type View = { name: "opening" } | { name: "confirm"; label: string } | { name: "invalid" } | { name: "busy" } | { name: "offline" } | { name: "error" };
type SessionOk = { ok: true; locale: string };

const CODE = /^[A-Za-z0-9_-]{16,32}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Shown by the server while the page is still on its way: the same hairline,
// running, so the screen is never an empty colour.
export function LinkEntryLoading() {
  return (
    <Gate locale={appDefaultLocale} busy>
      <p className="inv-sr" role="status">
        {getMessages("ar").link.opening} {getMessages("en").link.opening}
      </p>
    </Gate>
  );
}

export type LinkEntryProps = {
  // The language the event is written in (null: both, or unknown event).
  eventLocale: Locale | null;
  // Where a guest goes without a code: the event's default language.
  defaultLocale: Locale | null;
  // The event's public title, shown while the link is checked.
  title: { ar: string; en: string };
};

export function LinkEntry({ eventLocale, defaultLocale, title }: LinkEntryProps) {
  const params = useParams<{ slug: string }>();
  const slug = typeof params.slug === "string" && SLUG.test(params.slug) ? params.slug : "";
  const browserLocale = useBrowserLocale();
  const locale = eventLocale ?? browserLocale;
  const t = getMessages(locale);
  const [view, setView] = useState<View>({ name: "opening" });
  const code = useRef<string | null>(null);
  const started = useRef(false);

  const go = (to: Locale) => window.location.replace(`/i/${slug}/${to}`);

  const exchange = async (confirm: boolean) => {
    if (!code.current) return;
    setView({ name: "opening" });
    const result = await apiPost<SessionOk>(guestPath(slug, "session"), confirm ? { code: code.current, confirm: true } : { code: code.current });
    if (result.ok) {
      code.current = null;
      writeGuestHint(slug, true);
      go(isLocale(result.data.locale) ? result.data.locale : (defaultLocale ?? appDefaultLocale));
    } else if (result.status === 409 && result.error === "needs_confirmation") {
      setView({ name: "confirm", label: typeof result.data.currentLabel === "string" ? result.data.currentLabel : "" });
    } else if (result.status === 404) {
      // Unknown event, or a code that matches no live invitation.
      code.current = null;
      setView({ name: "invalid" });
    } else if (result.status === 429) {
      setView({ name: "busy" });
    } else if (result.status === 0) {
      setView({ name: "offline" });
    } else {
      // 403 (origin), 5xx and anything else: the code is kept for a retry.
      setView({ name: "error" });
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = window.location.hash.slice(1);
    // Take the code out of the address bar and the history entry before anything else.
    if (fragment) window.history.replaceState(null, "", window.location.pathname);
    if (!slug) return void setTimeout(() => setView({ name: "invalid" }), 0);
    if (!fragment) return go(defaultLocale ?? locale);
    if (!CODE.test(fragment)) return void setTimeout(() => setView({ name: "invalid" }), 0);
    code.current = fragment;
    void exchange(false);
    // Runs once: the fragment is read a single time and then removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = (titleText: string, body: string) => (
    <>
      <h1 className="inv-gate__title" role="alert">
        {titleText}
      </h1>
      <p className="inv-gate__body">{body}</p>
      <div className="inv-actions">
        <button type="button" className="inv-btn inv-btn--solid" onClick={() => exchange(false)}>
          {t.common.retry}
        </button>
      </div>
    </>
  );

  return (
    <Gate locale={locale} busy={view.name === "opening"}>
      {view.name === "opening" ? (
        <>
          {title[locale] ? <p className="inv-gate__title">{title[locale]}</p> : null}
          <p className="inv-gate__body" role="status" data-testid="link-opening">
            {t.link.opening}
          </p>
        </>
      ) : view.name === "confirm" ? (
        <div role="alertdialog" aria-labelledby="switch-title" aria-describedby="switch-body" className="inv-gate__card">
          <h1 id="switch-title" className="inv-gate__title">
            {t.link.confirmTitle(view.label)}
          </h1>
          <p id="switch-body" className="inv-gate__body">
            {t.link.confirmBody}
          </p>
          <div className="inv-actions">
            <button type="button" className="inv-btn inv-btn--solid" onClick={() => exchange(true)} autoFocus>
              {t.link.switch}
            </button>
            <button type="button" className="inv-btn" onClick={() => ((code.current = null), go(locale))}>
              {t.link.keep}
            </button>
          </div>
        </div>
      ) : view.name === "busy" ? (
        retry(t.link.busyTitle, t.link.busy)
      ) : view.name === "offline" ? (
        retry(t.link.offlineTitle, t.link.offline)
      ) : view.name === "error" ? (
        retry(t.link.errorTitle, t.link.error)
      ) : (
        <>
          <h1 className="inv-gate__title" role="alert">
            {t.link.invalidTitle}
          </h1>
          <p className="inv-gate__body">{t.link.invalidBody}</p>
          {slug ? (
            <div className="inv-actions">
              <a className="inv-btn" href={`/i/${slug}/${locale}`}>
                {t.link.viewPublic}
              </a>
            </div>
          ) : null}
        </>
      )}
    </Gate>
  );
}
