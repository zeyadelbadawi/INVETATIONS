import type { Metadata, Route } from "next";
import { brand } from "@/config/brand";
import { locales, type Locale } from "@/i18n/config";

// Marketing routes, without the locale prefix. The sitemap lists exactly these.
export const marketingPaths = ["", "/how-it-works", "/pricing"] as const;
export type MarketingPath = (typeof marketingPaths)[number];

// Public origin for canonical URLs, the sitemap and robots. Read at build time;
// falls back to the Vercel production host, then to local development.
export function siteOrigin(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const raw = process.env.APP_ORIGIN ?? (vercel ? `https://${vercel}` : "http://localhost:3000");
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function localHref(lang: Locale, path: string): Route {
  return `/${lang}${path}` as Route;
}

export function whatsappHref(): string | null {
  const digits = brand.supportWhatsApp.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export function pageMetadata(lang: Locale, path: MarketingPath, title: string, description: string, absoluteTitle = false): Metadata {
  const languages = Object.fromEntries(locales.map((l) => [l, `/${l}${path}`]));
  const siteName = brand.name[lang];
  return {
    metadataBase: new URL(siteOrigin()),
    title: absoluteTitle ? { absolute: `${siteName} · ${title}` } : title,
    description,
    alternates: { canonical: `/${lang}${path}`, languages: { ...languages, "x-default": `/ar${path}` } },
    openGraph: {
      type: "website",
      siteName,
      title: absoluteTitle ? `${siteName} · ${title}` : `${title} · ${siteName}`,
      description,
      url: `/${lang}${path}`,
      locale: lang === "ar" ? "ar_EG" : "en_US",
      alternateLocale: lang === "ar" ? "en_US" : "ar_EG",
      images: [{ url: "/marketing/og.jpg", width: 1200, height: 630, alt: brand.tagline[lang] }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/marketing/og.jpg"] },
  };
}
