import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { isLocale } from "@/i18n/config";
import { adminMessages } from "@/features/admin/messages";
import { AppHeader } from "@/features/host/components/app-header";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Chrome only. The staff check lives in the page and in every action.
export default async function AdminLayout({ children }: LayoutProps<"/[lang]/admin">) {
  const l = await lang();
  if (!isLocale(l)) notFound();
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader lang={l} home="admin" badge={adminMessages(l).badge} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
