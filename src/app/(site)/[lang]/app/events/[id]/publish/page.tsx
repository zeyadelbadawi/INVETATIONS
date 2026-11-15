import { notFound } from "next/navigation";
import { lang as rootLang } from "next/root-params";
import { Suspense } from "react";
import { parseContent } from "@/content/schema";
import { isLocale } from "@/i18n/config";
import { appOrigin } from "@/lib/env";
import { entitlementsSchema } from "@/lib/events/published";
import { adminDb } from "@/lib/supabase/admin";
import { hostDb } from "@/lib/supabase/server";
import { getTemplate } from "@/templates/registry";
import { PageSkeleton } from "@/features/host/components/app-header";
import { PublishPanel, type PlanView } from "@/features/host/components/publish-panel";
import { missingRequired } from "@/features/host/lib/events";
import { paymentState } from "@/features/host/lib/orders";
import { eventForPage } from "@/features/host/lib/page";
import { hostMessages } from "@/features/host/messages";

type Props = PageProps<"/[lang]/app/events/[id]/publish">;

const FEATURES = ["personal_links", "games", "share_cards", "voice", "photos", "reveal"] as const;

async function PublishLoader({ params }: Pick<Props, "params">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();
  const { actor, event } = await eventForPage(lang, id, "publish", "publish");

  // The catalogue is read with the host's own session; orders have no row-level
  // policy, so their state comes from the server-side function after the check above.
  const host = await hostDb();
  const [{ data: planRows }, payment] = await Promise.all([
    host.from("plans").select("id, name_ar, name_en, price_egp, entitlements, position").order("position"),
    paymentState(adminDb(), actor, event.id),
  ]);

  const plans: PlanView[] = [];
  for (const row of planRows ?? []) {
    const entitlements = entitlementsSchema.safeParse(row.entitlements);
    if (!entitlements.success) continue;
    plans.push({
      id: row.id,
      name: lang === "ar" ? row.name_ar : row.name_en,
      priceEgp: row.price_egp,
      maxGuests: entitlements.data.max_guests,
      features: FEATURES.filter((feature) => entitlements.data[feature]),
    });
  }

  const template = getTemplate(event.template_id, event.template_version);
  const missingKeys = template ? missingRequired(template, parseContent(event.content)) : [];
  const missing = missingKeys.map((key) => template?.fields.find((f) => f.key === key)?.label[lang] ?? key);

  return (
    <PublishPanel
      lang={lang}
      eventId={event.id}
      status={event.status}
      version={event.published_version}
      address={`${appOrigin()}/i/${event.slug}`}
      plans={plans}
      paidPlanId={payment.planId}
      pending={payment.pending ? { planId: payment.pending.planId, amountEgp: payment.pending.amountEgp, references: payment.pending.references } : null}
      missing={missing}
    />
  );
}

export default async function PublishPage({ params }: Props) {
  const l = await rootLang();
  return (
    <Suspense fallback={<PageSkeleton label={hostMessages(isLocale(l) ? l : "ar").common.loading} />}>
      <PublishLoader params={params} />
    </Suspense>
  );
}
