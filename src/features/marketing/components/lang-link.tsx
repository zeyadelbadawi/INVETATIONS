import Link from "next/link";
import { otherLocale, type Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { localHref, type MarketingPath } from "../site";

// Same page in the other language. The path is known on the server, so the
// link is part of the static page (no client hook, no Suspense boundary).
export function LangLink({ lang, path, className = "" }: { lang: Locale; path: MarketingPath; className?: string }) {
  const t = marketingMessages(lang);
  const target = otherLocale(lang);
  return (
    <Link href={localHref(target, path)} hrefLang={target} lang={target} aria-label={t.nav.languageLabel} className={className}>
      {t.nav.language}
    </Link>
  );
}
