import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { Billing, Extras, PlanCompare } from "@/features/marketing/components/pricing/compare";
import { Photo } from "@/features/marketing/components/photo";
import { MarketingShell } from "@/features/marketing/components/shell";
import { marketingMessages } from "@/features/marketing/messages";
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
  return (
    <MarketingShell lang={lang} path="/pricing">
      {/* A laid reception table, darkened behind the title: the event the one price is for. */}
      <div className="mk-backdrop mk-backdrop--table" aria-hidden="true">
        <Photo name="wedding-reception-table" alt="" sizes="100vw" eager />
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
