"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { requestPasswordReset, signIn, signInWithGoogle, signUp, updatePassword, type AuthState } from "../actions/auth";
import { fmt } from "../lib/text";
import { hostMessages } from "../messages";

type Props = {
  mode: "login" | "signup";
  lang: Locale;
  next?: string;
  linkError?: "link" | "oauth";
  googleEnabled: boolean;
};

const linkClass = "font-medium text-accent-ink underline underline-offset-4 hover:text-fg";

// The ids a field's control points at: its hint, then its error, when present.
function describedBy(id: string, hint: boolean, error: boolean): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function AuthForm({ mode, lang, next, linkError, googleEnabled }: Props) {
  const t = hostMessages(lang).auth;
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, {});
  // Field problems are shown under their fields, all at once; the notice is for the rest.
  const emailError = state.fields?.email ? t.errors[state.fields.email] : null;
  const passwordError = state.fields?.password ? t.errors[state.fields.password] : null;
  const formError = state.fields ? null : state.error ? t.errors[state.error] : linkError ? t.errors[linkError] : null;
  const other = mode === "login" ? "signup" : "login";
  const otherHref = `/${lang}/${other}${next ? `?next=${encodeURIComponent(next)}` : ""}` as Route;

  if (state.notice === "check_email") {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-xl font-semibold">{t.checkEmailTitle}</h2>
        <p className="text-muted">{fmt(t.checkEmailBody, { email: state.email ?? "" })}</p>
        <Link href={`/${lang}/login` as Route} className={linkClass}>
          {t.toLogin}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="lang" value={lang} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label={t.email} htmlFor="email" error={emailError}>
          <Input
            night
            id="email"
            name="email"
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={state.email ?? ""}
            aria-invalid={emailError !== null || state.error === "credentials"}
            aria-describedby={emailError ? "email-error" : formError ? "auth-error" : undefined}
          />
        </Field>
        <Field label={t.password} htmlFor="password" hint={mode === "signup" ? t.passwordHint : undefined} error={passwordError}>
          <Input
            night
            id="password"
            name="password"
            type="password"
            dir="ltr"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            maxLength={72}
            aria-invalid={passwordError !== null || state.error === "credentials"}
            aria-describedby={describedBy("password", mode === "signup", passwordError !== null) ?? (formError ? "auth-error" : undefined)}
          />
        </Field>
        {mode === "login" ? (
          <Link href={`/${lang}/login/reset` as Route} className={`-mt-2 self-start text-sm ${linkClass}`}>
            {t.forgot}
          </Link>
        ) : null}
        <div aria-live="polite">
          {formError ? (
            <Notice tone="danger">
              <span id="auth-error">{formError}</span>
            </Notice>
          ) : null}
        </div>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending} aria-busy={pending}>
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
        <Link href={otherHref} className={linkClass}>
          {mode === "login" ? t.toSignup : t.toLogin}
        </Link>
      </p>
    </div>
  );
}

// "Forgot password": asks for the email and always gives the same answer.
export function ResetRequestForm({ lang }: { lang: Locale }) {
  const t = hostMessages(lang).auth;
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  const emailError = state.fields?.email ? t.errors[state.fields.email] : null;
  const formError = state.error ? t.errors[state.error] : null;

  if (state.notice === "reset_sent") {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-xl font-semibold">{t.checkEmailTitle}</h2>
        <p className="text-muted">{fmt(t.resetSentBody, { email: state.email ?? "" })}</p>
        <Link href={`/${lang}/login` as Route} className={`self-start ${linkClass}`}>
          {t.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="lang" value={lang} />
        <Field label={t.email} htmlFor="email" error={emailError}>
          <Input
            night
            id="email"
            name="email"
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={state.email ?? ""}
            aria-invalid={emailError !== null}
            aria-describedby={emailError ? "email-error" : formError ? "auth-error" : undefined}
          />
        </Field>
        <div aria-live="polite">
          {formError ? (
            <Notice tone="danger">
              <span id="auth-error">{formError}</span>
            </Notice>
          ) : null}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
          {t.resetSend}
        </Button>
      </form>
      <Link href={`/${lang}/login` as Route} className={`self-start text-sm ${linkClass}`}>
        {t.backToLogin}
      </Link>
    </div>
  );
}

// The new password, for someone signed in (normally straight from the recovery link).
export function NewPasswordForm({ lang }: { lang: Locale }) {
  const t = hostMessages(lang).auth;
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, {});
  const passwordError = state.fields?.password ? t.errors[state.fields.password] : null;
  const formError = state.error ? t.errors[state.error] : null;

  if (state.notice === "password_saved") {
    return (
      <div className="flex flex-col gap-4" role="status">
        <Notice tone="success">{t.passwordSaved}</Notice>
        <Link href={`/${lang}/app` as Route} className={`self-start ${linkClass}`}>
          {t.toEvents}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex max-w-sm flex-col gap-5" noValidate>
      <Field label={t.newPassword} htmlFor="new-password" hint={t.passwordHint} error={passwordError}>
        <Input
          id="new-password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          aria-invalid={passwordError !== null}
          aria-describedby={describedBy("new-password", true, passwordError !== null)}
        />
      </Field>
      <div aria-live="polite">{formError ? <Notice tone="danger">{formError}</Notice> : null}</div>
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {t.savePassword}
        </Button>
      </div>
    </form>
  );
}
