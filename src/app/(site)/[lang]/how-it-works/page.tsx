import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { Finale } from "@/features/marketing/components/home/sections";
import type { Shot } from "@/features/marketing/components/phone";
import { PhoneSequence } from "@/features/marketing/components/phone-sequence";
import { Photo } from "@/features/marketing/components/photo";
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
  const t = marketingMessages(lang).howPage;
  return (
    <MarketingShell lang={lang} path="/how-it-works">
      <div className="mk-wrap mk-pagehead mk-pagehead--photo">
        <div>
          <h1 className="mk-h1">{t.title}</h1>
          <p className="mk-lead mk-measure">{t.lead}</p>
        </div>
        <div className="mk-pagehead__photo">
          <Photo name="laptop-jasmine" alt={t.photoAlt} sizes="(min-width: 76rem) 31rem, (min-width: 900px) 40vw, 100vw" eager />
        </div>
      </div>
      <PhoneSequence
        lang={lang}
        id="steps"
        headingId="steps-title"
        heading={
          <h2 id="steps-title" className="mo-sr">
            {t.title}
          </h2>
        }
        steps={t.steps.map((step) => ({ ...step, shot: step.shot as Shot }))}
        lengthVh={300}
        after={
          <p className="mk-wrap mk-aside">
            {t.aside}{" "}
            <Link href={localHref(lang, "/pricing")} className="mk-textlink">
              {t.asideLink}
            </Link>
          </p>
        }
      />
      <Finale lang={lang} />
    </MarketingShell>
  );
}
