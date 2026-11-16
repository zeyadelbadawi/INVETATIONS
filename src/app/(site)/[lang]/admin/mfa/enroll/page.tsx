import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { isLocale } from "@/i18n/config";
import { MfaEnrol } from "@/features/admin/components/mfa-forms";
import { adminMessages } from "@/features/admin/messages";
import { PageSkeleton } from "@/features/host/components/app-header";
import { hostMessages } from "@/features/host/messages";
import { MfaStepGate } from "@/features/admin/components/mfa-gate";

export async function generateMetadata({ params }: PageProps<"/[lang]/admin/mfa/enroll">): Promise<Metadata> {
  const { lang } = await params;
  return { title: adminMessages(isLocale(lang) ? lang : "ar").mfa.enrolTitle };
}

export default async function Page({ params }: PageProps<"/[lang]/admin/mfa/enroll">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = adminMessages(lang).mfa;
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.enrolTitle}</h1>
        <p className="mt-1 text-muted">{t.enrolLead}</p>
      </div>
      <Suspense fallback={<PageSkeleton label={hostMessages(lang).common.loading} />}>
        <MfaStepGate lang={lang} step="enroll">
          <Card>
            <MfaEnrol lang={lang} />
          </Card>
        </MfaStepGate>
      </Suspense>
    </div>
  );
}
