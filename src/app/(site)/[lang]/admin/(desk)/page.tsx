import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isLocale, type Locale } from "@/i18n/config";
import { AccessError } from "@/lib/events/access";
import { adminDb } from "@/lib/supabase/admin";
import { ApproveForm } from "@/features/admin/components/approve-form";
import { FlashProvider } from "@/features/admin/components/flash";
import { dateFormat } from "@/features/admin/components/staff-page";
import { queryPendingOrders, QUEUE_PAGE_SIZE, type QueueFilter } from "@/features/admin/lib/orders";
import { requireStaffSession } from "@/features/admin/lib/session";
import { adminMessages } from "@/features/admin/messages";
import { PageSkeleton } from "@/features/host/components/app-header";
import { HostError } from "@/features/host/lib/errors";
import { fmt } from "@/features/host/lib/text";
import { hostMessages } from "@/features/host/messages";

type Props = PageProps<"/[lang]/admin">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return { title: adminMessages(isLocale(lang) ? lang : "ar").title };
}

const FILTERS: QueueFilter[] = ["all", "reference", "awaiting"];

function queueHref(lang: Locale, q: string, filter: QueueFilter, page = 1): Route {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/${lang}/admin${query ? `?${query}` : ""}` as Route;
}

async function OrdersQueue({ lang, searchParams }: { lang: Locale; searchParams: Props["searchParams"] }) {
  const t = adminMessages(lang);
  let staff: { userId: string; role: string };
  // The session check reads the clock; keep it at request time (Cache Components).
  await connection();
  try {
    staff = await requireStaffSession(["admin", "support"]);
  } catch (error) {
    if (error instanceof AccessError && error.reason === "unauthenticated") {
      redirect(`/${lang}/login` as Route);
    }
    // Designers have no queue: their page is "My assignments" (which is a 404 for non-staff).
    if (error instanceof AccessError) redirect(`/${lang}/admin/assignments` as Route);
    if (error instanceof HostError && error.code === "mfa_required") {
      return (
        <Notice tone="danger">
          <strong className="block">{t.mfaTitle}</strong>
          {t.mfaBody}
        </Notice>
      );
    }
    throw error;
  }

  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 120) : "";
  const filter = FILTERS.find((f) => f === query.filter) ?? "all";
  const requested = typeof query.page === "string" ? Number.parseInt(query.page, 10) : 1;
  const result = await queryPendingOrders(adminDb(), staff.userId, lang, staff.role, {
    q,
    filter,
    page: Number.isFinite(requested) ? requested : 1,
  });
  const dates = dateFormat(lang);
  const from = result.total === 0 ? 0 : (result.page - 1) * QUEUE_PAGE_SIZE + 1;
  const to = Math.min(result.total, result.page * QUEUE_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5">
      <form method="get" role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-md">
          <label htmlFor="order-q" className="text-sm font-medium">
            {t.searchLabel}
          </label>
          <Input id="order-q" name="q" type="search" defaultValue={q} placeholder={t.searchPlaceholder} maxLength={120} autoComplete="off" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass("secondary")}>
            {t.search}
          </button>
          {q ? (
            <Link href={queueHref(lang, "", filter)} className={buttonClass("ghost")}>
              {t.clearSearch}
            </Link>
          ) : null}
        </div>
      </form>

      <nav aria-label={t.filterLabel} className="-mx-1 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={queueHref(lang, q, f)}
            aria-current={filter === f ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium transition-colors duration-150 sm:min-h-9 ${
              filter === f ? "bg-ink text-paper" : "text-muted hover:bg-fg/[0.06] hover:text-fg"
            }`}
          >
            {t.filters[f]}
            {f === "reference" ? <span className="ms-1.5 tabular-nums">({result.waiting})</span> : null}
          </Link>
        ))}
      </nav>

      {result.total === 0 ? (
        <p className="rounded-panel border border-line bg-raised p-6 text-muted">{q || filter !== "all" ? t.noMatch : t.empty}</p>
      ) : (
        <>
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {fmt(t.showing, { from, to, total: result.total })}
          </p>
          <FlashProvider dismissLabel={t.dismiss}>
            <ul className="divide-y divide-line rounded-panel border border-line bg-raised">
              {result.orders.map((order) => (
                <li key={order.id} className="grid content-start gap-4 p-4 sm:p-6 lg:grid-cols-2 lg:gap-x-8">
                  <div className="min-w-0">
                    <p className="text-sm text-muted">
                      {t.orderNo.split("{ref}").map((part, index) =>
                        index === 0 ? (
                          part
                        ) : (
                          <span key={index}>
                            <bdi dir="ltr" className="font-mono">
                              {order.ref}
                            </bdi>
                            {part}
                          </span>
                        ),
                      )}
                      {order.references.length > 0 ? (
                        <>
                          {" · "}
                          <Badge tone="success">{t.hasReference}</Badge>
                        </>
                      ) : null}
                    </p>
                    {/* Customer text is rendered as text, after schema parsing (security C1). */}
                    <h2 className="mt-1 text-lg font-semibold [overflow-wrap:anywhere]">{order.eventName}</h2>
                    <p className="text-sm text-muted [overflow-wrap:anywhere]">
                      <bdi dir="ltr">{order.eventSlug}</bdi> · <bdi dir="ltr">{order.ownerEmail}</bdi>
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm tabular-nums sm:grid-cols-3 lg:col-start-1">
                    <div>
                      <dt className="text-muted">{t.plan}</dt>
                      <dd className="font-medium">{order.planName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t.amount}</dt>
                      <dd className="font-medium">{fmt(t.egp, { amount: order.amountEgp })}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t.created}</dt>
                      <dd className="font-medium">{dates.format(new Date(order.createdAt))}</dd>
                    </div>
                  </dl>
                  <div className="lg:col-start-1">
                    <h3 className="text-sm text-muted">{t.references}</h3>
                    {order.references.length === 0 ? (
                      <p className="text-sm">{t.noReferences}</p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-1">
                        {order.references.map((r) => (
                          <li key={`${r.reference}-${r.at}`} className="text-sm">
                            <bdi dir="ltr" className="font-mono font-medium">
                              {r.reference}
                            </bdi>
                            <span className="text-muted tabular-nums"> · {dates.format(new Date(r.at))}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:border-s lg:border-line lg:ps-8">
                    {order.conflicted ? (
                      <Notice>{t.conflicted}</Notice>
                    ) : staff.role === "admin" ? (
                      // Folded until needed, so a page of 25 orders stays scannable on a phone.
                      <details className="group" open={result.orders.length === 1}>
                        <summary className={buttonClass("secondary", "md", "cursor-pointer list-none group-open:mb-4 [&::-webkit-details-marker]:hidden")}>
                          {t.approve}
                        </summary>
                        <ApproveForm lang={lang} orderId={order.id} eventName={order.eventName} />
                      </details>
                    ) : (
                      <Notice>{t.viewOnly}</Notice>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </FlashProvider>
          {result.pages > 1 ? (
            <nav aria-label={t.pagination} className="flex flex-wrap items-center justify-between gap-3">
              {result.page > 1 ? (
                <Link href={queueHref(lang, q, filter, result.page - 1)} rel="prev" className={buttonClass("secondary", "sm")}>
                  {t.prev}
                </Link>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted tabular-nums">{fmt(t.pageOf, { page: result.page, pages: result.pages })}</p>
              {result.page < result.pages ? (
                <Link href={queueHref(lang, q, filter, result.page + 1)} rel="next" className={buttonClass("secondary", "sm")}>
                  {t.next}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

export default async function AdminPage({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = adminMessages(lang);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold leading-tight sm:text-[1.75rem]">{t.title}</h1>
        <p className="mt-1 text-muted">{t.lead}</p>
      </div>
      <Suspense fallback={<PageSkeleton label={hostMessages(lang).common.loading} />}>
        <OrdersQueue lang={lang} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
