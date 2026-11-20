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
  const product: { href: Route; label: string }[] = [
    { href: `${localHref(lang, "")}#games` as Route, label: t.nav.games },
    { href: localHref(lang, "/how-it-works"), label: t.nav.how },
    { href: localHref(lang, "/pricing"), label: t.nav.pricing },
    { href: `${localHref(lang, "")}#faq` as Route, label: t.nav.faq },
  ];
  return (
    <footer className="mk-footer">
      <div className="mk-wrap mk-footer__grid">
        <div>
          <p className="mk-wordmark mk-wordmark--large">{brand.name[lang]}</p>
          <p className="mk-footer__about">{t.footer.madeFor}</p>
        </div>
        <nav aria-label={t.footer.product}>
          <h2 className="mk-footer__head">{t.footer.product}</h2>
          <ul>
            {product.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="mk-footer__link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t.footer.account}>
          <h2 className="mk-footer__head">{t.footer.account}</h2>
          <ul>
            <li>
              <Link href={localHref(lang, "/login")} className="mk-footer__link">
                {t.nav.login}
              </Link>
            </li>
            <li>
              <Link href={localHref(lang, "/signup")} className="mk-footer__link">
                {t.nav.signup}
              </Link>
            </li>
            <li>
              <LangLink lang={lang} path={path} className="mk-footer__link" />
            </li>
          </ul>
        </nav>
        {whatsapp ? (
          <div>
            <h2 className="mk-footer__head">{t.footer.contact}</h2>
            <ul>
              <li>
                <a href={whatsapp} rel="noopener noreferrer" target="_blank" className="mk-footer__link">
                  {t.footer.whatsapp}
                </a>
              </li>
            </ul>
          </div>
        ) : null}
      </div>
      <p className="mk-wrap mk-footer__legal">© {brand.name[lang]}</p>
    </footer>
  );
}
