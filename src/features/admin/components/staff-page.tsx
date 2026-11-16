import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { AccessError } from "@/lib/events/access";
import { HostError } from "@/features/host/lib/errors";
import { requireStaffSession, type StaffRole } from "../lib/session";

// Page guard: staff role + aal2 (security O1). Signed-out → sign-in; not staff
// or wrong role → not found; second factor missing → the MFA step.
export async function staffForPage(lang: Locale, roles: StaffRole[]): Promise<{ userId: string; role: string }> {
  try {
    return await requireStaffSession(roles);
  } catch (error) {
    if (error instanceof AccessError && error.reason === "unauthenticated") redirect(`/${lang}/login` as Route);
    if (error instanceof AccessError) notFound();
    if (error instanceof HostError && error.code === "mfa_required") redirect(`/${lang}/admin/mfa/verify` as Route);
    throw error;
  }
}

export function dateFormat(lang: Locale) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" });
}
