"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { hostMessages } from "../messages";

const SECTIONS = ["edit", "settings", "invitations", "publish"] as const;

export function EventTabs({ lang, eventId }: { lang: Locale; eventId: string }) {
  const t = hostMessages(lang).nav;
  const current = usePathname().split("/")[5] ?? "";
  return (
    <nav aria-label={t.eventSections} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {SECTIONS.map((section) => {
          const active = current === section;
          return (
            <li key={section}>
              <Link
                href={`/${lang}/app/events/${eventId}/${section}` as Route}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium ${
                  active ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg"
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
