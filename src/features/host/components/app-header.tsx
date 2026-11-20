import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import type { Locale } from "@/i18n/config";
import { signOut } from "../actions/auth";
import { hostMessages } from "../messages";
import { LanguageSwitch } from "./language-switch";

const barLink =
  "inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-paper/75 transition-colors duration-150 hover:bg-paper/10 hover:text-paper";

// Static chrome: nothing here reads the session, so it is part of the shell.
// An ink bar that stays put above every working page; the area name sits next
// to the wordmark as plain text.
export function AppHeader({ lang, home, badge }: { lang: Locale; home: "app" | "admin"; badge?: string }) {
  const t = hostMessages(lang);
  return (
    <header className="sticky top-0 z-30 bg-ink text-paper">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/${lang}/${home}` as Route}
            className="flex min-h-11 items-center font-display text-xl font-bold text-paper"
          >
            {brand.name[lang]}
          </Link>
          {badge ? (
            <span className="border-s border-paper/25 ps-3 text-sm font-medium text-paper/75">{badge}</span>
          ) : (
            <Link href={`/${lang}/app` as Route} className={`${barLink.replace("inline-flex", "hidden sm:inline-flex")}`}>
              {t.nav.events}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Suspense fallback={null}>
            <LanguageSwitch lang={lang} label={t.common.switchLanguage} className={barLink} />
          </Suspense>
          <form action={signOut}>
            <input type="hidden" name="lang" value={lang} />
            <button type="submit" className={barLink}>
              {t.common.signOut}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="h-7 w-56 animate-pulse rounded-control bg-line" />
      <div className="h-36 animate-pulse rounded-panel bg-line/60" />
      <div className="h-36 animate-pulse rounded-panel bg-line/40" />
    </div>
  );
}
