import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { Corporate } from "@/features/marketing/components/home/corporate";
import { Doors } from "@/features/marketing/components/home/doors";
import { Games } from "@/features/marketing/components/home/games";
import { GuestSequence } from "@/features/marketing/components/home/guest";
import { Reveal } from "@/features/marketing/components/home/reveal";
import { SceneHead } from "@/features/marketing/components/home/scene-head";
import { Faq, Finale, Lifecycle, MakeIt, Prices, Privacy } from "@/features/marketing/components/home/sections";
import { MarketingShell } from "@/features/marketing/components/shell";
import { marketingMessages } from "@/features/marketing/messages";
import { loadMarketingScene, type MarketingScene } from "@/features/marketing/scenes";
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
  const [doors, reveal, stage] = await Promise.all([loadMarketingScene("wedding.doors"), loadMarketingScene("reveal.box"), loadMarketingScene("corporate.stage")]);
  const scenes = [doors, reveal, stage].filter((scene): scene is MarketingScene => scene !== null);
  return (
    <MarketingShell lang={lang} path="" overScene>
      <SceneHead scenes={scenes} />
      <Doors lang={lang} scene={doors} />
      <GuestSequence lang={lang} />
      <Reveal lang={lang} scene={reveal} />
      <Games lang={lang} />
      <Corporate lang={lang} scene={stage} />
      <Lifecycle lang={lang} />
      <Privacy lang={lang} />
      <MakeIt lang={lang} />
      <Prices lang={lang} />
      <Faq lang={lang} />
      <Finale lang={lang} />
    </MarketingShell>
  );
}
