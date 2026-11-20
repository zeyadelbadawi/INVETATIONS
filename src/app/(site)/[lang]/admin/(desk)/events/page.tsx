import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, FormSection } from "@/components/ui/card";
import { controlClass } from "@/components/ui/input";
import { buttonClass } from "@/components/ui/button";
import { isLocale, type Locale } from "@/i18n/config";
import { adminDb } from "@/lib/supabase/admin";
import { listTemplates } from "@/templates/registry";
import { OnBehalfForm, type TemplateOption } from "@/features/admin/components/desk-forms";
import { dateFormat, staffForPage } from "@/features/admin/components/staff-page";
import { searchEvents } from "@/features/admin/lib/events";
import { planNames } from "@/features/admin/lib/orders";
import { adminMessages } from "@/features/admin/messages";
import { PageSkeleton } from "@/features/host/components/app-header";
import { hostMessages } from "@/features/host/messages";

type Props = PageProps<"/[lang]/admin/events">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return { title: adminMessages(isLocale(lang) ? lang : "ar").events.title };
}

async function Results({ lang, searchParams }: { lang: Locale; searchParams: Props["searchParams"] }) {
  const t = adminMessages(lang).events;
  const host = hostMessages(lang);
  const staff = await staffForPage(lang, ["admin", "support"]);
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.trim() : "";

  const templates: TemplateOption[] = listTemplates().map((tpl) => ({ id: tpl.id, kind: tpl.kind, name: tpl.name[lang] }));
  const unique = [...new Map(templates.map((tpl) => [tpl.id, tpl])).values()];

  let body = null;
  if (q.length > 0 && q.length < 3) body = <p className="text-muted">{t.tooShort}</p>;
  else if (q.length >= 3) {
    const [hits, plans] = await Promise.all([searchEvents(adminDb(), q, staff.role), planNames(adminDb(), lang)]);
    const dates = dateFormat(lang);
    body =
      hits.length === 0 ? (
        <p className="rounded-panel border border-line bg-raised p-6 text-muted">{t.noResults}</p>
      ) : (
        <ul className="divide-y divide-line rounded-panel border border-line bg-raised">
          {hits.map((hit) => (
            <li key={hit.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <p dir="ltr" className="font-mono font-medium text-start [overflow-wrap:anywhere]">
                    {hit.slug}
                  </p>
                  <p className="text-sm text-muted">
                    {host.kinds[hit.kind as keyof typeof host.kinds] ?? hit.kind} · {dates.format(new Date(hit.createdAt))} ·{" "}
                    {hit.holding ? t.holding : <bdi dir="ltr">{hit.ownerEmail}</bdi>}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4">
                    <Badge>{host.statuses[hit.status as keyof typeof host.statuses] ?? hit.status}</Badge>
                    <Badge tone={hit.planId ? "success" : "info"}>{hit.planId ? (plans.get(hit.planId) ?? hit.planId) : t.noPlan}</Badge>
                  </div>
                </div>
                <Link href={`/${lang}/admin/events/${hit.id}` as Route} className={buttonClass("secondary", "sm")}>
                  {t.open}
                </Link>
            </li>
          ))}
        </ul>
      );
  }

  return (
    <div className="flex flex-col gap-6">
      <form method="get" role="search" className="flex max-w-2xl flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="event-q" className="text-sm font-medium">
            {t.query}
          </label>
          <input
            id="event-q"
            name="q"
            dir="ltr"
            defaultValue={q}
            maxLength={320}
            autoComplete="off"
            className={controlClass}
          />
        </div>
        <button type="submit" className={buttonClass("primary")}>
          {t.search}
        </button>
      </form>
      {body}
      {staff.role === "admin" ? (
        <div className="mt-4 border-t border-line pt-10">
          <FormSection id="on-behalf" title={t.onBehalfTitle} lead={t.onBehalfLead}>
          <OnBehalfForm lang={lang} templates={unique} kinds={host.kinds} />
          </FormSection>
        </div>
      ) : null}
    </div>
  );
}

export default async function EventsPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = adminMessages(lang).events;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold leading-tight sm:text-[1.75rem]">{t.title}</h1>
        <p className="mt-1 text-muted">{t.lead}</p>
      </div>
      <Suspense fallback={<PageSkeleton label={hostMessages(lang).common.loading} />}>
        <Results lang={lang} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
