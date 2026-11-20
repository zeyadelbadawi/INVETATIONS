"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { otherLocale, type Locale } from "@/i18n/config";

const defaultClass =
  "inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-fg/[0.06] hover:text-fg";

// Same page, other language. Reads the URL, so callers wrap it in <Suspense>.
export function LanguageSwitch({ lang, label, className = defaultClass }: { lang: Locale; label: string; className?: string }) {
  const pathname = usePathname();
  const target = otherLocale(lang);
  const rest = pathname.split("/").slice(2).join("/");
  return (
    <Link href={`/${target}${rest ? `/${rest}` : ""}` as Route} lang={target} className={className}>
      {label}
    </Link>
  );
}
