import { env } from "@/lib/env";
import { drainJobs, enqueue } from "@/lib/jobs/runner";
import { safeEqualStrings } from "@/lib/security/tokens";
import "@/lib/jobs/register";

export const maxDuration = 60;

function sweepRef(now = new Date()): string {
  return now.toISOString().slice(0, 13);
}

export async function GET(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqualStrings(token, env().CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  // The quarantine sweep runs at most once per hour: the job key is the hour,
  // and (kind, ref) is unique, so repeated cron calls add nothing (review F4).
  await enqueue("media.sweep", sweepRef());
  const result = await drainJobs(50);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
