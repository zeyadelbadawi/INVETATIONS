// Done-for-you hand-over (security A4, phase 6 gate): the claim link is bound
// to the customer's verified email, expires on database time, is single-use
// under a race, and only its hash is stored.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createHash, randomBytes } from "node:crypto";
import { admin, anonymous, makeEvent, makeHost } from "../db/helpers";
import type { AdminClient } from "@/lib/supabase/admin";
import { acceptClaim, claimTokenHash, createClaim, previewClaim } from "@/features/admin/lib/claims";
import { createEventOnBehalf, isHoldingAccount } from "@/features/admin/lib/events";
import { auditRows, makeStaff, outcome } from "./helpers";

const db = admin as unknown as AdminClient;

let boss: Awaited<ReturnType<typeof makeStaff>>;
let support: Awaited<ReturnType<typeof makeStaff>>;

async function customer(label: string, confirmed = true) {
  const host = await makeHost(label);
  const { data } = await admin.auth.admin.getUserById(host.id);
  return { id: host.id, userId: host.id, email: data.user!.email!, emailConfirmed: confirmed };
}

async function heldEvent(email: string) {
  return createEventOnBehalf(db, boss.id, { kind: "wedding", templateId: "wedding-draft", name: "Mona & Karim", locale: "ar", email });
}

async function ownerOf(eventId: string) {
  const { data } = await admin.from("events").select("owner_id").eq("id", eventId).single();
  return data!.owner_id;
}

beforeAll(async () => {
  boss = await makeStaff("claim-admin", "admin");
  support = await makeStaff("claim-support", "support");
});

describe("events made on a customer's behalf", () => {
  it("are owned by a holding account that can never sign in", async () => {
    const a = await heldEvent("someone@example.test");
    const b = await heldEvent("someone-else@example.test");
    const holding = await ownerOf(a.id);
    // Same holding account unless that one just reached the per-account event cap.
    for (const owner of [holding, await ownerOf(b.id)]) {
      expect(await isHoldingAccount(db, owner)).toBe(true);
      const { data: recorded } = await admin.from("holding_accounts").select("user_id").eq("user_id", owner);
      expect(recorded).toHaveLength(1);
    }
    const { data } = await admin.auth.admin.getUserById(holding);
    expect(data.user!.email).toMatch(/^holding-[0-9a-f]+@no-reply\.invalid$/);
    expect(data.user!.app_metadata.holding).toBe(true);
    expect(new Date(data.user!.banned_until!).getTime()).toBeGreaterThan(Date.now() + 50 * 365 * 86_400_000);
    expect(await auditRows("event.created_on_behalf", { eventId: a.id })).toHaveLength(1);
  });

  // Review F1: anyone can sign up with an address that looks like a holding
  // account. Such an account must never be handed customers' events.
  it("never uses an account that merely has a holding-style email", async () => {
    const squatEmails = Array.from({ length: 3 }, (_, i) => `holding-${i + 1}${randomBytes(4).toString("hex")}@no-reply.invalid`);
    const squatters: string[] = [];
    for (const email of squatEmails) {
      // Public sign-up straight against the auth server (not through our action).
      const { error } = await anonymous().auth.signUp({ email, password: "Squatter-pass-123" });
      expect(error).toBeNull();
      const { data: found } = await admin.rpc("staff_user_id_by_email", { p_email: email });
      if (typeof found === "string") squatters.push(found);
    }
    expect(squatters.length).toBeGreaterThan(0);
    for (const id of squatters) expect(await isHoldingAccount(db, id)).toBe(false);

    const made = await heldEvent("victim@example.test");
    const owner = await ownerOf(made.id);
    expect(squatters).not.toContain(owner);
    expect(await isHoldingAccount(db, owner)).toBe(true);

    // Even recorded by mistake, an account the auth server does not report as a
    // banned server-made holding account is refused.
    const squatter = squatters[0];
    await admin.from("holding_accounts").insert({ user_id: squatter });
    expect(await isHoldingAccount(db, squatter)).toBe(false);
    const squatEvent = await makeEvent(squatter);
    expect(await outcome(createClaim(db, boss.id, squatEvent.id, "x@example.test"))).toBe("forbidden");
    await admin.from("holding_accounts").delete().eq("user_id", squatter);

    // A recorded holding account that has been unbanned is refused too.
    await admin.auth.admin.updateUserById(owner, { ban_duration: "none" });
    try {
      expect(await isHoldingAccount(db, owner)).toBe(false);
      expect(await outcome(createClaim(db, boss.id, made.id, "victim@example.test"))).toBe("forbidden");
    } finally {
      await admin.auth.admin.updateUserById(owner, { ban_duration: "876000h" });
    }
    await admin.from("events").delete().eq("id", squatEvent.id);
    for (const id of squatters) await admin.auth.admin.deleteUser(id);
  });

  it("the claim transfer itself refuses an event whose owner is not a recorded holding account", async () => {
    const who = await customer("claim-db-guard");
    const event = await heldEvent(who.email);
    const { token } = await createClaim(db, boss.id, event.id, who.email);
    const real = await makeHost("claim-db-guard-owner");
    // The event moved to a real customer after the link was made.
    await admin.from("events").update({ owner_id: real.id }).eq("id", event.id);
    const { data } = await admin.rpc("claim_event", { p_token_hash: claimTokenHash(token), p_user_id: who.userId, p_email_lower: who.email.toLowerCase() });
    expect(data).toEqual([]);
    expect(await outcome(acceptClaim(db, who, token))).toBe("claim_unavailable");
    expect(await ownerOf(event.id)).toBe(real.id);
  });

  it("only admins create them", async () => {
    expect(
      await outcome(createEventOnBehalf(db, support.id, { kind: "wedding", templateId: "wedding-draft", name: "X", locale: "ar", email: "a@example.test" })),
    ).toBe("forbidden");
  });
});

