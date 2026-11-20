import type { Route } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { localHref, type MarketingPath } from "../site";
import { HeaderScroll } from "./header-scroll";
import { LangLink } from "./lang-link";
import { MobileMenu } from "./mobile-menu";

// One element throughout: over the first scene its night band is transparent
// with a short scrim under it; it turns solid as the scene ends (--hp, 0…1).
export function SiteHeader({ lang, path, overScene }: { lang: Locale; path: MarketingPath; overScene: boolean }) {
  const t = marketingMessages(lang);
  const nav: { href: Route; label: string; current?: boolean }[] = [
    { href: `${localHref(lang, "")}#games` as Route, label: t.nav.games },
    { href: localHref(lang, "/how-it-works"), label: t.nav.how, current: path === "/how-it-works" },
    { href: localHref(lang, "/pricing"), label: t.nav.pricing, current: path === "/pricing" },
  ];
  return (
    <header className="mk-header" data-over={overScene ? "scene" : undefined}>
      {overScene ? (
        <>
          <HeaderScroll />
          <noscript>
            <style>{".mk-header[data-over]{--hp:1}"}</style>
          </noscript>
        </>
      ) : null}
      <div className="mk-header__bar">
        <Link href={localHref(lang, "")} className="mk-wordmark" aria-label={`${brand.name[lang]}, ${t.nav.home}`}>
          {brand.name[lang]}
        </Link>
        <nav aria-label={t.nav.main} className="mk-header__nav">
          <ul>
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={item.current ? "page" : undefined} className="mk-header__link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mk-header__end">
          <LangLink lang={lang} path={path} className="mk-header__link mk-hide-sm" />
          <Link href={localHref(lang, "/login")} className="mk-header__link mk-hide-md">
            {t.nav.login}
          </Link>
          <Link href={localHref(lang, "/signup")} className="mk-btn mk-btn--small">
            <span className="sm:hidden">{t.nav.startShort}</span>
            <span className="hidden sm:inline">{t.nav.start}</span>
          </Link>
          <MobileMenu
            openLabel={t.nav.menu}
            closeLabel={t.nav.closeMenu}
            navLabel={t.nav.main}
            links={[
              ...nav.map(({ href, label }) => ({ href, label })),
              { href: `${localHref(lang, "")}#faq` as Route, label: t.nav.faq },
              { href: localHref(lang, "/login"), label: t.nav.login },
              { href: localHref(lang, "/signup"), label: t.nav.signup },
            ]}
          >
            <LangLink lang={lang} path={path} className="mk-menu__lang" />
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}
