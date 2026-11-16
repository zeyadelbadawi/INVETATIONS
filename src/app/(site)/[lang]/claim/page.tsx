import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { ClaimClient } from "@/features/admin/components/claim-client";
import { adminMessages } from "@/features/admin/messages";
import { AppHeader } from "@/features/host/components/app-header";

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
    <div className="flex flex-1 flex-col">
      <AppHeader lang={lang} home="app" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="mt-1 text-muted">{t.lead}</p>
        </div>
        <ClaimClient lang={lang} />
      </main>
    </div>
  );
}