describe("claim links", () => {
  it("stores only the hash and hands the event to the verified email, once", async () => {
    const who = await customer("claimer");
    const event = await heldEvent(who.email);
    const { token, claimId } = await createClaim(db, boss.id, event.id, who.email.toUpperCase());
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const { data: row } = await admin.from("event_claims").select("*").eq("id", claimId).single();
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row!.token_hash).toBe(`\\x${createHash("sha256").update(token).digest("hex")}`);
    expect(row!.email_lower).toBe(who.email.toLowerCase());
    const days = (new Date(row!.expires_at).getTime() - new Date(row!.created_at).getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7, 3);
    const audits = await auditRows("claim.created", { eventId: event.id });
    expect(JSON.stringify(audits)).not.toContain(token);

    expect(await previewClaim(db, who, token, "en")).toEqual({ eventName: "Mona & Karim" });
    expect(await acceptClaim(db, who, token)).toEqual({ eventId: event.id });
    expect(await ownerOf(event.id)).toBe(who.id);
    expect(await outcome(acceptClaim(db, who, token))).toBe("claim_unavailable");
    expect(await outcome(previewClaim(db, who, token, "en"))).toBe("claim_unavailable");
    expect(await auditRows("claim.accepted", { eventId: event.id })).toHaveLength(1);
  });

  it("refuses a different or unverified email", async () => {
    const who = await customer("claim-right");
    const intruder = await customer("claim-wrong");
    const event = await heldEvent(who.email);
    const { token } = await createClaim(db, boss.id, event.id, who.email);
    expect(await outcome(previewClaim(db, intruder, token, "en"))).toBe("claim_wrong_email");
    expect(await outcome(acceptClaim(db, intruder, token))).toBe("claim_wrong_email");
    expect(await outcome(acceptClaim(db, { ...who, emailConfirmed: false }, token))).toBe("email_unverified");
    expect(await outcome(acceptClaim(db, { ...who, email: null }, token))).toBe("email_unverified");
    expect(await ownerOf(event.id)).not.toBe(intruder.id);
    expect(await ownerOf(event.id)).not.toBe(who.id);
  });

  it("refuses an expired link (database time)", async () => {
    const who = await customer("claim-late");
    const event = await heldEvent(who.email);
    const { token, claimId } = await createClaim(db, boss.id, event.id, who.email);
    await admin.from("event_claims").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", claimId);
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2020-01-01T00:00:00Z") });
    try {
      expect(await outcome(acceptClaim(db, who, token))).toBe("claim_unavailable");
      expect(await outcome(previewClaim(db, who, token, "en"))).toBe("claim_unavailable");
    } finally {
      vi.useRealTimers();
    }
    expect(await ownerOf(event.id)).not.toBe(who.id);
  });

  it("a new link replaces the old one", async () => {
    const who = await customer("claim-reissue");
    const event = await heldEvent(who.email);
    const first = await createClaim(db, boss.id, event.id, who.email);
    const second = await createClaim(db, boss.id, event.id, who.email);
    expect(await outcome(acceptClaim(db, who, first.token))).toBe("claim_unavailable");
    expect(await acceptClaim(db, who, second.token)).toEqual({ eventId: event.id });
  });

  it("concurrent claims transfer exactly once", async () => {
    const who = await customer("claim-race");
    const event = await heldEvent(who.email);
    const { token } = await createClaim(db, boss.id, event.id, who.email);
    const results = await Promise.all(Array.from({ length: 8 }, () => outcome(acceptClaim(db, who, token))));
    expect(results.filter((r) => r === "resolved")).toHaveLength(1);
    expect(results.filter((r) => r === "claim_unavailable")).toHaveLength(7);
    expect(await ownerOf(event.id)).toBe(who.id);
    expect(await auditRows("claim.accepted", { eventId: event.id })).toHaveLength(1);
  });

  it("cannot move an event that already belongs to a customer, and is admin-only", async () => {
    const real = await makeHost("claim-real-owner");
    const event = await makeEvent(real.id);
    expect(await outcome(createClaim(db, boss.id, event.id, "attacker@example.test"))).toBe("forbidden");
    const held = await heldEvent("x@example.test");
    expect(await outcome(createClaim(db, support.id, held.id, "x@example.test"))).toBe("forbidden");
    expect(await outcome(acceptClaim(db, { id: real.id, userId: real.id, email: "x@example.test", emailConfirmed: true } as never, "not-a-token"))).toBe(
      "claim_unavailable",
    );
    expect(claimTokenHash("a")).toMatch(/^\\x[0-9a-f]{64}$/);
  });
});
