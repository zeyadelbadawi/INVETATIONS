// Host-side data functions against the local Supabase stack. The server actions
// are thin wrappers (authenticate, authorise, call these); the rules live here.
import { beforeAll, describe, expect, it, vi } from "vitest";

// The modules under test are server-only; vitest is the server here.
vi.mock("server-only", () => ({}));

import { createHash } from "node:crypto";
import { admin, makeHost } from "../db/helpers";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Actor } from "@/lib/events/access";
import { contentSchema, type EventContent } from "@/content/schema";
import { getTemplate } from "@/templates/registry";
import { HostError } from "@/features/host/lib/errors";
import { cancelEvent, createEvent, postponeEvent, publishEvent, saveDraft, updateSettings } from "@/features/host/lib/events";
import {
  addInvitations,
  exportGuestsCsv,
  regenerateInvitation,
  revokeInvitation,
  seatsUsed,
  type GuestExportLabels,
} from "@/features/host/lib/invitations";
import { createOrder, paymentState, submitTransferReference } from "@/features/host/lib/orders";
import { verifyPasscode } from "@/features/host/lib/passcode";
import { approveOrder, listPendingOrders } from "@/features/admin/lib/orders";

const db = admin as unknown as AdminClient;
const owner = (userId: string): Actor => ({ userId, kind: "owner", grantId: null });

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "resolved";
  } catch (error) {
    return error instanceof HostError ? error.code : `unexpected: ${String(error)}`;
  }
}

const sha = (value: string) => `\\x${createHash("sha256").update(value).digest("hex")}`;
const ref = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

let a: Awaited<ReturnType<typeof makeHost>>;
let b: Awaited<ReturnType<typeof makeHost>>;
let staff: Awaited<ReturnType<typeof makeHost>>;
let support: Awaited<ReturnType<typeof makeHost>>;

async function newEvent(userId: string, name = "Sara & Omar") {
  return createEvent(db, userId, { kind: "wedding", templateId: "wedding-draft", name, locale: "en" });
}

async function filledContent(eventId: string): Promise<EventContent> {
  const { data } = await admin.from("events").select("content").eq("id", eventId).single();
  const content = contentSchema.parse(data!.content);
  content.fields.partner_one = { ar: "سارة", en: "Sara" };
  content.fields.partner_two = { ar: "", en: "Omar" };
  for (const block of content.blocks) {
    if (block.type === "location") block.address = { ar: "", en: "12 Nile Street, Zamalek" };
    if (block.type === "details") block.city = { ar: "القاهرة", en: "Cairo" };
  }
  return content;
}

async function pay(eventId: string, userId: string, planId: "essential" | "premium") {
  const order = await createOrder(db, owner(userId), eventId, planId);
  const { data, error } = await admin.rpc("settle_order", {
    p_order_id: order.id,
    p_provider: "manual",
    p_provider_ref: ref("TEST"),
    p_amount_egp: order.amountEgp,
    p_approved_by: staff.id,
    p_receipt_media_id: null,
  });
  expect(error).toBeNull();
  expect(data).toBe(true);
}

beforeAll(async () => {
  a = await makeHost("host-a");
  b = await makeHost("host-b");
  staff = await makeHost("staff-admin");
  support = await makeHost("staff-support");
  const { error } = await admin.from("staff_roles").insert([
    { user_id: staff.id, role: "admin" },
    { user_id: support.id, role: "support" },
  ]);
  if (error) throw error;
});

