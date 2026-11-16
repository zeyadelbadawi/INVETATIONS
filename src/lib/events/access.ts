import "server-only";
import { hostDb } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";

// What a caller wants to do with an event. Every host-side server action names
// one and passes through requireEventAccess (security A1, rule 11).
export type Capability =
  | "view"
  | "edit_content"
  | "manage_invitations"
  | "manage_play"
  | "moderate"
  | "publish"
  | "manage_reveal"
  | "export"
  | "manage_members"
  | "delete";

const MODERATOR: ReadonlySet<Capability> = new Set(["moderate"]);
// Staff grants never include reveal control, exports, deletion or member changes (security A3).
const GRANTABLE: ReadonlySet<Capability> = new Set(["view", "edit_content", "manage_invitations", "manage_play", "moderate"]);

export type Actor = { userId: string; kind: "owner" | "moderator" | "staff"; grantId: string | null };

export class AccessError extends Error {
  constructor(public readonly reason: "unauthenticated" | "forbidden") {
    super(reason);
  }
}

// Verified identity of the signed-in host (claims are verified by the auth server
// or by signature, never taken from the cookie as-is).
export async function currentUserId(): Promise<string | null> {
  return (await currentClaims())?.sub ?? null;
}

async function currentClaims(): Promise<{ sub: string; aal: unknown } | null> {
  const db = await hostDb();
  const { data } = await db.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? { sub, aal: data?.claims?.aal } : null;
}

// Staff acting on a customer's event must have passed their second factor
// (security O1). The development switch is never honoured in production.
function staffSecondFactorOk(aal: unknown): boolean {
  if (aal === "aal2") return true;
  return process.env.NODE_ENV !== "production" && process.env.STAFF_MFA_OPTIONAL === "1";
}

export async function requireUser(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new AccessError("unauthenticated");
  return id;
}

export async function requireEventAccess(eventId: string, capability: Capability): Promise<Actor> {
  const claims = await currentClaims();
  if (!claims) throw new AccessError("unauthenticated");
  const userId = claims.sub;
  const db = adminDb();

  const { data: event } = await db.from("events").select("owner_id").eq("id", eventId).maybeSingle();
  if (!event) throw new AccessError("forbidden");
  if (event.owner_id === userId) return { userId, kind: "owner", grantId: null };

  if (MODERATOR.has(capability)) {
    const { data: member } = await db
      .from("event_members")
      .select("role")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle();
    if (member) return { userId, kind: "moderator", grantId: null };
  }

  if (GRANTABLE.has(capability)) {
    // Expiry is evaluated by the database clock, not the app server's.
    const { data: grant } = await db
      .from("staff_grants")
      .select("id, capabilities")
      .eq("event_id", eventId)
      .eq("staff_id", userId)
      .is("revoked_at", null)
      .gt("expires_at", "now")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (grant && grant.capabilities.includes(capability) && staffSecondFactorOk(claims.aal)) {
      return { userId, kind: "staff", grantId: grant.id };
    }
  }

  throw new AccessError("forbidden");
}

export async function requireStaff(roles: ("support" | "designer" | "admin")[]): Promise<{ userId: string; role: string }> {
  const userId = await requireUser();
  const { data } = await adminDb().from("staff_roles").select("role").eq("user_id", userId).maybeSingle();
  if (!data || !(roles as string[]).includes(data.role)) throw new AccessError("forbidden");
  return { userId, role: data.role };
}
