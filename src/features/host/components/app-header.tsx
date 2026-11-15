import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { brand } from "@/config/brand";
import type { Locale } from "@/i18n/config";
import { signOut } from "../actions/auth";
import { hostMessages } from "../messages";
import { LanguageSwitch } from "./language-switch";

// Static chrome: nothing here reads the session, so it is part of the shell.
export function AppHeader({ lang, home, badge }: { lang: Locale; home: "app" | "admin"; badge?: string }) {
  const t = hostMessages(lang);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-raised/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-2">
        <Link href={`/${lang}/${home}` as Route} className="flex min-h-11 items-center gap-2 text-xl font-bold text-primary">
          {brand.name[lang]}
          {badge ? <span className="rounded-full bg-highlight/30 px-2 py-0.5 text-xs font-medium text-fg">{badge}</span> : null}
        </Link>
        <div className="flex items-center gap-1">
          <Suspense fallback={null}>
            <LanguageSwitch lang={lang} label={t.common.switchLanguage} />
          </Suspense>
          <form action={signOut}>
            <input type="hidden" name="lang" value={lang} />
            <button type="submit" className={buttonClass("ghost", "sm")}>
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
      <div className="h-8 w-48 animate-pulse rounded-lg bg-line/60" />
      <div className="h-40 animate-pulse rounded-2xl bg-line/40" />
      <div className="h-40 animate-pulse rounded-2xl bg-line/40" />
    </div>
  );
}
