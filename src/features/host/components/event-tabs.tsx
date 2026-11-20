"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { hostMessages } from "../messages";

const SECTIONS = ["edit", "settings", "invitations", "play", "publish"] as const;

export function EventTabs({ lang, eventId }: { lang: Locale; eventId: string }) {
  const t = hostMessages(lang).nav;
  const current = usePathname().split("/")[5] ?? "";
  return (
    <nav aria-label={t.eventSections} className="-mx-4 overflow-x-auto border-b border-line px-4 sm:-mx-6 sm:px-6">
      <ul className="-mb-px flex min-w-max gap-1 sm:gap-2">
        {SECTIONS.map((section) => {
          const active = current === section;
          return (
            <li key={section}>
              <Link
                href={`/${lang}/app/events/${eventId}/${section}` as Route}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-12 items-center border-b-2 px-3 text-[0.9375rem] font-medium transition-colors duration-150 sm:px-4 ${
                  active ? "border-fg text-fg" : "border-transparent text-muted hover:border-line hover:text-fg"
                }`}
              >
                {t[section]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
