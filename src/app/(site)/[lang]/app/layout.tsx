import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { connection } from "next/server";
import { isLocale } from "@/i18n/config";
import { AppHeader } from "@/features/host/components/app-header";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Rendered per request, never from a prerendered shell: the strict
// Content-Security-Policy (src/proxy.ts) puts a fresh nonce on every script,
// which a shell built ahead of time cannot carry (security rule 17, review F10).
export const instant = false;

// The signed-in area. The proxy turns signed-out visitors away early; every
// page and action below still checks the session and the event itself.
export default async function AppLayout({ children }: LayoutProps<"/[lang]/app">) {
  await connection();
  const l = await lang();
  if (!isLocale(l)) notFound();
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader lang={l} home="app" />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-6 sm:px-6 sm:pt-8">{children}</main>
    </div>
  );
}
