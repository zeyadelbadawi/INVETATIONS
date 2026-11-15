import "server-only";
import { requireStaff } from "@/lib/events/access";
import { hostDb } from "@/lib/supabase/server";
import { HostError } from "@/features/host/lib/errors";

type StaffRole = "support" | "designer" | "admin";

// Staff pages and actions need a staff role AND a session verified with a
// second factor (security O1): the role row alone is not enough. The claim is
// read from the verified token, not from anything the browser states.
//
// Local development has no authenticator enrolled, so the second-factor check
// can be switched off there with STAFF_MFA_OPTIONAL=1. The switch is ignored in
// production builds.
export async function requireStaffSession(roles: StaffRole[]): Promise<{ userId: string; role: string }> {
  const staff = await requireStaff(roles);
  const db = await hostDb();
  const { data } = await db.auth.getClaims();
  const aal = (data?.claims as { aal?: unknown } | undefined)?.aal;
  const optional = process.env.NODE_ENV !== "production" && process.env.STAFF_MFA_OPTIONAL === "1";
  if (aal !== "aal2" && !optional) throw new HostError("mfa_required");
  return staff;
}
