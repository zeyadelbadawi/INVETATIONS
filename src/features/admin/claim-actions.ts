"use server";

import { AccessError } from "@/lib/events/access";
import { adminDb } from "@/lib/supabase/admin";
import { hostDb } from "@/lib/supabase/server";
import { acceptClaim, previewClaim, type ClaimIdentity } from "./lib/claims";
import { runAdmin, type AdminResult } from "./lib/errors";

// The claim page posts the token it read from the URL fragment. Identity and
// the verified email come from the auth server (getUser), never from the form.
async function identity(): Promise<ClaimIdentity> {
  const db = await hostDb();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new AccessError("unauthenticated");
  return { userId: data.user.id, email: data.user.email, emailConfirmed: Boolean(data.user.email_confirmed_at) };
}

export async function previewClaimAction(token: string, lang: string): Promise<AdminResult<{ eventName: string }>> {
  return runAdmin("previewClaim", async () => {
    const who = await identity();
    return previewClaim(adminDb(), who, token, lang === "en" ? "en" : "ar");
  });
}

export async function acceptClaimAction(token: string): Promise<AdminResult<{ eventId: string }>> {
  return runAdmin("acceptClaim", async () => {
    const who = await identity();
    return acceptClaim(adminDb(), who, token);
  });
}
