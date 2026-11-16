import type { Route } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { localHref, type MarketingPath } from "../site";
import { LangLink } from "./lang-link";
import { MobileMenu } from "./mobile-menu";

export function SiteHeader({ lang, path }: { lang: Locale; path: MarketingPath }) {
  const t = marketingMessages(lang);
  const nav: { href: Route; label: string; current?: boolean }[] = [
    { href: `${localHref(lang, "")}#occasions` as Route, label: t.nav.occasions },
    { href: localHref(lang, "/how-it-works"), label: t.nav.how, current: path === "/how-it-works" },
    { href: localHref(lang, "/pricing"), label: t.nav.pricing, current: path === "/pricing" },
    { href: `${localHref(lang, "")}#faq` as Route, label: t.nav.faq },
  ];
  const quiet =
    "min-h-11 items-center rounded-full px-3 text-[0.9375rem] font-medium text-paper/80 transition-colors hover:text-paper";
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--mk-ink-line)] bg-ink text-paper">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link
          href={localHref(lang, "")}
          className="mk-display me-auto inline-flex min-h-11 items-center text-[2.75rem] leading-none [&:lang(en)]:text-[2.125rem] text-paper md:me-6"
          aria-label={`${brand.name[lang]}, ${t.nav.home}`}
        >
          {brand.name[lang]}
        </Link>
        <nav aria-label={t.nav.main} className="hidden md:block md:me-auto">
          <ul className="flex items-center gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className={`${quiet} inline-flex aria-[current=page]:text-highlight`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <LangLink lang={lang} path={path} className={`${quiet} hidden sm:inline-flex`} />
        <Link href={localHref(lang, "/login")} className={`${quiet} hidden md:inline-flex`}>
          {t.nav.login}
        </Link>
        <Link
          href={localHref(lang, "/signup")}
          className="inline-flex min-h-11 items-center rounded-full bg-paper px-4 text-[0.9375rem] font-semibold text-ink transition-opacity hover:opacity-90"
        >
          <span className="sm:hidden">{t.nav.startShort}</span>
          <span className="hidden sm:inline">{t.nav.start}</span>
        </Link>
        <MobileMenu
          openLabel={t.nav.menu}
          closeLabel={t.nav.closeMenu}
          navLabel={t.nav.main}
          links={[
            ...nav.map(({ href, label }) => ({ href, label })),
            { href: localHref(lang, "/login"), label: t.nav.login },
            { href: localHref(lang, "/signup"), label: t.nav.signup },
          ]}
        >
          <LangLink lang={lang} path={path} className="inline-flex min-h-11 items-center text-base font-medium text-paper/80 hover:text-paper" />
        </MobileMenu>
      </div>
    </header>
  );
}
