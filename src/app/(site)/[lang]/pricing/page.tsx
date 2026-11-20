import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { Billing, Extras, PlanCompare } from "@/features/marketing/components/pricing/compare";
import { MarketingShell } from "@/features/marketing/components/shell";
import { marketingMessages } from "@/features/marketing/messages";
import { sceneStill } from "@/features/marketing/scenes";
import { pageMetadata } from "@/features/marketing/site";

export async function generateMetadata({ params }: PageProps<"/[lang]/pricing">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = marketingMessages(lang).meta;
  return pageMetadata(lang, "/pricing", t.pricingTitle, t.pricingDescription);
}

export default async function PricingPage({ params }: PageProps<"/[lang]/pricing">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = marketingMessages(lang).pricingPage;
  const still = sceneStill("corporate.stage");
  return (
    <MarketingShell lang={lang} path="/pricing">
      <div className="mk-backdrop" aria-hidden="true">
        <picture>
          <source type="image/avif" srcSet={still.avif} />
          <img src={still.webp} alt="" width={1920} height={1080} decoding="async" fetchPriority="high" />
        </picture>
      </div>
      <div className="mk-wrap mk-pagehead mk-pagehead--over">
        <h1 className="mk-h1">{t.title}</h1>
        <p className="mk-lead mk-measure">{t.lead}</p>
      </div>
      <div className="mk-wrap mk-pricing">
        <PlanCompare lang={lang} />
        <Extras lang={lang} />
        <Billing lang={lang} />
      </div>
    </MarketingShell>
  );
}
