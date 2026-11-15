import { adminDb } from "@/lib/supabase/admin";

// Database time in milliseconds, for aligning countdowns. The reveal is released
// on the database clock, so that is the clock clients should follow.
export async function GET() {
  const { data, error } = await adminDb().rpc("server_now");
  const now = error || !data ? Date.now() : new Date(data).getTime();
  return Response.json({ now }, { headers: { "Cache-Control": "no-store" } });
}
