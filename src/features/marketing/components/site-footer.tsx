import type { Route } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { localHref, whatsappHref, type MarketingPath } from "../site";
import { LangLink } from "./lang-link";

export function SiteFooter({ lang, path }: { lang: Locale; path: MarketingPath }) {
  const t = marketingMessages(lang);
  const whatsapp = whatsappHref();
  const link = "inline-flex min-h-11 items-center text-paper/75 transition-colors hover:text-paper";
  const product: { href: Route; label: string }[] = [
    { href: `${localHref(lang, "")}#occasions` as Route, label: t.nav.occasions },
    { href: localHref(lang, "/how-it-works"), label: t.nav.how },
    { href: localHref(lang, "/pricing"), label: t.nav.pricing },
    { href: `${localHref(lang, "")}#faq` as Route, label: t.nav.faq },
  ];
  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <p className="mk-display text-5xl text-paper">{brand.name[lang]}</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-paper/70">{t.footer.madeFor}</p>
        </div>
        <nav aria-label={t.footer.product}>
          <h2 className="text-sm font-semibold text-highlight">{t.footer.product}</h2>
          <ul className="mt-2">
            {product.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={link}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t.footer.account}>
          <h2 className="text-sm font-semibold text-highlight">{t.footer.account}</h2>
          <ul className="mt-2">
            <li>
              <Link href={localHref(lang, "/login")} className={link}>
                {t.nav.login}
              </Link>
            </li>
            <li>
              <Link href={localHref(lang, "/signup")} className={link}>
                {t.nav.signup}
              </Link>
            </li>
            <li>
              <LangLink lang={lang} path={path} className={link} />
            </li>
          </ul>
        </nav>
        {whatsapp ? (
          <div>
            <h2 className="text-sm font-semibold text-highlight">{t.footer.contact}</h2>
            <ul className="mt-2">
              <li>
                <a href={whatsapp} rel="noopener noreferrer" target="_blank" className={link}>
                  {t.footer.whatsapp}
                </a>
              </li>
            </ul>
          </div>
        ) : null}
      </div>
      <div className="border-t border-[var(--mk-ink-line)]">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-paper/60 sm:px-6">
          © {brand.name[lang]}
        </p>
      </div>
    </footer>
  );
}
