import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge, PageTitle } from "@/components/ui/card";
import { isLocale, type Locale } from "@/i18n/config";
import { hostDb } from "@/lib/supabase/server";
import { PageSkeleton } from "@/features/host/components/app-header";
import { statusTone } from "@/features/host/components/status-tone";
import { eventName } from "@/features/host/lib/display";
import { userOrLogin } from "@/features/host/lib/page";
import { hostMessages } from "@/features/host/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/app">): Promise<Metadata> {
  const { lang } = await params;
  return { title: hostMessages(isLocale(lang) ? lang : "ar").dashboard.title };
}

function formatDate(iso: string | null, timeZone: string, lang: Locale): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { dateStyle: "long", timeZone }).format(new Date(iso));
  } catch {
    return null;
  }
}

// The host's own events, read with their session so row-level security decides
// what comes back.
async function EventList({ lang }: { lang: Locale }) {
  const t = hostMessages(lang);
  const userId = await userOrLogin(lang, `/${lang}/app`);
  const db = await hostDb();
  const { data } = await db
    .from("events")
    .select("id, slug, kind, status, content, starts_at, timezone, owner_id")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
  const events = data ?? [];

  if (events.length === 0) {
    return (
      <section aria-labelledby="empty-title" className="rounded-panel border border-line bg-raised p-6 sm:p-10">
        <h2 id="empty-title" className="font-display text-2xl font-bold text-fg sm:text-3xl">
          {t.dashboard.emptyTitle}
        </h2>
        <p className="mt-2 max-w-prose text-muted">{t.dashboard.emptyBody}</p>
        <ol className="mt-6 flex max-w-xl flex-col gap-3">
          {t.dashboard.emptySteps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span aria-hidden="true" className="w-5 shrink-0 font-semibold text-accent-ink tabular-nums">
                {(index + 1).toLocaleString(lang === "ar" ? "ar-EG" : "en")}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <Link href={`/${lang}/app/new` as Route} className={buttonClass("primary", "md", "mt-8")}>
          {t.dashboard.create}
        </Link>
      </section>
    );
  }

  return (
    <div className="overflow-hidden rounded-panel border border-line bg-raised">
      <table className="w-full border-collapse">
        <thead className="hidden border-b border-line text-sm text-muted sm:table-header-group">
          <tr>
            <th scope="col" className="px-5 py-3 text-start font-medium">
              {t.dashboard.colEvent}
            </th>
            <th scope="col" className="px-5 py-3 text-start font-medium">
              {t.dashboard.colKind}
            </th>
            <th scope="col" className="px-5 py-3 text-start font-medium">
              {t.dashboard.colDate}
            </th>
            <th scope="col" className="px-5 py-3 text-start font-medium">
              {t.dashboard.colStatus}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {events.map((event) => {
            const status = event.status as keyof typeof t.statuses;
            const kind = event.kind as keyof typeof t.kinds;
            const date = formatDate(event.starts_at, event.timezone, lang);
            return (
              <tr
                key={event.id}
                className="group relative flex flex-col gap-1 px-4 py-4 transition-colors duration-150 hover:bg-surface sm:table-row sm:p-0"
              >
                <td className="sm:px-5 sm:py-4">
                  {/* The link covers the whole row; the event name is its accessible text. */}
                  <Link
                    href={`/${lang}/app/events/${event.id}/edit` as Route}
                    className="text-[1.0625rem] font-semibold text-fg underline-offset-4 [overflow-wrap:anywhere] after:absolute after:inset-0 group-hover:underline"
                  >
                    {eventName(event.content, lang, event.slug)}
                  </Link>
                </td>
                <td className="text-sm text-muted sm:px-5 sm:py-4 sm:text-base sm:text-fg">
                  {t.kinds[kind] ?? event.kind}
                  <span className="tabular-nums sm:hidden"> · {date ?? t.dashboard.noDate}</span>
                </td>
                <td className={`hidden tabular-nums sm:table-cell sm:px-5 sm:py-4 ${date ? "" : "text-muted"}`}>
                  {date ?? t.dashboard.noDate}
                </td>
                <td className="sm:px-5 sm:py-4">
                  <Badge tone={statusTone(status)}>{t.statuses[status] ?? event.status}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function DashboardPage({ params }: PageProps<"/[lang]/app">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = hostMessages(lang);
  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title={t.dashboard.title}
        lead={t.dashboard.lead}
        action={
          <Link href={`/${lang}/app/new` as Route} className={buttonClass("primary")}>
            {t.dashboard.create}
          </Link>
        }
      />
      <Suspense fallback={<PageSkeleton label={t.common.loading} />}>
        <EventList lang={lang} />
      </Suspense>
    </div>
  );
}
