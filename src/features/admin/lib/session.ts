import "server-only";
import { requireStaff } from "@/lib/events/access";
import { hostDb } from "@/lib/supabase/server";
import { HostError } from "@/features/host/lib/errors";
import { mfaOptional, mfaStep, type MfaStep } from "./mfa";

export type StaffRole = "support" | "designer" | "admin";

async function sessionAal(): Promise<unknown> {
  const db = await hostDb();
  const { data } = await db.auth.getClaims();
  return (data?.claims as { aal?: unknown } | undefined)?.aal;
}

// Staff pages and actions need a staff role AND a session verified with a
// second factor (security O1): the role row alone is not enough. The claim is
// read from the verified token, not from anything the browser states.
//
// Local development has no authenticator enrolled, so the second-factor check
// can be switched off there with STAFF_MFA_OPTIONAL=1. The switch is ignored in
// production builds.
export async function requireStaffSession(roles: StaffRole[]): Promise<{ userId: string; role: string }> {
  const staff = await requireStaff(roles);
  const aal = await sessionAal();
  if (aal !== "aal2" && !mfaOptional()) throw new HostError("mfa_required");
  return staff;
}

// Where a staff member must go before the back office opens: enrol an
// authenticator, verify with it, or nothing. Factors come from the auth server
// (getUser), the level from the verified token.
export async function staffMfaStep(): Promise<MfaStep> {
  const db = await hostDb();
  const aal = await sessionAal();
  if (aal === "aal2") return "allowed";
  const { data, error } = await db.auth.mfa.listFactors();
  if (error) throw new Error("factor lookup failed");
  return mfaStep({ factors: data.all, aal, optional: mfaOptional() });
}
