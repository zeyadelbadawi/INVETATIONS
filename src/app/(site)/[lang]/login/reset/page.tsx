import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, otherLocale } from "@/i18n/config";
import { ResetRequestForm } from "@/features/host/components/auth-form";
import { AuthShell, authSwitchClass } from "@/features/host/components/auth-shell";
import { hostMessages } from "@/features/host/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/login/reset">): Promise<Metadata> {
  const { lang } = await params;
  return { title: hostMessages(isLocale(lang) ? lang : "ar").auth.resetTitle, robots: { index: false } };
}

// "Forgot password": the email goes to the auth server, which sends the
// recovery link (Supabase's built-in email).
export default async function ResetPage({ params }: PageProps<"/[lang]/login/reset">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = hostMessages(lang);
  return (
    <AuthShell
      lang={lang}
      title={t.auth.resetTitle}
      lead={t.auth.resetLead}
      languageSwitch={
        <Link href={`/${otherLocale(lang)}/login/reset` as Route} lang={otherLocale(lang)} className={authSwitchClass}>
          {t.common.switchLanguage}
        </Link>
      }
    >
      <ResetRequestForm lang={lang} />
    </AuthShell>
  );
}
