// Staff grants (security A3, phase 6 gate): capabilities and expiry on database
// time, enforced by the real requireEventAccess.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, aal: "aal2" as string }));
vi.mock("server-only", () => ({}));
// requireEventAccess reads the signed-in user from the verified token; here the
// token is whoever the test says is signed in.
vi.mock("@/lib/supabase/server", () => ({
  hostDb: async () => ({
    auth: { getClaims: async () => ({ data: session.userId ? { claims: { sub: session.userId, aal: session.aal } } : null }) },
  }),
}));

import { admin, makeEvent, makeHost } from "../db/helpers";
import type { AdminClient } from "@/lib/supabase/admin";
import { requireEventAccess, type Capability } from "@/lib/events/access";
import {
  createGrant,
  dbNow,
  GRANTABLE_CAPABILITIES,
  listEventGrants,
  listMyAssignments,
  pendingStaffAccessNotice,
  revokeGrant,
} from "@/features/admin/lib/grants";
import { auditRows, makeStaff, outcome } from "./helpers";

const db = admin as unknown as AdminClient;

let boss: Awaited<ReturnType<typeof makeStaff>>;
let designer: Awaited<ReturnType<typeof makeStaff>>;
let support: Awaited<ReturnType<typeof makeStaff>>;
let otherAdmin: Awaited<ReturnType<typeof makeStaff>>;
let owner: Awaited<ReturnType<typeof makeHost>>;

async function as(userId: string, eventId: string, capability: Capability): Promise<string> {
  session.userId = userId;
  try {
    const actor = await requireEventAccess(eventId, capability);
    return actor.kind;
  } catch (error) {
    return error instanceof Error ? error.message : "error";
  } finally {
    session.userId = null;
  }
}

