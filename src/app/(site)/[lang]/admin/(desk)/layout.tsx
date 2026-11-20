import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { lang as rootLang } from "next/root-params";
import { Suspense, type ReactNode } from "react";
import { isLocale, type Locale } from "@/i18n/config";
import { AccessError, requireStaff } from "@/lib/events/access";
import { StaffNav } from "@/features/admin/components/staff-nav";
import { staffMfaStep } from "@/features/admin/lib/session";
import { PageSkeleton } from "@/features/host/components/app-header";
import { hostMessages } from "@/features/host/messages";

// The back office opens only for staff in a session verified with a second
// factor (security O1). This sends people to the right place; every page and
// action below still checks role and aal2 itself (requireStaffSession).
async function StaffGate({ lang, children }: { lang: Locale; children: ReactNode }) {
  try {
    await requireStaff(["admin", "support", "designer"]);
  } catch (error) {
    if (error instanceof AccessError && error.reason === "unauthenticated") redirect(`/${lang}/login` as Route);
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const step = await staffMfaStep();
  if (step === "enroll") redirect(`/${lang}/admin/mfa/enroll` as Route);
  if (step === "verify") redirect(`/${lang}/admin/mfa/verify` as Route);
  return <>{children}</>;
}

export default async function DeskLayout({ children }: { children: ReactNode }) {
  const l = await rootLang();
  if (!isLocale(l)) notFound();
  return (
    <>
      <Suspense fallback={<div className="-mx-4 -mt-6 mb-8 h-12 border-b border-line sm:-mx-6 sm:-mt-8" />}>
        <StaffNav lang={l} />
      </Suspense>
      <Suspense fallback={<PageSkeleton label={hostMessages(l).common.loading} />}>
        <StaffGate lang={l}>{children}</StaffGate>
      </Suspense>
    </>
  );
}
