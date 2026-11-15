"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { otherLocale, type Locale } from "@/i18n/config";

// Same page, other language. Reads the URL, so callers wrap it in <Suspense>.
export function LanguageSwitch({ lang, label }: { lang: Locale; label: string }) {
  const pathname = usePathname();
  const target = otherLocale(lang);
  const rest = pathname.split("/").slice(2).join("/");
  return (
    <Link
      href={`/${target}${rest ? `/${rest}` : ""}` as Route}
      lang={target}
      className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted hover:bg-surface"
    >
      {label}
    </Link>
  );
}
