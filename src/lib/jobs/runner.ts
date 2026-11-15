import "server-only";
import { adminDb } from "@/lib/supabase/admin";

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

// Allow-list of job kinds (security rule 36). Payloads carry ids only; handlers
// reload and re-check state themselves.
const handlers = new Map<string, JobHandler>();

export function registerJob(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler);
}

const MAX_ATTEMPTS = 5;

export async function enqueue(kind: string, ref: string, payload: Record<string, string> = {}, runAt?: Date): Promise<void> {
  const { error } = await adminDb()
    .from("jobs")
    .upsert(
      { kind, ref, payload, run_at: (runAt ?? new Date()).toISOString() },
      { onConflict: "kind,ref", ignoreDuplicates: true },
    );
  if (error) throw new Error(`enqueue failed: ${error.message}`);
}

export async function drainJobs(limit = 20): Promise<{ done: number; failed: number }> {
  const db = adminDb();
  const { data: jobs, error } = await db.rpc("jobs_claim", { p_limit: limit, p_visibility_seconds: 120 });
  if (error) throw new Error(`jobs_claim failed: ${error.message}`);

  let done = 0;
  let failed = 0;
  for (const job of jobs ?? []) {
    const handler = handlers.get(job.kind);
    try {
      if (!handler) throw new Error(`unknown job kind: ${job.kind}`);
      await handler((job.payload ?? {}) as Record<string, unknown>);
      await db.from("jobs").update({ state: "done", locked_until: null, last_error: null }).eq("id", job.id);
      done++;
    } catch (err) {
      failed++;
      const dead = job.attempts >= MAX_ATTEMPTS || !handler;
      await db
        .from("jobs")
        .update({
          state: dead ? "dead" : "queued",
          locked_until: null,
          run_at: new Date(Date.now() + 30_000 * 2 ** job.attempts).toISOString(),
          last_error: err instanceof Error ? err.message.slice(0, 500) : "error",
        })
        .eq("id", job.id);
    }
  }
  return { done, failed };
}
