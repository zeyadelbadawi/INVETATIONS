import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { env } from "@/lib/env";

export type AdminClient = SupabaseClient<Database>;

let client: AdminClient | undefined;

// Service-key client. It bypasses row-level security, so it must only be used by
// code that has already authorised the caller (requireEventAccess, guest sessions,
// cron). Never import this from a client component.
export function adminDb(): AdminClient {
  if (!client) {
    const e = env();
    client = createClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
