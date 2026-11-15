"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { signIn, signInWithGoogle, signUp, type AuthState } from "../actions/auth";
import { fmt } from "../lib/text";
import { hostMessages } from "../messages";

type Props = {
  mode: "login" | "signup";
  lang: Locale;
  next?: string;
  linkError?: "link" | "oauth";
  googleEnabled: boolean;
};

export function AuthForm({ mode, lang, next, linkError, googleEnabled }: Props) {
  const t = hostMessages(lang).auth;
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, {});
  const error = state.error ? t.errors[state.error] : linkError ? t.errors[linkError] : null;
  const other = mode === "login" ? "signup" : "login";
  const otherHref = `/${lang}/${other}${next ? `?next=${encodeURIComponent(next)}` : ""}` as Route;

  if (state.notice === "check_email") {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-xl font-semibold">{t.checkEmailTitle}</h2>
        <p className="text-muted">{fmt(t.checkEmailBody, { email: state.email ?? "" })}</p>
        <Link href={`/${lang}/login` as Route} className="font-medium text-secondary underline underline-offset-4">
          {t.toLogin}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="lang" value={lang} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label={t.email} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={state.email ?? ""}
            aria-invalid={state.error === "invalid" || state.error === "credentials"}
            aria-describedby={error ? "auth-error" : undefined}
          />
        </Field>
        <Field label={t.password} htmlFor="password" hint={mode === "signup" ? t.passwordHint : undefined}>
          <Input
            id="password"
            name="password"
            type="password"
            dir="ltr"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            maxLength={72}
            aria-invalid={state.error === "weak_password" || state.error === "credentials"}
            aria-describedby={mode === "signup" ? "password-hint" : error ? "auth-error" : undefined}
          />
        </Field>
        <div aria-live="polite">
          {error ? (
            <Notice tone="danger">
              <span id="auth-error">{error}</span>
            </Notice>
          ) : null}
        </div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {mode === "login" ? t.signIn : t.signUp}
        </Button>
      </form>

      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-sm text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            {t.or}
            <span className="h-px flex-1 bg-line" />
          </div>
          <form action={signInWithGoogle}>
            <input type="hidden" name="lang" value={lang} />
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <Button type="submit" variant="secondary" className="w-full">
              {t.google}
            </Button>
          </form>
        </>
      ) : null}

      <p className="text-sm text-muted">
        {mode === "login" ? t.noAccount : t.haveAccount}{" "}
        <Link href={otherHref} className="font-medium text-secondary underline underline-offset-4">
          {mode === "login" ? t.toSignup : t.toLogin}
        </Link>
      </p>
    </div>
  );
}
