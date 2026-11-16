import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { dbNow } from "./grants";

// Back-office takedown queue (technical design §11): posts guests reported, and
// posts left pending for more than a day, across all events. Shows the post
// and where it is — never guest phone numbers, never media bytes.

const STALE_MS = 24 * 3_600_000;

export type ReportedPost = {
  id: string;
  eventId: string;
  eventSlug: string;
  kind: string;
  body: string | null;
  status: string;
  reportedCount: number;
  createdAt: string;
};

export async function listReportedPosts(db: AdminClient): Promise<ReportedPost[]> {
  const now = await dbNow(db);
  const staleBefore = new Date(now.getTime() - STALE_MS).toISOString();
  const { data, error } = await db
    .from("wall_posts")
    .select("id, event_id, kind, body, status, reported_count, created_at")
    .is("removed_by_staff_at", null)
    .or(`reported_count.gt.0,and(status.eq.pending,created_at.lt.${staleBefore})`)
    .order("reported_count", { ascending: false })
    .order("created_at")
    .limit(200);
  if (error) throw new Error(`report queue failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: events } = await db
    .from("events")
    .select("id, slug")
    .in("id", [...new Set(rows.map((r) => r.event_id))]);
  const slugOf = new Map((events ?? []).map((e) => [e.id, e.slug]));
  return rows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    eventSlug: slugOf.get(r.event_id) ?? "",
    kind: r.kind,
    body: r.body,
    status: r.status,
    reportedCount: r.reported_count,
    createdAt: r.created_at,
  }));
}
