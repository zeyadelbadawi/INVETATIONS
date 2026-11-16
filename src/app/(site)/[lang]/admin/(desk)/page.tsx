import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, Notice } from "@/components/ui/card";
import { isLocale, type Locale } from "@/i18n/config";
import { AccessError } from "@/lib/events/access";
import { adminDb } from "@/lib/supabase/admin";
import { ApproveForm } from "@/features/admin/components/approve-form";
import { listPendingOrders } from "@/features/admin/lib/orders";
import { requireStaffSession } from "@/features/admin/lib/session";
import { adminMessages } from "@/features/admin/messages";
import { PageSkeleton } from "@/features/host/components/app-header";
import { HostError } from "@/features/host/lib/errors";
import { fmt } from "@/features/host/lib/text";
import { hostMessages } from "@/features/host/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/admin">): Promise<Metadata> {
  const { lang } = await params;
  return { title: adminMessages(isLocale(lang) ? lang : "ar").title };
}

async function OrdersQueue({ lang }: { lang: Locale }) {
  const t = adminMessages(lang);
  let staff: { userId: string; role: string };
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

  const orders = await listPendingOrders(adminDb(), staff.userId, lang);
  if (orders.length === 0) return <Card>{t.empty}</Card>;
  const dates = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" });

  return (
    <ul className="flex flex-col gap-4">
      {orders.map((order) => (
        <li key={order.id}>
          <Card className="flex flex-col gap-4">
            <div>
              {/* Customer text is rendered as text, after schema parsing (security C1). */}
              <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{order.eventName}</h2>
              <p dir="ltr" className="text-sm text-muted text-start">
                {order.eventSlug}
              </p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">{t.plan}</dt>
                <dd className="font-medium">{order.planId}</dd>
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
            <div>
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
                      <span className="text-muted"> · {dates.format(new Date(r.at))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {order.conflicted ? (
              <Notice>{t.conflicted}</Notice>
            ) : staff.role === "admin" ? (
              <ApproveForm lang={lang} orderId={order.id} />
            ) : (
              <Notice>{t.viewOnly}</Notice>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminPage({ params }: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = adminMessages(lang);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="mt-1 text-muted">{t.lead}</p>
      </div>
      <Suspense fallback={<PageSkeleton label={hostMessages(lang).common.loading} />}>
        <OrdersQueue lang={lang} />
      </Suspense>
    </div>
  );
}
