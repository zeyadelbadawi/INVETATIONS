import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { Faq } from "@/features/marketing/components/faq";
import { FinalCta } from "@/features/marketing/components/final-cta";
import { Extras, PaymentAndSoon, Plans } from "@/features/marketing/components/plans";
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
      <div className="bg-paper px-4 pb-20 pt-14 text-ink sm:px-6 md:pb-28 md:pt-20">
        <div className="mx-auto max-w-6xl">
          <h1 className="mk-display max-w-3xl text-[3rem] md:text-[4.5rem]">{t.title}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{t.lead}</p>
          <div className="mt-12">
            <Plans lang={lang} />
          </div>
          <div className="mt-5">
            <Extras lang={lang} />
          </div>
          <div className="mt-16">
            <PaymentAndSoon lang={lang} />
          </div>
        </div>
      </div>
      <Faq lang={lang} />
      <FinalCta lang={lang} />
    </MarketingShell>
  );
}
