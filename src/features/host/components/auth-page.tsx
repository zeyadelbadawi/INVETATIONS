import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { otherLocale, type Locale } from "@/i18n/config";
import { currentUserId } from "@/lib/events/access";
import { safeNext } from "../lib/redirect";
import { hostMessages } from "../messages";
import { AuthForm } from "./auth-form";
import { AuthShell, authSwitchClass } from "./auth-shell";

type Search = Promise<Record<string, string | string[] | undefined>>;
type Props = { mode: "login" | "signup"; lang: Locale; searchParams: Search };

const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

// Reads the query string and the session, so it renders inside the boundary;
// the plain form is the fallback and works on its own.
async function FormWithRequest({ mode, lang, searchParams }: Props) {
  const query = await searchParams;
  const rawNext = typeof query.next === "string" ? query.next : undefined;
  const next = rawNext ? safeNext(rawNext, lang) : undefined;
  if (await currentUserId()) redirect((next ?? `/${lang}/app`) as Route);
  const linkError = query.error === "link" || query.error === "oauth" ? query.error : undefined;
  return <AuthForm mode={mode} lang={lang} next={next} linkError={linkError} googleEnabled={googleEnabled} />;
}

export function AuthPage({ mode, lang, searchParams }: Props) {
  const t = hostMessages(lang);
  return (
    <AuthShell
      lang={lang}
      title={mode === "login" ? t.auth.loginTitle : t.auth.signupTitle}
      lead={mode === "login" ? t.auth.loginLead : t.auth.signupLead}
      languageSwitch={
        <Link href={`/${otherLocale(lang)}/${mode}` as Route} lang={otherLocale(lang)} className={authSwitchClass}>
          {t.common.switchLanguage}
        </Link>
      }
    >
      <Suspense fallback={<AuthForm mode={mode} lang={lang} googleEnabled={googleEnabled} />}>
        <FormWithRequest mode={mode} lang={lang} searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
