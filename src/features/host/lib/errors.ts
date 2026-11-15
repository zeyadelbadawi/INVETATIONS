// Failures the host UI knows how to explain. Each code has a message in
// src/features/host/messages.ts (errors.*). Nothing here carries user data.
export type HostErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid"
  | "not_found"
  | "too_many_events"
  | "invalid_content"
  | "missing_required"
  | "no_plan"
  | "bad_status"
  | "personal_links_not_in_plan"
  | "guest_cap"
  | "too_many_rows"
  | "revoked"
  | "open_link_fixed"
  | "plan_unavailable"
  | "already_paid"
  | "no_pending_order"
  | "too_many_references"
  | "amount_mismatch"
  | "self_approval"
  | "duplicate_reference"
  | "not_pending"
  | "mfa_required"
  | "unknown";

export type ErrorDetail = Record<string, string | number | string[]>;

export class HostError extends Error {
  constructor(
    public readonly code: HostErrorCode,
    public readonly detail?: ErrorDetail,
  ) {
    super(code);
  }
}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: HostErrorCode; detail?: ErrorDetail };
