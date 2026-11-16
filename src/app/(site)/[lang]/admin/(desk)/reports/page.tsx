import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, Card } from "@/components/ui/card";
import { isLocale, type Locale } from "@/i18n/config";
import { adminDb } from "@/lib/supabase/admin";
import { TakedownButton } from "@/features/admin/components/desk-forms";
import { dateFormat, staffForPage } from "@/features/admin/components/staff-page";
import { listReportedPosts } from "@/features/admin/lib/reports";
import { adminMessages } from "@/features/admin/messages";
import { PageSkeleton } from "@/features/host/components/app-header";
import { fmt } from "@/features/host/lib/text";
import { hostMessages } from "@/features/host/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/admin/reports">): Promise<Metadata> {
  const { lang } = await params;
  return { title: adminMessages(isLocale(lang) ? lang : "ar").reports.title };
}

async function Queue({ lang }: { lang: Locale }) {
  const t = adminMessages(lang).reports;
  await staffForPage(lang, ["admin", "support"]);
  const posts = await listReportedPosts(adminDb());
  if (posts.length === 0) return <Card>{t.none}</Card>;
  const dates = dateFormat(lang);
  return (
    <ul className="flex flex-col gap-3">
      {posts.map((post) => (
        <li key={post.id}>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge>{t.media[post.kind] ?? post.kind}</Badge>
              {post.reportedCount > 0 ? <Badge tone="danger">{fmt(t.reports, { n: post.reportedCount })}</Badge> : <Badge tone="highlight">{t.pendingLong}</Badge>}
              <bdi dir="ltr" className="font-mono text-muted">
                {post.eventSlug}
              </bdi>
              <span className="text-muted">{dates.format(new Date(post.createdAt))}</span>
            </div>
            {/* Guest text is rendered as text (security C1). */}
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{post.body ?? t.noText}</p>
            <TakedownButton lang={lang} postId={post.id} />
          </Card>
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage({ params }: PageProps<"/[lang]/admin/reports">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = adminMessages(lang).reports;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="mt-1 text-muted">{t.lead}</p>
      </div>
      <Suspense fallback={<PageSkeleton label={hostMessages(lang).common.loading} />}>
        <Queue lang={lang} />
      </Suspense>
    </div>
  );
}
