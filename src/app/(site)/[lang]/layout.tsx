import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { brand } from "@/config/brand";
import { dirOf, isLocale, locales } from "@/i18n/config";
import { siteDisplayFont, uiFont } from "@/app/fonts";
import "@/app/globals.css";

export function generateStaticParams() {
  return locales.map((l) => ({ lang: l }));
}

export async function generateMetadata(): Promise<Metadata> {
  const l = await lang();
  const locale = isLocale(l) ? l : "ar";
  return {
    title: { default: brand.name[locale], template: `%s · ${brand.name[locale]}` },
    description: brand.tagline[locale],
  };
}

export default async function SiteLayout({ children }: LayoutProps<"/[lang]">) {
  const l = await lang();
  if (!isLocale(l)) notFound();
  return (
    <html lang={l} dir={dirOf(l)} className={`${uiFont.variable} ${siteDisplayFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-surface text-fg">{children}</body>
    </html>
  );
}
