import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/card";
import { isLocale } from "@/i18n/config";
import { EventTabs } from "@/features/host/components/event-tabs";
import { eventName } from "@/features/host/lib/display";
import { eventForPage } from "@/features/host/lib/page";
import { hostMessages } from "@/features/host/messages";
import { pendingStaffAccessNotice } from "@/features/admin/lib/grants";
import { staffAccessMessages } from "@/features/host/messages-staff";

type Params = LayoutProps<"/[lang]/app/events/[id]">["params"];

// Name, status and section tabs. Reads the URL and the session, so it streams
// in behind the boundary while the page below does its own check.
async function EventHeader({ params }: { params: Params }) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();
  const t = hostMessages(lang);
  const { event, actor } = await eventForPage(lang, id, "view", "edit");
  // The owner always sees when our staff can open this event (security A3).
  const staffAccess = actor.kind === "owner" ? await pendingStaffAccessNotice(event.id) : [];
  const status = event.status as keyof typeof t.statuses;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Link href={`/${lang}/app` as Route} className="inline-flex min-h-11 items-center text-sm font-medium text-secondary">
          {t.nav.allEvents}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">{eventName(event.content, lang, event.slug)}</h1>
          <Badge tone={status === "published" ? "success" : status === "draft" ? "info" : "highlight"}>
            {t.statuses[status] ?? event.status}
          </Badge>
        </div>
      </div>
      {staffAccess.length > 0 ? (
        <p role="status" className="rounded-xl border border-highlight/60 bg-highlight/15 px-4 py-3 text-sm">
          {staffAccessMessages(lang).notice.replace(
            "{date}",
            new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium" }).format(
              new Date(Math.max(...staffAccess.map((g) => new Date(g.expiresAt).getTime()))),
            ),
          )}
        </p>
      ) : null}
      <EventTabs lang={lang} eventId={event.id} />
    </div>
  );
}

export default function EventLayout({ children, params }: LayoutProps<"/[lang]/app/events/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="h-28 animate-pulse rounded-2xl bg-line/40" aria-hidden="true" />}>
        <EventHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}
