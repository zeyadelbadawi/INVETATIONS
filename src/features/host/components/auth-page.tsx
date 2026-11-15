import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { otherLocale, type Locale } from "@/i18n/config";
import { currentUserId } from "@/lib/events/access";
import { safeNext } from "../lib/redirect";
import { hostMessages } from "../messages";
import { AuthForm } from "./auth-form";

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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <Link href={`/${lang}` as Route} className="text-2xl font-bold text-primary">
          {brand.name[lang]}
        </Link>
        <Link
          href={`/${otherLocale(lang)}/${mode}` as Route}
          lang={otherLocale(lang)}
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted hover:bg-raised"
        >
          {t.common.switchLanguage}
        </Link>
      </div>
      <Card>
        <h1 className="text-2xl font-semibold">{mode === "login" ? t.auth.loginTitle : t.auth.signupTitle}</h1>
        <p className="mb-6 mt-1 text-muted">{mode === "login" ? t.auth.loginLead : t.auth.signupLead}</p>
        <Suspense fallback={<AuthForm mode={mode} lang={lang} googleEnabled={googleEnabled} />}>
          <FormWithRequest mode={mode} lang={lang} searchParams={searchParams} />
        </Suspense>
      </Card>
    </main>
  );
}