beforeAll(async () => {
  boss = await makeStaff("grant-admin", "admin");
  otherAdmin = await makeStaff("grant-admin2", "admin");
  designer = await makeStaff("grant-designer", "designer");
  support = await makeStaff("grant-support", "support");
  owner = await makeHost("grant-owner");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("staff grants", () => {
  it("grants exactly the chosen subset (plus view) and nothing else", async () => {
    const event = await makeEvent(owner.id);
    expect(await as(designer.id, event.id, "edit_content")).toBe("forbidden");

    const grant = await createGrant(db, boss.id, { eventId: event.id, staffId: designer.id, capabilities: ["edit_content"], days: 14 });
    expect(grant.capabilities).toEqual(["view", "edit_content"]);

    expect(await as(designer.id, event.id, "view")).toBe("staff");
    expect(await as(designer.id, event.id, "edit_content")).toBe("staff");
    for (const capability of ["manage_invitations", "manage_play", "moderate"] as const) {
      expect(await as(designer.id, event.id, capability)).toBe("forbidden");
    }
    // Never reachable through a grant, whatever is stored.
    for (const capability of ["publish", "manage_reveal", "export", "manage_members", "delete"] as const) {
      expect(await as(designer.id, event.id, capability)).toBe("forbidden");
    }
    // Another staff member, and another event, get nothing from it.
    expect(await as(support.id, event.id, "view")).toBe("forbidden");
    const other = await makeEvent(owner.id);
    expect(await as(designer.id, other.id, "view")).toBe("forbidden");
  });

  it("a grant is useless without the second factor (security O1)", async () => {
    const event = await makeEvent(owner.id);
    await createGrant(db, boss.id, { eventId: event.id, staffId: designer.id, capabilities: ["edit_content"], days: 7 });
    const optional = process.env.STAFF_MFA_OPTIONAL;
    process.env.STAFF_MFA_OPTIONAL = "";
    try {
      session.aal = "aal1";
      expect(await as(designer.id, event.id, "edit_content")).toBe("forbidden");
      // The owner is not staff and needs no second factor.
      expect(await as(owner.id, event.id, "edit_content")).toBe("owner");
      session.aal = "aal2";
      expect(await as(designer.id, event.id, "edit_content")).toBe("staff");
    } finally {
      session.aal = "aal2";
      process.env.STAFF_MFA_OPTIONAL = optional;
    }
  });

  it("refuses capabilities that are never grantable", async () => {
    const event = await makeEvent(owner.id);
    for (const capability of ["manage_reveal", "export", "delete", "manage_members", "publish", "payments", "anything"]) {
      expect(await outcome(createGrant(db, boss.id, { eventId: event.id, staffId: designer.id, capabilities: ["view", capability], days: 7 }))).toBe(
        "bad_capability",
      );
    }
    const { count } = await admin.from("staff_grants").select("id", { count: "exact", head: true }).eq("event_id", event.id);
    expect(count).toBe(0);
    expect([...GRANTABLE_CAPABILITIES].sort()).toEqual(["edit_content", "manage_invitations", "manage_play", "moderate", "view"]);
  });

  it("checks who grants, to whom and for how long", async () => {
    const event = await makeEvent(owner.id);
    const input = { eventId: event.id, staffId: designer.id, capabilities: ["view"], days: 14 };
    expect(await outcome(createGrant(db, support.id, input))).toBe("forbidden");
    expect(await outcome(createGrant(db, designer.id, input))).toBe("forbidden");
    expect(await outcome(createGrant(db, owner.id, input))).toBe("forbidden");
    expect(await outcome(createGrant(db, boss.id, { ...input, days: 31 }))).toBe("bad_duration");
    expect(await outcome(createGrant(db, boss.id, { ...input, days: 0 }))).toBe("bad_duration");
    expect(await outcome(createGrant(db, boss.id, { ...input, staffId: boss.id }))).toBe("self_grant");
    expect(await outcome(createGrant(db, boss.id, { ...input, staffId: otherAdmin.id }))).toBe("not_staff");
    expect(await outcome(createGrant(db, boss.id, { ...input, staffId: owner.id }))).toBe("not_staff");
    expect(await outcome(createGrant(db, boss.id, { ...input, capabilities: [] }))).toBe("invalid");
    expect(await outcome(createGrant(db, boss.id, { ...input, eventId: "00000000-0000-4000-8000-000000000000" }))).toBe("not_found");
  });

  it("sets expiry from the database clock, not the app server's", async () => {
    const event = await makeEvent(owner.id);
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2020-01-01T00:00:00Z") });
    const grant = await createGrant(db, boss.id, { eventId: event.id, staffId: designer.id, capabilities: ["view"], days: 30 });
    vi.useRealTimers();
    const now = await dbNow(db);
    const days = (new Date(grant.expiresAt).getTime() - now.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    // With the app clock far in the future, the grant still works: the database decides.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2099-01-01T00:00:00Z") });
    expect(await as(designer.id, event.id, "view")).toBe("staff");
  });

  it("an expired grant is denied and listed as expired", async () => {
    const event = await makeEvent(owner.id);
    const now = await dbNow(db);
    const { data } = await admin
      .from("staff_grants")
      .insert({
        event_id: event.id,
        staff_id: designer.id,
        capabilities: ["view", "edit_content"],
        created_by: boss.id,
        expires_at: new Date(now.getTime() - 1000).toISOString(),
      })
      .select("id")
      .single();
    // App clock in the past: the grant would look live to the app server.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2020-01-01T00:00:00Z") });
    expect(await as(designer.id, event.id, "edit_content")).toBe("forbidden");
    const list = await listEventGrants(db, event.id);
    expect(list.find((g) => g.id === data!.id)?.status).toBe("expired");
    expect(await pendingStaffAccessNotice(event.id, db)).toEqual([]);
    expect((await listMyAssignments(db, designer.id, "en")).some((a) => a.eventId === event.id)).toBe(false);
  });

  it("revoking ends access at once and is audited with the grant id", async () => {
    const event = await makeEvent(owner.id);
    const grant = await createGrant(db, boss.id, { eventId: event.id, staffId: support.id, capabilities: ["moderate"], days: 3 });
    expect(await as(support.id, event.id, "moderate")).toBe("staff");

    const notice = await pendingStaffAccessNotice(event.id, db);
    expect(notice).toHaveLength(1);
    expect(notice[0]).toMatchObject({ grantId: grant.id, role: "support" });
    expect(JSON.stringify(notice)).not.toContain(support.id);
    expect((await listMyAssignments(db, support.id, "en")).map((a) => a.grantId)).toContain(grant.id);

    expect(await outcome(revokeGrant(db, support.id, grant.id))).toBe("forbidden");
    await revokeGrant(db, boss.id, grant.id);
    expect(await as(support.id, event.id, "moderate")).toBe("forbidden");
    expect(await outcome(revokeGrant(db, boss.id, grant.id))).toBe("not_active");
    expect((await listEventGrants(db, event.id))[0].status).toBe("revoked");
    expect(await pendingStaffAccessNotice(event.id, db)).toEqual([]);

    expect(await auditRows("grant.created", { grantId: grant.id })).toHaveLength(1);
    expect(await auditRows("grant.owner_notified_pending", { grantId: grant.id })).toHaveLength(1);
    const revoked = await auditRows("grant.revoked", { grantId: grant.id });
    expect(revoked).toHaveLength(1);
    expect(revoked[0]).toMatchObject({ actor_id: boss.id, actor_kind: "staff", event_id: event.id });
  });
});
