import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { FinalCta } from "@/features/marketing/components/final-cta";
import { Phone } from "@/features/marketing/components/phone";
import { MarketingShell } from "@/features/marketing/components/shell";
import { marketingMessages } from "@/features/marketing/messages";
import { localHref, pageMetadata } from "@/features/marketing/site";

export async function generateMetadata({ params }: PageProps<"/[lang]/how-it-works">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = marketingMessages(lang).meta;
  return pageMetadata(lang, "/how-it-works", t.howTitle, t.howDescription);
}

export default async function HowItWorksPage({ params }: PageProps<"/[lang]/how-it-works">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const m = marketingMessages(lang);
  const t = m.howPage;
  return (
    <MarketingShell lang={lang} path="/how-it-works">
      <div className="bg-paper px-4 pb-20 pt-14 text-ink sm:px-6 md:pb-28 md:pt-20">
        <div className="mx-auto grid max-w-6xl gap-14 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-16">
          <div>
            <h1 className="mk-display text-[3rem] md:text-[4.5rem]">{t.title}</h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">{t.lead}</p>
            <ol className="mt-12 space-y-10">
              {t.steps.map((step, i) => (
                <li key={step.title} className="grid grid-cols-[3.5rem_1fr] gap-4 md:grid-cols-[4.5rem_1fr]">
                  <span aria-hidden="true" className="mk-num text-[3rem] text-primary md:text-[3.75rem]">
                    {i + 1}
                  </span>
                  <div className="border-t border-line pt-4">
                    <h2 className="text-xl font-semibold">{step.title}</h2>
                    <p className="mt-2 max-w-xl text-base leading-relaxed text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-14 rounded-[1.5rem] bg-highlight p-6 text-base font-medium text-ink">
              {t.aside}{" "}
              <Link href={localHref(lang, "/pricing")} className="font-bold underline underline-offset-4">
                {t.asideLink}
              </Link>
            </p>
          </div>
          <div className="relative hidden md:block">
            <div className="sticky top-28 flex items-start gap-5">
              <figure className="w-1/2">
                <Phone shot="details-ar" alt={m.alts.details} sizes="220px" />
                <figcaption className="mt-3 text-sm text-muted">{t.shots[0]}</figcaption>
              </figure>
              <figure className="mt-16 w-1/2">
                <Phone shot="rsvp-ar" alt={m.alts.rsvp} sizes="220px" />
                <figcaption className="mt-3 text-sm text-muted">{t.shots[1]}</figcaption>
              </figure>
            </div>
          </div>
        </div>
      </div>
      <FinalCta lang={lang} />
    </MarketingShell>
  );
}
