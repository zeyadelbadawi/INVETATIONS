import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { MotionProvider } from "@/scenes/MotionProvider";
import { marketingMessages } from "../messages";
import type { MarketingPath } from "../site";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import "@/features/motion/motion.css";
import "../marketing.css";

const HEADER_PX = 64;

// Header, main landmark and footer shared by every marketing page, on the night
// set, with the smooth-scroll engine of the scene player.
// `overScene`: the page opens on a scene, so the header starts transparent.
export function MarketingShell({ lang, path, overScene = false, children }: { lang: Locale; path: MarketingPath; overScene?: boolean; children: ReactNode }) {
  const t = marketingMessages(lang);
  return (
    <div className="mk theme-night flex min-h-full flex-1 flex-col">
      <a href="#main" className="mk-skip">
        {t.nav.skip}
      </a>
      <MotionProvider headerOffset={HEADER_PX}>
        <SiteHeader lang={lang} path={path} overScene={overScene} />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter lang={lang} path={path} />
      </MotionProvider>
    </div>
  );
}
