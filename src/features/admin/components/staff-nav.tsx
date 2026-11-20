"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { adminMessages } from "../messages";

// Static: role checks happen in each page and action, not here. Reads the URL
// for the current section, so callers wrap it in <Suspense>.
export function StaffNav({ lang }: { lang: Locale }) {
  const t = adminMessages(lang).nav;
  const pathname = usePathname() ?? "";
  const items: [string, string][] = [
    ["", t.orders],
    ["/events", t.events],
    ["/reports", t.reports],
    ["/assignments", t.assignments],
  ];
  const section = pathname.split("/").slice(3, 4)[0] ?? "";
  return (
    <nav aria-label={t.label} className="-mx-4 -mt-6 mb-8 overflow-x-auto border-b border-line px-4 sm:-mx-6 sm:-mt-8 sm:px-6">
      <ul className="-mb-px flex min-w-max gap-1 sm:gap-2">
        {items.map(([path, label]) => {
          const active = path === "" ? section === "" : `/${section}` === path;
          return (
            <li key={path}>
              <Link
                href={`/${lang}/admin${path}` as Route}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-12 items-center whitespace-nowrap border-b-2 px-3 text-[0.9375rem] font-medium transition-colors duration-150 sm:px-4 ${
                  active ? "border-fg text-fg" : "border-transparent text-muted hover:border-line hover:text-fg"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
