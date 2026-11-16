import type { Route } from "next";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { adminMessages } from "../messages";

// Static: role checks happen in each page and action, not here.
export function StaffNav({ lang }: { lang: Locale }) {
  const t = adminMessages(lang).nav;
  const items: [string, string][] = [
    ["", t.orders],
    ["/events", t.events],
    ["/reports", t.reports],
    ["/assignments", t.assignments],
  ];
  return (
    <nav aria-label={t.label} className="mb-6 overflow-x-auto">
      <ul className="flex gap-1 border-b border-line">
        {items.map(([path, label]) => (
          <li key={path}>
            <Link
              href={`/${lang}/admin${path}` as Route}
              className="inline-flex min-h-11 items-center whitespace-nowrap px-3 text-sm font-medium text-muted hover:text-fg"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
