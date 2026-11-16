import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { marketingFontClass } from "../fonts";
import { marketingMessages } from "../messages";
import type { MarketingPath } from "../site";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import "../marketing.css";

// Header, main landmark and footer shared by every marketing page.
export function MarketingShell({ lang, path, children }: { lang: Locale; path: MarketingPath; children: ReactNode }) {
  const t = marketingMessages(lang);
  return (
    <div className={`mk ${marketingFontClass} flex min-h-full flex-1 flex-col`}>
      <a
        href="#main"
        className="sr-only z-50 rounded-xl bg-paper px-4 py-3 font-semibold text-ink focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t.nav.skip}
      </a>
      <SiteHeader lang={lang} path={path} />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter lang={lang} path={path} />
    </div>
  );
}
