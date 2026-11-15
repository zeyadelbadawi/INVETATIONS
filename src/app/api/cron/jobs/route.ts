import { env } from "@/lib/env";
import { drainJobs } from "@/lib/jobs/runner";
import { safeEqualStrings } from "@/lib/security/tokens";
import "@/lib/jobs/register";

export const maxDuration = 60;

export async function GET(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqualStrings(token, env().CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await drainJobs(50);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
