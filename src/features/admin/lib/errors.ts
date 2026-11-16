import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AccessError } from "@/lib/events/access";
import { HostError } from "@/features/host/lib/errors";

// Failures the back office (and the claim page) can explain. Each code has a
// message in src/features/admin/messages.ts (errors.*). Nothing here carries
// user data.
export type AdminErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "mfa_required"
  | "invalid"
  | "not_found"
  | "not_staff"
  | "self_grant"
  | "bad_capability"
  | "bad_duration"
  | "not_active"
  | "holding_full"
  | "claim_unavailable"
  | "claim_wrong_email"
  | "email_unverified"
  | "not_paid"
  | "mfa_failed"
  | "already_paid"
  | "self_approval"
  | "duplicate_reference"
  | "amount_mismatch"
  | "not_pending"
  | "unknown";

export class AdminError extends Error {
  constructor(public readonly code: AdminErrorCode) {
    super(code);
  }
}

export type AdminResult<T = object> = ({ ok: true } & T) | { ok: false; error: AdminErrorCode };

const HOST_CODES: ReadonlySet<string> = new Set([
  "forbidden",
  "invalid",
  "not_found",
  "mfa_required",
  "already_paid",
  "self_approval",
  "duplicate_reference",
  "amount_mismatch",
  "not_pending",
]);

// Same contract as the host runner: explainable failures become a result, the
// rest is logged by name only (security rule 40).
export async function runAdmin<T extends object>(name: string, fn: () => Promise<T>): Promise<AdminResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AdminError) return { ok: false, error: error.code };
    if (error instanceof AccessError) return { ok: false, error: error.reason };
    if (error instanceof HostError && HOST_CODES.has(error.code)) return { ok: false, error: error.code as AdminErrorCode };
    console.error(`[admin action] ${name} failed: ${error instanceof Error ? error.name : "unknown error"}`);
    return { ok: false, error: "unknown" };
  }
}
