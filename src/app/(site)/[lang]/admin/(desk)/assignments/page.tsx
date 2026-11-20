import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { isLocale, type Locale } from "@/i18n/config";
import { adminDb } from "@/lib/supabase/admin";
import { dateFormat, staffForPage } from "@/features/admin/components/staff-page";
import { listMyAssignments } from "@/features/admin/lib/grants";
import { adminMessages } from "@/features/admin/messages";
import { PageSkeleton } from "@/features/host/components/app-header";
import { fmt } from "@/features/host/lib/text";
import { hostMessages } from "@/features/host/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/admin/assignments">): Promise<Metadata> {
  const { lang } = await params;
  return { title: adminMessages(isLocale(lang) ? lang : "ar").assignments.title };
}

async function List({ lang }: { lang: Locale }) {
  const a = adminMessages(lang);
  const t = a.assignments;
  const staff = await staffForPage(lang, ["admin", "support", "designer"]);
  const items = await listMyAssignments(adminDb(), staff.userId, lang);
  if (items.length === 0) return <p className="rounded-panel border border-line bg-raised p-6 text-muted">{t.none}</p>;
  const dates = dateFormat(lang);
  return (
    <ul className="divide-y divide-line rounded-panel border border-line bg-raised">
      {items.map((item) => (
        <li key={item.grantId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 className="font-semibold [overflow-wrap:anywhere]">{item.eventName}</h2>
              <p className="text-sm text-muted">{fmt(t.until, { date: dates.format(new Date(item.expiresAt)) })}</p>
              <p className="text-sm">{item.capabilities.map((c) => a.grants.caps[c] ?? c).join(lang === "ar" ? "، " : ", ")}</p>
            </div>
            <Link href={`/${lang}/app/events/${item.eventId}/edit` as Route} className={buttonClass("primary", "sm")}>
              {t.edit}
            </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function AssignmentsPage({ params }: PageProps<"/[lang]/admin/assignments">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = adminMessages(lang).assignments;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold leading-tight sm:text-[1.75rem]">{t.title}</h1>
        <p className="mt-1 text-muted">{t.lead}</p>
      </div>
      <Suspense fallback={<PageSkeleton label={hostMessages(lang).common.loading} />}>
        <List lang={lang} />
      </Suspense>
    </div>
  );
}
