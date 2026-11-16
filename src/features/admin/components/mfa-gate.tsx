import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { AccessError, requireStaff } from "@/lib/events/access";
import { staffMfaStep } from "@/features/admin/lib/session";

// Shows the step only to staff who need it; everyone else goes where they belong.
export async function MfaStepGate({ lang, step, children }: { lang: Locale; step: "enroll" | "verify"; children: ReactNode }) {
  try {
    await requireStaff(["admin", "support", "designer"]);
  } catch (error) {
    if (error instanceof AccessError && error.reason === "unauthenticated") redirect(`/${lang}/login` as Route);
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const current = await staffMfaStep();
  if (current === "allowed") redirect(`/${lang}/admin` as Route);
  if (current !== step) redirect(`/${lang}/admin/mfa/${current}` as Route);
  return <>{children}</>;
}
