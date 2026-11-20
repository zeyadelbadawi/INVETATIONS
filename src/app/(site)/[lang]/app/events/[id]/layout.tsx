import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, Notice } from "@/components/ui/card";
import { isLocale } from "@/i18n/config";
import { BackLink } from "@/features/host/components/back-link";
import { EventTabs } from "@/features/host/components/event-tabs";
import { statusTone } from "@/features/host/components/status-tone";
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
    <div className="flex flex-col gap-4">
      <div>
        <BackLink href={`/${lang}/app`}>{t.nav.allEvents}</BackLink>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold leading-tight [overflow-wrap:anywhere] sm:text-[1.75rem]">
            {eventName(event.content, lang, event.slug)}
          </h1>
          <Badge tone={statusTone(status)}>{t.statuses[status] ?? event.status}</Badge>
        </div>
      </div>
      {staffAccess.length > 0 ? (
        <Notice>
          {staffAccessMessages(lang).notice.replace(
            "{date}",
            new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium" }).format(
              new Date(Math.max(...staffAccess.map((g) => new Date(g.expiresAt).getTime()))),
            ),
          )}
        </Notice>
      ) : null}
      <EventTabs lang={lang} eventId={event.id} />
    </div>
  );
}

export default function EventLayout({ children, params }: LayoutProps<"/[lang]/app/events/[id]">) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <Suspense fallback={<div className="h-32 animate-pulse rounded-panel bg-line/50" aria-hidden="true" />}>
        <EventHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}
