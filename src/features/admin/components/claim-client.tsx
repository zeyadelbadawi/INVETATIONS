"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import type { Locale } from "@/i18n/config";
import { acceptClaimAction, previewClaimAction } from "../claim-actions";
import type { AdminErrorCode } from "../lib/errors";
import { adminMessages } from "../messages";

// The claim token arrives in the URL fragment, so it never reaches a server
// log. It is moved to this tab's session storage (so it survives a sign-in
// round trip), removed from the address bar, and posted to the server only
// through the actions below.
const KEY = "claim-token";
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

function readToken(): string | null {
  const fromHash = window.location.hash.slice(1);
  if (TOKEN.test(fromHash)) {
    try {
      window.sessionStorage.setItem(KEY, fromHash);
    } catch {
      // Storage can be blocked; the token still works for this visit.
    }
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return fromHash;
  }
  try {
    const stored = window.sessionStorage.getItem(KEY);
    return stored && TOKEN.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

function forget() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

type State =
  | { kind: "checking" }
  | { kind: "no_token" }
  | { kind: "error"; code: AdminErrorCode }
  | { kind: "ready"; token: string; eventName: string }
  | { kind: "done"; eventId: string };

export function ClaimClient({ lang }: { lang: Locale }) {
  const t = adminMessages(lang);
  const c = t.claim;
  const [state, setState] = useState<State>({ kind: "checking" });
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const token = readToken();
    if (!token) {
      // Deferred so the state update does not happen inside the effect body.
      queueMicrotask(() => setState({ kind: "no_token" }));
      return;
    }
    let live = true;
    previewClaimAction(token, lang).then(
      (result) => {
        if (!live) return;
        if (result.ok) setState({ kind: "ready", token, eventName: result.eventName });
        else {
          if (result.error === "claim_unavailable") forget();
          setState({ kind: "error", code: result.error });
        }
      },
      () => live && setState({ kind: "error", code: "unknown" }),
    );
    return () => {
      live = false;
    };
  }, [lang]);

  function accept(token: string) {
    startTransition(async () => {
      const result = await acceptClaimAction(token).catch(() => ({ ok: false as const, error: "unknown" as const }));
      if (result.ok) {
        forget();
        setState({ kind: "done", eventId: result.eventId });
      } else {
        if (result.error === "claim_unavailable") forget();
        setState({ kind: "error", code: result.error });
      }
    });
  }

  return (
    <Card className="flex flex-col gap-4" aria-live="polite">
      {state.kind === "checking" ? <p role="status">{c.checking}</p> : null}
      {state.kind === "no_token" ? <Notice tone="danger">{c.noToken}</Notice> : null}
      {state.kind === "error" && state.code === "unauthenticated" ? (
        <>
          <p>{c.signInLead}</p>
          <div>
            <Link href={`/${lang}/login` as Route} className={buttonClass("primary")}>
              {c.signIn}
            </Link>
          </div>
        </>
      ) : null}
      {state.kind === "error" && state.code !== "unauthenticated" ? <Notice tone="danger">{t.errors[state.code] ?? t.errors.unknown}</Notice> : null}
      {state.kind === "ready" ? (
        <>
          <div>
            <p className="text-sm text-muted">{c.event}</p>
            {/* Customer text is rendered as text (security C1). */}
            <p className="text-lg font-semibold [overflow-wrap:anywhere]">{state.eventName}</p>
          </div>
          <div>
            <Button disabled={pending} aria-busy={pending} onClick={() => accept(state.token)}>
              {pending ? c.confirming : c.confirm}
            </Button>
          </div>
        </>
      ) : null}
      {state.kind === "done" ? (
        <>
          <Notice tone="success">{c.done}</Notice>
          <div>
            <Link href={`/${lang}/app/events/${state.eventId}/edit` as Route} className={buttonClass("primary")}>
              {c.openEvent}
            </Link>
          </div>
        </>
      ) : null}
    </Card>
  );
}
