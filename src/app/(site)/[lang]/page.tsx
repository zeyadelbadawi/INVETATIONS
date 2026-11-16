import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { Faq } from "@/features/marketing/components/faq";
import { FinalCta } from "@/features/marketing/components/final-cta";
import { Hero } from "@/features/marketing/components/hero";
import { Lifecycle } from "@/features/marketing/components/lifecycle";
import { MakeIt } from "@/features/marketing/components/make-it";
import { Occasions } from "@/features/marketing/components/occasions";
import { Play } from "@/features/marketing/components/play";
import { Privacy } from "@/features/marketing/components/privacy";
import { MarketingShell } from "@/features/marketing/components/shell";
import { PricingTeaser } from "@/features/marketing/components/teaser";
import { marketingMessages } from "@/features/marketing/messages";
import { pageMetadata } from "@/features/marketing/site";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = marketingMessages(lang).meta;
  return pageMetadata(lang, "", t.homeTitle, t.homeDescription, true);
}

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <MarketingShell lang={lang} path="">
      <Hero lang={lang} />
      <Occasions lang={lang} />
      <Lifecycle lang={lang} />
      <Play lang={lang} />
      <Privacy lang={lang} />
      <MakeIt lang={lang} />
      <PricingTeaser lang={lang} />
      <Faq lang={lang} />
      <FinalCta lang={lang} />
    </MarketingShell>
  );
}
