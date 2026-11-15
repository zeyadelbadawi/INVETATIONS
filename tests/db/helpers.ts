import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";

// Next skips .env.local when NODE_ENV=test, so load the local stack settings explicitly.
process.loadEnvFile(".env.local");

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin = createClient(url, secretKey, opts);
export const anonymous = () => createClient(url, publishableKey, opts);

export async function makeHost(label: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `${label}-${randomBytes(6).toString("hex")}@example.test`;
  const password = randomBytes(12).toString("hex");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, publishableKey, opts);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

export function slug(prefix: string) {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

export function hash(value: string) {
  return `\\x${createHash("sha256").update(value).digest("hex")}`;
}

export async function makeEvent(ownerId: string) {
  const { data, error } = await admin
    .from("events")
    .insert({ owner_id: ownerId, kind: "wedding", slug: slug("test"), template_id: "draft", template_version: 1 })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; slug: string };
}

export async function makeInvitation(eventId: string) {
  const { data, error } = await admin
    .from("invitations")
    .insert({ event_id: eventId, kind: "group", label: "Friends", code_hash: hash(randomBytes(16).toString("hex")) })
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}
