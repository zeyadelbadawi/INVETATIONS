import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isLocale } from "@/i18n/config";
import { ClaimClient } from "@/features/admin/components/claim-client";
import { adminMessages } from "@/features/admin/messages";
import { AuthShell, authSwitchClass } from "@/features/host/components/auth-shell";
import { LanguageSwitch } from "@/features/host/components/language-switch";
import { hostMessages } from "@/features/host/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/claim">): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: adminMessages(isLocale(lang) ? lang : "ar").claim.title,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

// /[lang]/claim#<token>. The page itself is the same for everyone and reads no
// session: the token stays in the fragment and is posted by the client, and
// every check (signed-in account, verified email, expiry, single use) runs in
// the server actions.
export default async function ClaimPage({ params }: PageProps<"/[lang]/claim">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = adminMessages(lang).claim;
  return (
    <AuthShell
      lang={lang}
      title={t.title}
      lead={t.lead}
      languageSwitch={
        <Suspense fallback={null}>
          <LanguageSwitch lang={lang} label={hostMessages(lang).common.switchLanguage} className={authSwitchClass} />
        </Suspense>
      }
    >
      <ClaimClient lang={lang} />
    </AuthShell>
  );
}
