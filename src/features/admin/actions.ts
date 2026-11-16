"use server";

import { refresh, revalidateTag } from "next/cache";
import { brand } from "@/config/brand";
import { appOrigin } from "@/lib/env";
import { requireStaff } from "@/lib/events/access";
import { eventTag } from "@/lib/events/published";
import { adminDb } from "@/lib/supabase/admin";
import { hostDb } from "@/lib/supabase/server";
import { staffTakedown } from "@/features/control/lib";
import type { ActionResult } from "@/features/host/lib/errors";
import { run } from "@/features/host/lib/run";
import { createClaim } from "./lib/claims";
import { AdminError, runAdmin, type AdminResult } from "./lib/errors";
import { createEventOnBehalf } from "./lib/events";
import { createGrant, revokeGrant } from "./lib/grants";
import { cleanTotpCode, qrDataUri } from "./lib/mfa";
import { approveOrder } from "./lib/orders";
import { markOrderUnpaid } from "./lib/refunds";
import { requireStaffSession } from "./lib/session";

const ALL_STAFF = ["admin", "support", "designer"] as const;

function claimUrl(lang: string, token: string): string {
  const locale = lang === "en" ? "en" : "ar";
  // The token travels in the fragment: never sent to a server or written to a log.
  return `${appOrigin()}/${locale}/claim#${token}`;
}

// --- Orders ------------------------------------------------------------------

// Approval is for admins only; support can read the queue but not settle.
export async function approveOrderAction(orderId: string, reference: string, amountEgp: number): Promise<ActionResult> {
  return run("approveOrder", async () => {
    const staff = await requireStaffSession(["admin"]);
    await approveOrder(adminDb(), staff.userId, { orderId, reference: String(reference).trim(), amountEgp });
    refresh();
    return {};
  });
}

export async function markOrderUnpaidAction(orderId: string, status: "refunded" | "disputed"): Promise<AdminResult> {
  return runAdmin("markOrderUnpaid", async () => {
    const staff = await requireStaffSession(["admin"]);
    const { slug } = await markOrderUnpaid(adminDb(), staff.userId, orderId, status);
    revalidateTag(eventTag(slug), "max");
    refresh();
    return {};
  });
}

// --- Second factor (security O1) ---------------------------------------------
// These run before the session is aal2, so they check the staff role only.

export async function startMfaEnrolAction(): Promise<AdminResult<{ factorId: string; qr: string; secret: string }>> {
  return runAdmin("startMfaEnrol", async () => {
    await requireStaff([...ALL_STAFF]);
    const db = await hostDb();
    const { data: factors, error: listError } = await db.auth.mfa.listFactors();
    if (listError) throw new Error("factor lookup failed");
    if (factors.totp.length > 0) throw new AdminError("forbidden");
    // Abandoned set-ups are cleared so they do not pile up.
    for (const factor of factors.all) {
      if (factor.factor_type === "totp" && factor.status === "unverified") await db.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", issuer: brand.name.en });
    if (error || !data) throw new Error("enrolment failed");
    return { factorId: data.id, qr: qrDataUri(data.totp.qr_code), secret: data.totp.secret };
  });
}

async function verifyFactor(factorId: string, rawCode: unknown) {
  const code = cleanTotpCode(rawCode);
  if (!code) throw new AdminError("mfa_failed");
  const db = await hostDb();
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new AdminError("mfa_failed");
}

export async function finishMfaEnrolAction(factorId: string, code: string): Promise<AdminResult> {
  return runAdmin("finishMfaEnrol", async () => {
    await requireStaff([...ALL_STAFF]);
    if (typeof factorId !== "string" || !/^[0-9a-f-]{36}$/i.test(factorId)) throw new AdminError("invalid");
    const db = await hostDb();
    const { data } = await db.auth.mfa.listFactors();
    // Only the caller's own, still-unverified factor.
    if (!data?.all.some((f) => f.id === factorId && f.factor_type === "totp" && f.status === "unverified")) throw new AdminError("invalid");
    await verifyFactor(factorId, code);
    return {};
  });
}

export async function verifyMfaAction(code: string): Promise<AdminResult> {
  return runAdmin("verifyMfa", async () => {
    await requireStaff([...ALL_STAFF]);
    const db = await hostDb();
    const { data } = await db.auth.mfa.listFactors();
    const factor = data?.totp[0];
    if (!factor) throw new AdminError("invalid");
    await verifyFactor(factor.id, code);
    return {};
  });
}

// --- Grants (security A3) ----------------------------------------------------

export async function createGrantAction(eventId: string, staffId: string, capabilities: string[], days: number): Promise<AdminResult> {
  return runAdmin("createGrant", async () => {
    const staff = await requireStaffSession(["admin"]);
    await createGrant(adminDb(), staff.userId, { eventId, staffId, capabilities, days });
    refresh();
    return {};
  });
}

export async function revokeGrantAction(grantId: string): Promise<AdminResult> {
  return runAdmin("revokeGrant", async () => {
    const staff = await requireStaffSession(["admin"]);
    await revokeGrant(adminDb(), staff.userId, grantId);
    refresh();
    return {};
  });
}

// --- Done-for-you: events on a customer's behalf and claim links (A4) --------

export async function createEventOnBehalfAction(input: {
  kind: string;
  templateId: string;
  name: string;
  locale: string;
  email: string;
  lang: string;
}): Promise<AdminResult<{ eventId: string; claimUrl: string }>> {
  return runAdmin("createEventOnBehalf", async () => {
    const staff = await requireStaffSession(["admin"]);
    const db = adminDb();
    const event = await createEventOnBehalf(db, staff.userId, {
      kind: input.kind,
      templateId: input.templateId,
      name: input.name,
      locale: input.locale,
      email: input.email,
    });
    const claim = await createClaim(db, staff.userId, event.id, input.email);
    return { eventId: event.id, claimUrl: claimUrl(input.lang, claim.token) };
  });
}

export async function createClaimAction(eventId: string, email: string, lang: string): Promise<AdminResult<{ claimUrl: string }>> {
  return runAdmin("createClaim", async () => {
    const staff = await requireStaffSession(["admin"]);
    const claim = await createClaim(adminDb(), staff.userId, eventId, email);
    refresh();
    return { claimUrl: claimUrl(lang, claim.token) };
  });
}

// --- Takedown ----------------------------------------------------------------

export async function takedownAction(postId: string): Promise<AdminResult> {
  return runAdmin("takedown", async () => {
    const staff = await requireStaffSession(["admin", "support"]);
    if (typeof postId !== "string" || !/^[0-9a-f-]{36}$/i.test(postId)) throw new AdminError("invalid");
    const done = await staffTakedown(staff.userId, postId);
    if (!done) throw new AdminError("not_found");
    refresh();
    return {};
  });
}
