import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { isLocale, type Locale } from "@/i18n/config";
import { hostDb } from "@/lib/supabase/server";
import { PageSkeleton } from "@/features/host/components/app-header";
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
      <Card className="flex flex-col items-start gap-3">
        <h2 className="text-lg font-semibold">{t.dashboard.emptyTitle}</h2>
        <p className="text-muted">{t.dashboard.emptyBody}</p>
        <Link href={`/${lang}/app/new` as Route} className={buttonClass("primary")}>
          {t.dashboard.create}
        </Link>
      </Card>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => {
        const status = event.status as keyof typeof t.statuses;
        const kind = event.kind as keyof typeof t.kinds;
        return (
          <li key={event.id}>
            <Link
              href={`/${lang}/app/events/${event.id}/edit` as Route}
              className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-raised p-4 transition-colors hover:border-secondary"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{eventName(event.content, lang, event.slug)}</h2>
                <Badge tone={status === "published" ? "success" : status === "draft" ? "info" : "highlight"}>
                  {t.statuses[status] ?? event.status}
                </Badge>
              </div>
              <p className="text-sm text-muted">
                {t.kinds[kind] ?? event.kind} · {formatDate(event.starts_at, event.timezone, lang) ?? t.dashboard.noDate}
              </p>
              <span className="mt-auto text-sm font-medium text-secondary">{t.dashboard.open}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default async function DashboardPage({ params }: PageProps<"/[lang]/app">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = hostMessages(lang);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.dashboard.title}</h1>
        <Link href={`/${lang}/app/new` as Route} className={buttonClass("primary")}>
          {t.dashboard.create}
        </Link>
      </div>
      <Suspense fallback={<PageSkeleton label={t.common.loading} />}>
        <EventList lang={lang} />
      </Suspense>
    </div>
  );
}
