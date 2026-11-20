"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { finishMfaEnrolAction, startMfaEnrolAction, verifyMfaAction } from "../actions";
import { adminMessages } from "../messages";
import { useAdminAction } from "./use-admin-action";

function CodeForm({ lang, label, onSubmit, pending }: { lang: Locale; label: string; onSubmit: (code: string) => void; pending: boolean }) {
  const t = adminMessages(lang).mfa;
  const [code, setCode] = useState("");
  const ready = /^[0-9٠-٩۰-۹]{6}$/.test(code.replace(/\s+/g, ""));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !pending) onSubmit(code);
      }}
    >
      <Field label={t.code} htmlFor="totp-code">
        <Input
          id="totp-code"
          dir="ltr"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <div>
        <Button type="submit" disabled={!ready || pending} aria-busy={pending}>
          {pending ? t.confirming : label}
        </Button>
      </div>
    </form>
  );
}

export function MfaEnrol({ lang }: { lang: Locale }) {
  const t = adminMessages(lang).mfa;
  const router = useRouter();
  const { act, pending, feedback } = useAdminAction(lang);
  const [factor, setFactor] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite">{feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}</div>
      {factor ? (
        <>
          {/* The QR is an SVG data URI returned by the auth server, not customer content. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={factor.qr} alt={t.qrAlt} width={200} height={200} className="rounded-control border border-line bg-white p-2" />
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{t.secretLabel}</p>
            {showSecret ? (
              <code dir="ltr" className="break-all rounded-control bg-surface px-3 py-2 font-mono text-sm">
                {factor.secret}
              </code>
            ) : null}
            <div>
              <Button variant="secondary" size="sm" onClick={() => setShowSecret((v) => !v)}>
                {showSecret ? t.hideSecret : t.showSecret}
              </Button>
            </div>
          </div>
          <CodeForm
            lang={lang}
            label={t.confirm}
            pending={pending}
            onSubmit={(code) =>
              act(
                () => finishMfaEnrolAction(factor.factorId, code),
                () => {
                  router.replace(`/${lang}/admin` as Route);
                  router.refresh();
                  return null;
                },
              )
            }
          />
        </>
      ) : (
        <div>
          <Button
            disabled={pending}
            aria-busy={pending}
            onClick={() =>
              act(
                () => startMfaEnrolAction(),
                (result) => {
                  setFactor({ factorId: result.factorId, qr: result.qr, secret: result.secret });
                  return null;
                },
              )
            }
          >
            {pending ? t.starting : t.start}
          </Button>
        </div>
      )}
    </div>
  );
}

export function MfaVerify({ lang }: { lang: Locale }) {
  const t = adminMessages(lang).mfa;
  const router = useRouter();
  const { act, pending, feedback } = useAdminAction(lang);
  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite">{feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}</div>
      <CodeForm
        lang={lang}
        label={t.verify}
        pending={pending}
        onSubmit={(code) =>
          act(
            () => verifyMfaAction(code),
            () => {
              router.replace(`/${lang}/admin` as Route);
              router.refresh();
              return null;
            },
          )
        }
      />
    </div>
  );
}
