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

// The other language's version of this page, keeping where the person was
// going (?next=), moved to that language. Reads the query, so it renders
// inside a boundary; the fallback is the same link without it.
async function LanguageLink({ mode, lang, searchParams }: Props) {
  const query = await searchParams;
  const target = otherLocale(lang);
  const rawNext = typeof query.next === "string" ? query.next : undefined;
  const next = rawNext ? safeNext(safeNext(rawNext, lang).replace(new RegExp(`^/${lang}(?=/|$)`), `/${target}`), target) : undefined;
  return <SwitchLink href={`/${target}/${mode}${next ? `?next=${encodeURIComponent(next)}` : ""}`} lang={lang} />;
}

function SwitchLink({ href, lang }: { href: string; lang: Locale }) {
  return (
    <Link href={href as Route} lang={otherLocale(lang)} className={authSwitchClass}>
      {hostMessages(lang).common.switchLanguage}
    </Link>
  );
}

export function AuthPage({ mode, lang, searchParams }: Props) {
  const t = hostMessages(lang);
  return (
    <AuthShell
      lang={lang}
      title={mode === "login" ? t.auth.loginTitle : t.auth.signupTitle}
      lead={mode === "login" ? t.auth.loginLead : t.auth.signupLead}
      languageSwitch={
        <Suspense fallback={<SwitchLink href={`/${otherLocale(lang)}/${mode}`} lang={lang} />}>
          <LanguageLink mode={mode} lang={lang} searchParams={searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<AuthForm mode={mode} lang={lang} googleEnabled={googleEnabled} />}>
        <FormWithRequest mode={mode} lang={lang} searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