describe("creating an event", () => {
  it("produces a valid slug, teams, live state and exactly one open invitation", async () => {
    const created = await newEvent(a.id);
    expect(created.slug).toMatch(/^sara-omar-[a-z0-9]{6}$/);
    expect(created.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(created.slug.length).toBeGreaterThanOrEqual(8);
    expect(created.slug.length).toBeLessThanOrEqual(64);

    const { data: event } = await admin.from("events").select("*").eq("id", created.id).single();
    expect(event!.owner_id).toBe(a.id);
    expect(event!.status).toBe("draft");
    expect(event!.plan_id).toBeNull();
    expect(event!.template_id).toBe("wedding-draft");
    expect(event!.template_version).toBe(1);
    const content = contentSchema.parse(event!.content);
    expect(Object.keys(content.fields).sort()).toEqual(["date_line", "eyebrow", "partner_one", "partner_two"]);
    expect(content.blocks.length).toBe(getTemplate("wedding-draft", 1)!.blocks.length);

    const { data: teams } = await admin.from("teams").select("key").eq("event_id", created.id).order("position");
    expect(teams!.map((t) => t.key)).toEqual(["groom", "bride", "friends"]);

    const { data: live } = await admin.from("live_state").select("phase").eq("event_id", created.id);
    expect(live).toHaveLength(1);

    const { data: invitations } = await admin.from("invitations").select("kind, code_hash").eq("event_id", created.id);
    expect(invitations).toHaveLength(1);
    expect(invitations![0].kind).toBe("open");
    // Only the hash of the returned code is stored.
    expect(invitations![0].code_hash).toBe(sha(created.openCode));

    const { data: log } = await admin.from("audit_log").select("action, actor_id").eq("event_id", created.id);
    expect(log).toEqual([{ action: "event.created", actor_id: a.id }]);
  });

  it("falls back to the kind for an Arabic name and still passes the slug check", async () => {
    const created = await createEvent(db, a.id, {
      kind: "gender_reveal",
      templateId: "reveal-draft",
      name: "ولد ولا بنت",
      locale: "ar",
    });
    expect(created.slug).toMatch(/^gender-reveal-[a-z0-9]{6}$/);
    const { data: teams } = await admin.from("teams").select("key").eq("event_id", created.id);
    expect(teams).toHaveLength(2);
  });

  it("refuses a template of another kind and junk input", async () => {
    expect(await code(createEvent(db, a.id, { kind: "wedding", templateId: "corporate-draft", name: "X", locale: "en" }))).toBe("invalid");
    expect(await code(createEvent(db, a.id, { kind: "party", templateId: "wedding-draft", name: "X", locale: "en" }))).toBe("invalid");
    expect(await code(createEvent(db, a.id, { kind: "wedding", templateId: "wedding-draft", name: "   ", locale: "en" }))).toBe("invalid");
  });
});

describe("saving a draft", () => {
  it("stores valid content and theme", async () => {
    const event = await newEvent(a.id);
    const content = await filledContent(event.id);
    await saveDraft(db, owner(a.id), event.id, content, { palette: "night" });
    const { data } = await admin.from("events").select("content, theme").eq("id", event.id).single();
    expect(contentSchema.parse(data!.content).fields.partner_one.en).toBe("Sara");
    expect(data!.theme).toEqual({ palette: "night" });
  });

  it("rejects invalid content and leaves the draft untouched", async () => {
    const event = await newEvent(a.id);
    const good = await filledContent(event.id);
    const before = (await admin.from("events").select("content").eq("id", event.id).single()).data!.content;
    const attempts: unknown[] = [
      { ...good, blocks: [{ id: "abc12345", type: "html", enabled: true, body: "<script>alert(1)</script>" }] },
      { ...good, blocks: [{ id: "abc12345", type: "contact", enabled: true, name: { ar: "", en: "" }, phone: null, link: "javascript:alert(1)" }] },
      { ...good, fields: { ...good.fields, partner_one: { ar: "x".repeat(200), en: "" } } },
      // Longer than this template field allows (40), though inside the schema's 160.
      { ...good, fields: { ...good.fields, partner_one: { ar: "x".repeat(60), en: "" } } },
      // A field the template does not have.
      { ...good, fields: { ...good.fields, injected: { ar: "x", en: "x" } } },
      { ...good, blocks: [good.blocks[0], good.blocks[0]] },
      "not an object",
    ];
    for (const attempt of attempts) {
      expect(await code(saveDraft(db, owner(a.id), event.id, attempt, {}))).toBe("invalid_content");
    }
    expect(await code(saveDraft(db, owner(a.id), event.id, good, { palette: "url(javascript:1)" }))).toBe("invalid_content");
    expect(await code(saveDraft(db, owner(a.id), event.id, good, { palette: "not-in-template" }))).toBe("invalid_content");
    const after = (await admin.from("events").select("content").eq("id", event.id).single()).data!.content;
    expect(after).toEqual(before);
  });

  it("rejects content for an event the user does not own", async () => {
    const event = await newEvent(a.id);
    const content = await filledContent(event.id);
    expect(await code(saveDraft(db, owner(b.id), event.id, content, {}))).toBe("forbidden");
    // A made-up staff actor without a real grant gets nothing either.
    const fake: Actor = { userId: b.id, kind: "staff", grantId: "00000000-0000-0000-0000-000000000000" };
    expect(await code(saveDraft(db, fake, event.id, content, {}))).toBe("forbidden");
    expect(await code(saveDraft(db, { userId: b.id, kind: "moderator", grantId: null }, event.id, content, {}))).toBe("forbidden");
    expect(await code(saveDraft(db, owner(a.id), "not-a-uuid", content, {}))).toBe("forbidden");
    const { data } = await admin.from("events").select("content").eq("id", event.id).single();
    expect(contentSchema.parse(data!.content).fields.partner_one.en).toBe("");
  });

  it("lets staff save only with a live grant on that event", async () => {
    const event = await newEvent(a.id);
    const other = await newEvent(a.id);
    const content = await filledContent(event.id);
    const { data: grant, error } = await admin
      .from("staff_grants")
      .insert({
        event_id: event.id,
        staff_id: support.id,
        capabilities: ["view", "edit_content"],
        created_by: staff.id,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const actor: Actor = { userId: support.id, kind: "staff", grantId: grant!.id };
    await saveDraft(db, actor, event.id, content, {});
    expect(await code(saveDraft(db, actor, other.id, content, {}))).toBe("forbidden");
    // Owner-only work stays closed to a grant.
    expect(await code(publishEvent(db, actor, event.id))).toBe("forbidden");
    await admin.from("staff_grants").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", grant!.id);
    expect(await code(saveDraft(db, actor, event.id, content, {}))).toBe("forbidden");
  });
});

describe("settings", () => {
  it("stores times in the event timezone and a slow passcode hash", async () => {
    const event = await newEvent(a.id);
    const base = {
      startsAt: "2026-12-31T19:30",
      endsAt: "2027-01-01T01:00",
      timezone: "Africa/Cairo",
      defaultLocale: "ar",
      rosterVisible: false,
      sharingEnabled: true,
      openLinkApproval: true,
      photosHostOnly: true,
      lockTeams: false,
      rsvpDeadline: "2026-12-20T23:59",
    };
    await updateSettings(db, owner(a.id), event.id, { ...base, passcode: { mode: "set", value: "farah-2026" } });
    const { data } = await admin.from("events").select("*").eq("id", event.id).single();
    expect(new Date(data!.starts_at!).toISOString()).toBe("2026-12-31T17:30:00.000Z");
    expect(data!.settings).toMatchObject({ rosterVisible: false, photosHostOnly: true, rsvpDeadline: "2026-12-20T21:59:00.000Z" });
    expect(data!.passcode_hash).toMatch(/^scrypt\$/);
    expect(data!.passcode_hash).not.toContain("farah-2026");
    expect(await verifyPasscode("farah-2026", data!.passcode_hash)).toBe(true);

    await updateSettings(db, owner(a.id), event.id, { ...base, passcode: { mode: "keep" } });
    expect((await admin.from("events").select("passcode_hash").eq("id", event.id).single()).data!.passcode_hash).toBe(data!.passcode_hash);

    expect(await code(updateSettings(db, owner(a.id), event.id, { ...base, passcode: { mode: "set", value: "12345" } }))).toBe("invalid");
    expect(await code(updateSettings(db, owner(a.id), event.id, { ...base, timezone: "Mars/Olympus", passcode: { mode: "keep" } }))).toBe("invalid");
    expect(await code(updateSettings(db, owner(a.id), event.id, { ...base, endsAt: "2026-12-01T10:00", passcode: { mode: "keep" } }))).toBe("invalid");
    expect(await code(updateSettings(db, owner(b.id), event.id, { ...base, passcode: { mode: "clear" } }))).toBe("forbidden");

    await updateSettings(db, owner(a.id), event.id, { ...base, passcode: { mode: "clear" } });
    expect((await admin.from("events").select("passcode_hash").eq("id", event.id).single()).data!.passcode_hash).toBeNull();
    // The passcode never reaches the audit trail.
    const { data: log } = await admin.from("audit_log").select("metadata").eq("event_id", event.id);
    expect(JSON.stringify(log)).not.toContain("farah-2026");
  });
});

describe("publishing", () => {
  it("fails without a paid plan, even with a pending order", async () => {
    const event = await newEvent(a.id);
    await saveDraft(db, owner(a.id), event.id, await filledContent(event.id), {});
    expect(await code(publishEvent(db, owner(a.id), event.id))).toBe("no_plan");
    await createOrder(db, owner(a.id), event.id, "essential");
    expect(await code(publishEvent(db, owner(a.id), event.id))).toBe("no_plan");
    const { data } = await admin.from("events").select("status, published_content, published_version").eq("id", event.id).single();
    expect(data).toEqual({ status: "draft", published_content: null, published_version: 0 });
  });

  it("succeeds after settlement and keeps the location out of the public half", async () => {
    const event = await newEvent(a.id);
    await saveDraft(db, owner(a.id), event.id, await filledContent(event.id), {});
    await pay(event.id, a.id, "essential");

    const first = await publishEvent(db, owner(a.id), event.id);
    expect(first).toEqual({ slug: event.slug, version: 1 });

    const { data } = await admin.from("events").select("status, plan_id, published_content, published_version").eq("id", event.id).single();
    expect(data!.status).toBe("published");
    expect(data!.plan_id).toBe("essential");
    const published = data!.published_content as unknown as {
      public: { blocks: { type: string }[]; fields: Record<string, unknown> };
      guest: { blocks: { type: string; address?: { en: string } }[] };
      order: string[];
    };
    const publicTypes = published.public.blocks.map((b) => b.type);
    const guestTypes = published.guest.blocks.map((b) => b.type);
    expect(guestTypes).toContain("location");
    expect(publicTypes).not.toContain("location");
    expect(publicTypes).toContain("details");
    expect(JSON.stringify(published.public)).not.toContain("12 Nile Street");
    expect(JSON.stringify(published.guest)).toContain("12 Nile Street");
    // Disabled blocks are in neither half.
    expect([...publicTypes, ...guestTypes]).not.toContain("story");
    expect(published.order).toHaveLength(publicTypes.length + guestTypes.length);

    // Editing after publish changes only the draft until the host republishes.
    const edited = await filledContent(event.id);
    edited.fields.partner_one = { ar: "سارة", en: "Sarah" };
    await saveDraft(db, owner(a.id), event.id, edited, {});
    const mid = (await admin.from("events").select("published_content").eq("id", event.id).single()).data!.published_content;
    expect(JSON.stringify(mid)).not.toContain("Sarah");
    expect((await publishEvent(db, owner(a.id), event.id)).version).toBe(2);
  });

  it("refuses a draft with an empty required field and strangers", async () => {
    const event = await newEvent(a.id);
    await pay(event.id, a.id, "essential");
    try {
      await publishEvent(db, owner(a.id), event.id);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HostError);
      expect((error as HostError).code).toBe("missing_required");
      expect((error as HostError).detail).toEqual({ fields: ["partner_one", "partner_two"] });
    }
    expect(await code(publishEvent(db, owner(b.id), event.id))).toBe("forbidden");
  });

  it("postpones and cancels only from the right states", async () => {
    const event = await newEvent(a.id);
    expect(await code(postponeEvent(db, owner(a.id), event.id))).toBe("bad_status");
    await saveDraft(db, owner(a.id), event.id, await filledContent(event.id), {});
    await pay(event.id, a.id, "essential");
    await publishEvent(db, owner(a.id), event.id);
    expect(await code(cancelEvent(db, owner(b.id), event.id))).toBe("forbidden");
    await postponeEvent(db, owner(a.id), event.id);
    expect((await admin.from("events").select("status").eq("id", event.id).single()).data!.status).toBe("postponed");
    await cancelEvent(db, owner(a.id), event.id);
    expect((await admin.from("events").select("status").eq("id", event.id).single()).data!.status).toBe("cancelled");
    expect(await code(publishEvent(db, owner(a.id), event.id))).toBe("bad_status");
  });
});

describe("orders", () => {
  it("snapshots the plan price and keeps one pending order per event", async () => {
    const event = await newEvent(a.id);
    const first = await createOrder(db, owner(a.id), event.id, "essential");
    expect(first.amountEgp).toBe(350);
    const again = await createOrder(db, owner(a.id), event.id, "essential");
    expect(again.id).toBe(first.id);
    const upgraded = await createOrder(db, owner(a.id), event.id, "premium");
    expect(upgraded.amountEgp).toBe(750);
    const { data } = await admin.from("orders").select("id, status").eq("event_id", event.id).order("created_at");
    expect(data).toEqual([
      { id: first.id, status: "cancelled" },
      { id: upgraded.id, status: "pending" },
    ]);
    expect(await code(createOrder(db, owner(a.id), event.id, "free-forever"))).toBe("plan_unavailable");
    expect(await code(createOrder(db, owner(b.id), event.id, "premium"))).toBe("forbidden");
  });

  it("records the transfer reference for staff and refuses junk", async () => {
    const event = await newEvent(a.id);
    expect(await code(submitTransferReference(db, owner(a.id), event.id, "IP-12345"))).toBe("no_pending_order");
    const order = await createOrder(db, owner(a.id), event.id, "essential");
    expect(await code(submitTransferReference(db, owner(a.id), event.id, "<script>"))).toBe("invalid");
    expect(await code(submitTransferReference(db, owner(b.id), event.id, "IP-12345"))).toBe("forbidden");
    await submitTransferReference(db, owner(a.id), event.id, "IP-12345");
    await submitTransferReference(db, owner(a.id), event.id, "IP-12345");
    const state = await paymentState(db, owner(a.id), event.id);
    expect(state.pending).toMatchObject({ id: order.id, amountEgp: 350, references: ["IP-12345"] });
    const queue = await listPendingOrders(db, staff.id, "en");
    const row = queue.find((o) => o.id === order.id);
    expect(row).toMatchObject({ eventName: "Sara & Omar", planId: "essential", amountEgp: 350, conflicted: false });
    expect(row!.references.map((r) => r.reference)).toEqual(["IP-12345"]);
  });
});

describe("staff approval", () => {
  it("refuses a wrong amount, a non-admin and a reused reference; then settles once", async () => {
    const event = await newEvent(a.id);
    const order = await createOrder(db, owner(a.id), event.id, "premium");
    const reference = ref("IPN");

    expect(await code(approveOrder(db, staff.id, { orderId: order.id, reference, amountEgp: 700 }))).toBe("amount_mismatch");
    expect(await code(approveOrder(db, staff.id, { orderId: order.id, reference, amountEgp: 0 }))).toBe("amount_mismatch");
    expect(await code(approveOrder(db, support.id, { orderId: order.id, reference, amountEgp: 750 }))).toBe("forbidden");
    expect(await code(approveOrder(db, b.id, { orderId: order.id, reference, amountEgp: 750 }))).toBe("forbidden");
    expect(await code(approveOrder(db, staff.id, { orderId: order.id, reference: "", amountEgp: 750 }))).toBe("invalid");
    expect((await admin.from("events").select("plan_id").eq("id", event.id).single()).data!.plan_id).toBeNull();

    await approveOrder(db, staff.id, { orderId: order.id, reference, amountEgp: 750 });
    expect((await admin.from("events").select("plan_id").eq("id", event.id).single()).data!.plan_id).toBe("premium");
    const { data: payment } = await admin.from("payments").select("provider, provider_ref, amount_egp, approved_by").eq("order_id", order.id);
    expect(payment).toEqual([{ provider: "manual", provider_ref: reference, amount_egp: 750, approved_by: staff.id }]);
    const { data: log } = await admin.from("audit_log").select("actor_id, actor_kind").eq("event_id", event.id).eq("action", "order.approved");
    expect(log).toEqual([{ actor_id: staff.id, actor_kind: "staff" }]);

    expect(await code(approveOrder(db, staff.id, { orderId: order.id, reference: ref("IPN"), amountEgp: 750 }))).toBe("not_pending");

    // The same transfer cannot pay for a second event.
    const second = await newEvent(b.id);
    const secondOrder = await createOrder(db, owner(b.id), second.id, "premium");
    expect(await code(approveOrder(db, staff.id, { orderId: secondOrder.id, reference, amountEgp: 750 }))).toBe("duplicate_reference");
    expect((await admin.from("events").select("plan_id").eq("id", second.id).single()).data!.plan_id).toBeNull();
  });

  it("refuses self-approval and approval by staff holding a grant", async () => {
    const own = await newEvent(staff.id, "Staff Party");
    const ownOrder = await createOrder(db, owner(staff.id), own.id, "essential");
    expect(await code(approveOrder(db, staff.id, { orderId: ownOrder.id, reference: ref("SELF"), amountEgp: 350 }))).toBe("self_approval");
    expect((await admin.from("events").select("plan_id").eq("id", own.id).single()).data!.plan_id).toBeNull();
    const queue = await listPendingOrders(db, staff.id, "en");
    expect(queue.find((o) => o.id === ownOrder.id)!.conflicted).toBe(true);

    const event = await newEvent(a.id);
    const order = await createOrder(db, owner(a.id), event.id, "essential");
    await admin.from("staff_grants").insert({
      event_id: event.id,
      staff_id: staff.id,
      capabilities: ["view"],
      created_by: staff.id,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(await code(approveOrder(db, staff.id, { orderId: order.id, reference: ref("GRANT"), amountEgp: 350 }))).toBe("self_approval");
    expect((await admin.from("orders").select("status").eq("id", order.id).single()).data!.status).toBe("pending");
  });
});

describe("invitations", () => {
  const group = (label: string, size: number, phone: string | null = null) => ({ label, kind: "group" as const, size, phone });
  const personal = (label: string, size: number, phone: string | null = null) => ({ label, kind: "personal" as const, size, phone });

  it("refuses personal links on the essential plan and before payment", async () => {
    const event = await newEvent(a.id);
    expect(await code(addInvitations(db, owner(a.id), event.id, [personal("Ahmed & family", 4)]))).toBe("personal_links_not_in_plan");
    await pay(event.id, a.id, "essential");
    expect(await code(addInvitations(db, owner(a.id), event.id, [personal("Ahmed & family", 4)]))).toBe("personal_links_not_in_plan");
    expect(await code(addInvitations(db, owner(a.id), event.id, [group("Friends", 10), personal("Ahmed", 2)]))).toBe("personal_links_not_in_plan");
    expect(await seatsUsed(db, event.id)).toBe(0);
  });

  it("enforces the plan's guest cap across requests", async () => {
    const event = await newEvent(a.id);
    await pay(event.id, a.id, "essential");
    const created = await addInvitations(db, owner(a.id), event.id, [group("University friends", 60, "01001234567")]);
    expect(created).toHaveLength(1);
    expect(created[0].phone).toBe("+201001234567");
    expect(created[0].code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const { data: stored } = await admin.from("invitations").select("code_hash, max_players, phone").eq("id", created[0].id).single();
    expect(stored).toEqual({ code_hash: sha(created[0].code), max_players: 60, phone: "+201001234567" });

    expect(await code(addInvitations(db, owner(a.id), event.id, [group("Neighbours", 41)]))).toBe("guest_cap");
    await addInvitations(db, owner(a.id), event.id, [group("Neighbours", 40)]);
    expect(await seatsUsed(db, event.id)).toBe(100);
    expect(await code(addInvitations(db, owner(a.id), event.id, [group("One more", 1)]))).toBe("guest_cap");

    // Revoking frees the seats.
    await revokeInvitation(db, owner(a.id), event.id, created[0].id);
    expect(await seatsUsed(db, event.id)).toBe(40);
    await addInvitations(db, owner(a.id), event.id, [group("Cousins", 60)]);
  });

  it("allows personal links and unlimited guests on premium, validating every row", async () => {
    const event = await newEvent(a.id);
    await pay(event.id, a.id, "premium");
    const rows = Array.from({ length: 120 }, (_, i) => personal(`Family ${i + 1}`, 4, `0100${String(1000000 + i)}`));
    const created = await addInvitations(db, owner(a.id), event.id, rows);
    expect(created).toHaveLength(120);
    expect(new Set(created.map((c) => c.code)).size).toBe(120);
    expect(await seatsUsed(db, event.id)).toBe(480);

    expect(await code(addInvitations(db, owner(a.id), event.id, [personal("Too many", 51)]))).toBe("invalid");
    expect(await code(addInvitations(db, owner(a.id), event.id, [personal("Bad phone", 2, "12")]))).toBe("invalid");
    expect(await code(addInvitations(db, owner(a.id), event.id, [personal("‮​", 2)]))).toBe("invalid");
    expect(await code(addInvitations(db, owner(a.id), event.id, [{ ...personal("Other team", 2), sideTeamId: "00000000-0000-4000-8000-000000000000" }]))).toBe("invalid");
    expect(await code(addInvitations(db, owner(a.id), event.id, Array.from({ length: 501 }, (_, i) => personal(`R${i}`, 1))))).toBe("too_many_rows");
    expect(await code(addInvitations(db, owner(b.id), event.id, [personal("Intruder", 1)]))).toBe("forbidden");
    expect(await seatsUsed(db, event.id)).toBe(480);
  });

  it("regenerates a link so the old code dies, and scopes ids to the event", async () => {
    const event = await newEvent(a.id);
    const other = await newEvent(b.id);
    const [inv] = await addInvitations(db, owner(a.id), event.id, [group("Friends", 10)]);
    const fresh = await regenerateInvitation(db, owner(a.id), event.id, inv.id);
    expect(fresh.code).not.toBe(inv.code);
    const { data } = await admin.from("invitations").select("code_hash").eq("id", inv.id).single();
    expect(data!.code_hash).toBe(sha(fresh.code));
    expect((await admin.from("invitations").select("id").eq("code_hash", sha(inv.code))).data).toHaveLength(0);

    // Host B cannot reach A's invitation, by A's event id or through their own.
    expect(await code(regenerateInvitation(db, owner(b.id), event.id, inv.id))).toBe("forbidden");
    expect(await code(regenerateInvitation(db, owner(b.id), other.id, inv.id))).toBe("not_found");
    expect(await code(revokeInvitation(db, owner(b.id), other.id, inv.id))).toBe("not_found");

    await revokeInvitation(db, owner(a.id), event.id, inv.id);
    expect(await code(regenerateInvitation(db, owner(a.id), event.id, inv.id))).toBe("revoked");

    const { data: open } = await admin.from("invitations").select("id").eq("event_id", event.id).eq("kind", "open").single();
    expect(await code(revokeInvitation(db, owner(a.id), event.id, open!.id))).toBe("open_link_fixed");
    expect((await regenerateInvitation(db, owner(a.id), event.id, open!.id)).code).not.toBe(event.openCode);
  });

  it("exports guests as CSV with formulas neutralised, for the owner only", async () => {
    const labels: GuestExportLabels = {
      headers: ["Name", "Type", "Side", "Seats", "Phone", "Opened", "Revoked", "Reply", "Adults", "Children"],
      kinds: { personal: "Personal", group: "Group", open: "Open" },
      yes: "Yes",
      no: "No",
      rsvp: { yes: "Coming", no: "Not coming", maybe: "Maybe" },
    };
    const event = await newEvent(a.id);
    await addInvitations(db, owner(a.id), event.id, [
      group("=HYPERLINK(\"http://evil.example\",\"click\")", 5, "01001234567"),
      group("@SUM(1+1)", 5),
      group("-2+3", 5),
      group("Aunt Mona, and family", 5),
    ]);
    const csv = await exportGuestsCsv(db, owner(a.id), event.id, labels, "en");
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("Name,Type,Side,Seats,Phone,Opened,Revoked,Reply,Adults,Children");
    expect(lines).toHaveLength(6);
    for (const line of lines.slice(1)) {
      for (const cell of line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
        expect(cell.replace(/^"/, ""), line).not.toMatch(/^[=+\-@\t\r]/);
      }
    }
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://evil.example\"\",\"\"click\"\")\"");
    expect(csv).toContain("'@SUM(1+1)");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'+201001234567");
    expect(csv).toContain("\"Aunt Mona, and family\"");

    expect(await code(exportGuestsCsv(db, owner(b.id), event.id, labels, "en"))).toBe("forbidden");
    // Staff grants never include exports.
    const { data: grant } = await admin
      .from("staff_grants")
      .insert({
        event_id: event.id,
        staff_id: support.id,
        capabilities: ["view", "manage_invitations"],
        created_by: staff.id,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("id")
      .single();
    expect(await code(exportGuestsCsv(db, { userId: support.id, kind: "staff", grantId: grant!.id }, event.id, labels, "en"))).toBe("forbidden");
  });
});
