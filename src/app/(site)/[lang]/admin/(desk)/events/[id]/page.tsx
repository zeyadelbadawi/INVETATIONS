import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { lang as rootLang } from "next/root-params";
import { Suspense } from "react";
import { Badge, Card, Notice, SectionHeading } from "@/components/ui/card";
import { isLocale, type Locale } from "@/i18n/config";
import { adminDb } from "@/lib/supabase/admin";
import { ClaimLinkForm, GrantForm, RevokeGrantButton, UnpaidButtons } from "@/features/admin/components/desk-forms";
import { dateFormat, staffForPage } from "@/features/admin/components/staff-page";
import { eventSummary } from "@/features/admin/lib/events";
import { listEventGrants, listGrantableStaff } from "@/features/admin/lib/grants";
import { adminMessages } from "@/features/admin/messages";
import { PageSkeleton } from "@/features/host/components/app-header";
import { fmt } from "@/features/host/lib/text";
import { hostMessages } from "@/features/host/messages";

type Props = PageProps<"/[lang]/admin/events/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return { title: adminMessages(isLocale(lang) ? lang : "ar").events.title };
}

async function Summary({ lang, params }: { lang: Locale; params: Props["params"] }) {
  const { id } = await params;
  const a = adminMessages(lang);
  const t = a.events;
  const host = hostMessages(lang);
  const staff = await staffForPage(lang, ["admin", "support"]);
  const isAdmin = staff.role === "admin";
  const db = adminDb();
  const summary = await eventSummary(db, id, staff.role, lang);
  if (!summary) notFound();
  const [grants, grantable] = await Promise.all([listEventGrants(db, summary.id), isAdmin ? listGrantableStaff(db) : Promise.resolve([])]);
  const dates = dateFormat(lang);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        {/* Customer text is rendered as text, after schema parsing (security C1). */}
        <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{summary.name}</h2>
        <p dir="ltr" className="font-mono text-sm text-muted text-start">
          {summary.slug}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">{t.status}</dt>
            <dd className="font-medium">{host.statuses[summary.status as keyof typeof host.statuses] ?? summary.status}</dd>
          </div>
          <div>
            <dt className="text-muted">{t.plan}</dt>
            <dd className="font-medium">{summary.planId ?? t.noPlan}</dd>
          </div>
          <div>
            <dt className="text-muted">{t.kind}</dt>
            <dd className="font-medium">{host.kinds[summary.kind as keyof typeof host.kinds] ?? summary.kind}</dd>
          </div>
          <div>
            <dt className="text-muted">{t.created}</dt>
            <dd className="font-medium">{dates.format(new Date(summary.createdAt))}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">{t.owner}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">{summary.holding ? t.holding : <bdi dir="ltr">{summary.ownerEmail}</bdi>}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <SectionHeading title={t.orders} />
        {summary.orders.length === 0 ? (
          <p className="text-sm text-muted">{t.noOrders}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {summary.orders.map((order) => (
              <li key={order.id} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={order.status === "paid" ? "success" : order.status === "pending" ? "info" : "highlight"}>{order.status}</Badge>
                  <span className="font-medium">{order.planId}</span>
                  <span>{fmt(a.egp, { amount: order.amountEgp })}</span>
                  <span className="text-muted">{dates.format(new Date(order.paidAt ?? order.createdAt))}</span>
                </div>
                {isAdmin && order.status === "paid" ? <UnpaidButtons lang={lang} orderId={order.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeading title={a.grants.title} lead={a.grants.lead} />
        {grants.length === 0 ? (
          <p className="text-sm text-muted">{a.grants.none}</p>
        ) : (
          <ul className="mb-6 flex flex-col gap-3">
            {grants.map((grant) => (
              <li key={grant.id} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={grant.status === "active" ? "success" : "info"}>{a.grants.status[grant.status]}</Badge>
                  <bdi dir="ltr" className="font-medium">
                    {grant.staffEmail ?? grant.staffId}
                  </bdi>
                  {grant.staffRole ? <span className="text-muted">({grant.staffRole})</span> : null}
                  <span className="text-muted">
                    {a.grants.expires} {dates.format(new Date(grant.expiresAt))}
                  </span>
                </div>
                <p className="text-sm">{grant.capabilities.map((c) => a.grants.caps[c] ?? c).join(lang === "ar" ? "، " : ", ")}</p>
                {isAdmin && grant.status === "active" ? <RevokeGrantButton lang={lang} grantId={grant.id} /> : null}
              </li>
            ))}
          </ul>
        )}
        {isAdmin ? (
          <GrantForm lang={lang} eventId={summary.id} staff={grantable.map((s) => ({ id: s.id, label: `${s.email ?? s.id} (${s.role})` }))} />
        ) : null}
      </Card>

      <Card>
        <SectionHeading title={a.claims.title} lead={a.claims.lead} />
        {summary.claims.length === 0 ? (
          <p className="mb-4 text-sm text-muted">{a.claims.none}</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2 text-sm">
            {summary.claims.map((claim) => (
              <li key={claim.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={claim.status === "claimed" ? "success" : "info"}>
                  {claim.status === "open" ? a.claims.statusOpen : claim.status === "claimed" ? a.claims.statusClaimed : a.claims.statusExpired}
                </Badge>
                <bdi dir="ltr">{claim.email}</bdi>
                <span className="text-muted">
                  {a.claims.expires} {dates.format(new Date(claim.expiresAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {isAdmin ? summary.holding ? <ClaimLinkForm lang={lang} eventId={summary.id} /> : <Notice>{a.claims.onlyHolding}</Notice> : null}
      </Card>
    </div>
  );
}

export default async function EventPage({ params }: Props) {
  const lang = await rootLang();
  if (!isLocale(lang)) notFound();
  const t = adminMessages(lang).events;
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/${lang}/admin/events` as Route} className="inline-flex min-h-11 items-center text-sm font-medium text-secondary">
        {t.back}
      </Link>
      <Suspense fallback={<PageSkeleton label={hostMessages(lang).common.loading} />}>
        <Summary lang={lang} params={params} />
      </Suspense>
    </div>
  );
}
