import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageTitle } from "@/components/ui/card";
import { isLocale, type Locale } from "@/i18n/config";
import { PageSkeleton } from "@/features/host/components/app-header";
import { NewPasswordForm } from "@/features/host/components/auth-form";
import { userOrLogin } from "@/features/host/lib/page";
import { hostMessages } from "@/features/host/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/password">): Promise<Metadata> {
  const { lang } = await params;
  return { title: hostMessages(isLocale(lang) ? lang : "ar").auth.newPasswordTitle };
}

// Where the password-recovery link lands once /auth/confirm has signed the person in.
async function Guarded({ lang }: { lang: Locale }) {
  await userOrLogin(lang, `/${lang}/app/password`);
  return <NewPasswordForm lang={lang} />;
}

export default async function PasswordPage({ params }: PageProps<"/[lang]/app/password">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = hostMessages(lang);
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.auth.newPasswordTitle} lead={t.auth.newPasswordLead} />
      <Suspense fallback={<PageSkeleton label={t.common.loading} />}>
        <Guarded lang={lang} />
      </Suspense>
    </div>
  );
}
