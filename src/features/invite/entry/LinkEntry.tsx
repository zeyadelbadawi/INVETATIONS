"use client";

// The page a guest lands on from WhatsApp: /l/[slug]#<code>. The code is in the
// fragment, so it never reaches a server log or a preview crawler (security rule
// 2). Nothing happens without JavaScript: a plain GET creates no session.

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { apiPost, guestPath } from "../lib/api";
import { getMessages } from "../messages";
import { writeGuestHint } from "../guest/GuestContext";
import { Gate } from "./Gate";
import { useBrowserLocale } from "./useBrowserLocale";

type View = { name: "opening" } | { name: "confirm"; label: string } | { name: "invalid" } | { name: "busy" };
type SessionOk = { ok: true; locale: string };

const CODE = /^[A-Za-z0-9_-]{16,32}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function LinkEntry() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params.slug === "string" && SLUG.test(params.slug) ? params.slug : "";
  const locale = useBrowserLocale();
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
      go(isLocale(result.data.locale) ? result.data.locale : defaultLocale);
    } else if (result.status === 409 && result.error === "needs_confirmation") {
      setView({ name: "confirm", label: typeof result.data.currentLabel === "string" ? result.data.currentLabel : "" });
    } else if (result.status === 429 || result.status === 0 || result.status >= 500) {
      setView({ name: "busy" });
    } else {
      code.current = null;
      setView({ name: "invalid" });
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = window.location.hash.slice(1);
    // Take the code out of the address bar and the history entry before anything else.
    if (fragment) window.history.replaceState(null, "", window.location.pathname);
    if (!slug) return void setTimeout(() => setView({ name: "invalid" }), 0);
    if (!fragment) return go(defaultLocale);
    if (!CODE.test(fragment)) return void setTimeout(() => setView({ name: "invalid" }), 0);
    code.current = fragment;
    void exchange(false);
    // Runs once: the fragment is read a single time and then removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Gate locale={locale} busy={view.name === "opening"}>
      {view.name === "opening" ? (
        <p className="inv-gate__body" role="status">
          {t.link.opening}
        </p>
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
        <>
          <p className="inv-gate__body" role="alert">
            {t.link.busy}
          </p>
          <div className="inv-actions">
            <button type="button" className="inv-btn inv-btn--solid" onClick={() => exchange(false)}>
              {t.common.retry}
            </button>
          </div>
        </>
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
