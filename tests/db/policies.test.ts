// Phase 0 security gate (docs/product/2026-11-15-security-requirements.md §3).
import { beforeAll, describe, expect, it } from "vitest";
import { admin, anonymous, hash, makeEvent, makeHost, makeInvitation, slug } from "./helpers";
import { randomBytes } from "node:crypto";

const ALL_TABLES = [
  "profiles", "staff_roles", "plans", "events", "slug_tombstones", "event_members", "staff_grants",
  "teams", "invitations", "players", "player_secrets", "guest_sessions", "rsvps", "games",
  "game_secrets", "game_answers", "game_serves", "score_events", "team_scores", "media", "wall_posts",
  "live_state", "reveals", "orders", "payments", "jobs", "rate_limits", "audit_log", "event_claims",
  "holding_accounts",
];
const SERVER_ONLY = [
  "staff_roles", "staff_grants", "slug_tombstones", "player_secrets", "guest_sessions", "game_secrets",
  "game_serves", "reveals", "orders", "payments", "jobs", "rate_limits", "audit_log", "event_claims",
  "holding_accounts",
];
const NIL = "00000000-0000-0000-0000-000000000000";
const RPCS: [string, Record<string, unknown>][] = [
  ["rate_limit_hit", { p_key: "x", p_window_seconds: 60, p_max: 1 }],
  ["jobs_claim", { p_limit: 1, p_visibility_seconds: 60 }],
  ["recompute_team_scores", { p_event_id: "00000000-0000-0000-0000-000000000000" }],
  ["reveal_release", { p_event_id: "00000000-0000-0000-0000-000000000000" }],
  ["settle_order", {
    p_order_id: "00000000-0000-0000-0000-000000000000", p_provider: "manual", p_provider_ref: "x",
    p_amount_egp: 0, p_approved_by: null, p_receipt_media_id: null,
  }],
  // 2026-11-16 hardening migration.
  ["rate_limit_refund", { p_key: "x", p_window_seconds: 60 }],
  ["rejoin_reserve", { p_player_id: NIL, p_max: 5, p_lock_seconds: 900 }],
  ["rejoin_success", { p_player_id: NIL }],
  ["join_player", { p_event_id: NIL, p_invitation_id: NIL, p_name: "x", p_team_id: null, p_approved: true }],
  ["invitations_add", { p_event_id: NIL, p_max_guests: 1, p_rows: [] }],
  ["media_reserve", { p_id: NIL, p_event_id: NIL, p_player_id: NIL, p_purpose: "wall_photo", p_path: "x", p_player_cap: 1, p_event_cap: 1, p_pending_cap: 1 }],
  ["media_complete", { p_media_id: NIL, p_event_id: NIL, p_player_id: NIL, p_photo_cap: 1, p_voice_cap: 1, p_event_cap: 1 }],
  ["reveal_seal", { p_reveal_id: NIL, p_device_hash: "\\x00", p_ciphertext: "\\x00", p_nonce: "\\x00", p_key_version: 1 }],
  ["wall_report", { p_event_id: NIL, p_post_id: NIL, p_player_id: NIL, p_threshold: 3 }],
  ["claim_event", { p_token_hash: "\\x00", p_user_id: NIL, p_email_lower: "a@b.c" }],
];

let a: Awaited<ReturnType<typeof makeHost>>;
let b: Awaited<ReturnType<typeof makeHost>>;
let eventA: { id: string; slug: string };
let eventB: { id: string; slug: string };

beforeAll(async () => {
  a = await makeHost("host-a");
  b = await makeHost("host-b");
  eventA = await makeEvent(a.id);
  eventB = await makeEvent(b.id);
});

describe("anonymous key", () => {
  it("reads nothing from any table", async () => {
    const client = anonymous();
    for (const table of ALL_TABLES) {
      const { data, error } = await client.from(table).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0, `${table} leaked rows to anon`).toBe(true);
    }
  });

  it("cannot call server-only functions", async () => {
    const client = anonymous();
    for (const [fn, args] of RPCS) {
      const { error } = await client.rpc(fn, args);
      expect(error, `${fn} callable by anon`).not.toBeNull();
    }
  });

  it("cannot list or read storage buckets", async () => {
    const client = anonymous();
    for (const bucket of ["quarantine", "media"]) {
      const { data } = await client.storage.from(bucket).list();
      expect(data ?? []).toHaveLength(0);
      const up = await client.storage.from(bucket).upload(`x-${Date.now()}.jpg`, new Blob(["x"]), { contentType: "image/jpeg" });
      expect(up.error).not.toBeNull();
    }
  });
});

describe("host isolation", () => {
  it("a host sees their own event and not another host's", async () => {
    const own = await a.client.from("events").select("id").eq("id", eventA.id);
    expect(own.data).toHaveLength(1);
    const other = await a.client.from("events").select("id").eq("id", eventB.id);
    expect(other.data ?? []).toHaveLength(0);
  });

  it("a host cannot read another event's guest rows", async () => {
    const inv = await makeInvitation(eventB.id);
    await admin.from("players").insert({ event_id: eventB.id, invitation_id: inv.id, name: "Mona" });
    for (const table of ["invitations", "players", "rsvps", "games", "wall_posts", "teams", "score_events"]) {
      const { data } = await a.client.from(table).select("id").eq("event_id", eventB.id);
      expect(data ?? [], `${table} leaked across hosts`).toHaveLength(0);
    }
  });

  it("server-only tables return nothing to a signed-in host", async () => {
    for (const table of SERVER_ONLY) {
      const { data, error } = await a.client.from(table).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0, `${table} readable by host`).toBe(true);
    }
  });

  it("a host cannot call server-only functions", async () => {
    for (const [fn, args] of RPCS) {
      const { error } = await a.client.rpc(fn, args);
      expect(error, `${fn} callable by host`).not.toBeNull();
    }
  });

  it("the event passcode hash is not selectable, the other columns are", async () => {
    await admin.from("events").update({ passcode_hash: "scrypt$sentinel" }).eq("id", eventA.id);
    const hidden = await a.client.from("events").select("passcode_hash").eq("id", eventA.id);
    expect(hidden.error).not.toBeNull();
    const star = await a.client.from("events").select("*").eq("id", eventA.id);
    expect(JSON.stringify(star)).not.toContain("sentinel");
    const visible = await a.client
      .from("events")
      .select("id, owner_id, kind, slug, status, template_id, template_version, content, published_content, published_version, theme, settings, default_locale, starts_at, ends_at, timezone, plan_id, created_at, updated_at")
      .eq("id", eventA.id);
    expect(visible.error).toBeNull();
    expect(visible.data).toHaveLength(1);
    // Draft edits still work and can return the row.
    const edit = await a.client.from("events").update({ theme: {} }).eq("id", eventA.id).select("id, theme");
    expect(edit.error).toBeNull();
    expect(edit.data).toHaveLength(1);
  });

  it("invitation code hashes are not selectable", async () => {
    await makeInvitation(eventA.id);
    const { error } = await a.client.from("invitations").select("code_hash").eq("event_id", eventA.id);
    expect(error).not.toBeNull();
  });
});

describe("host writes (security A1)", () => {
  it("may edit draft content and theme of their own event", async () => {
    const { error } = await a.client.from("events").update({ content: { shared: { title: "x" } } }).eq("id", eventA.id);
    expect(error).toBeNull();
  });

  it.each([
    ["status", { status: "published" }],
    ["plan_id", { plan_id: "premium" }],
    ["published_content", { published_content: { public: {} } }],
    ["slug", { slug: slug("hijack") }],
    ["owner_id", { owner_id: "00000000-0000-0000-0000-000000000000" }],
    ["settings", { settings: { x: 1 } }],
    ["passcode_hash", { passcode_hash: "x" }],
  ])("cannot update events.%s", async (_column, patch) => {
    const { error } = await a.client.from("events").update(patch).eq("id", eventA.id);
    expect(error).not.toBeNull();
    const { data } = await admin.from("events").select("status, plan_id, published_content, slug, owner_id").eq("id", eventA.id).single();
    expect(data).toMatchObject({ status: "draft", plan_id: null, published_content: null, slug: eventA.slug, owner_id: a.id });
  });

  it("cannot edit another host's draft", async () => {
    await a.client.from("events").update({ content: { hacked: true } }).eq("id", eventB.id);
    const { data } = await admin.from("events").select("content").eq("id", eventB.id).single();
    expect(data!.content).toEqual({});
  });

  it("cannot insert or delete rows anywhere", async () => {
    const inserts: [string, Record<string, unknown>][] = [
      ["events", { owner_id: a.id, kind: "wedding", slug: slug("free"), template_id: "draft", template_version: 1 }],
      ["invitations", { event_id: eventA.id, kind: "group", label: "x", code_hash: hash("x") }],
      ["score_events", { event_id: eventA.id, player_id: "00000000-0000-0000-0000-000000000000", points: 999, reason: "cheat", ref: "x" }],
      ["orders", { event_id: eventA.id, user_id: a.id, plan_id: "premium", amount_egp: 0, status: "paid" }],
      ["event_members", { event_id: eventA.id, user_id: b.id, role: "moderator" }],
      ["wall_posts", { event_id: eventA.id, player_id: "00000000-0000-0000-0000-000000000000", kind: "text", body: "x" }],
    ];
    for (const [table, row] of inserts) {
      const { error } = await a.client.from(table).insert(row);
      expect(error, `host could insert into ${table}`).not.toBeNull();
    }
    const del = await a.client.from("events").delete().eq("id", eventA.id).select();
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const still = await admin.from("events").select("id").eq("id", eventA.id);
    expect(still.data).toHaveLength(1);
  });
});

describe("database backstops", () => {
  it("rejects a child row that points at another event (security A2)", async () => {
    const invB = await makeInvitation(eventB.id);
    const { error } = await admin.from("players").insert({ event_id: eventA.id, invitation_id: invB.id, name: "Cross" });
    expect(error).not.toBeNull();
  });

  it("score events are idempotent per player, reason and ref", async () => {
    const inv = await makeInvitation(eventA.id);
    const player = await admin.from("players").insert({ event_id: eventA.id, invitation_id: inv.id, name: "Ali" }).select("id").single();
    const row = { event_id: eventA.id, player_id: player.data!.id, points: 10, reason: "quiz", ref: "q1" };
    expect((await admin.from("score_events").insert(row)).error).toBeNull();
    expect((await admin.from("score_events").insert(row)).error).not.toBeNull();
  });

  it("audit log rejects update and delete", async () => {
    const ins = await admin.from("audit_log").insert({ actor_kind: "system", action: "test" }).select("id").single();
    expect(ins.error).toBeNull();
    expect((await admin.from("audit_log").update({ action: "edited" }).eq("id", ins.data!.id)).error).not.toBeNull();
    expect((await admin.from("audit_log").delete().eq("id", ins.data!.id)).error).not.toBeNull();
  });

  it("a deleted event's slug can never be used again", async () => {
    const ev = await makeEvent(a.id);
    await admin.from("events").delete().eq("id", ev.id);
    const { error } = await admin.from("events").insert({
      owner_id: a.id, kind: "wedding", slug: ev.slug, template_id: "draft", template_version: 1,
    });
    expect(error).not.toBeNull();
  });

  it("only one paid order per event, and settlement grants the plan", async () => {
    const order = await admin.from("orders").insert({ event_id: eventA.id, user_id: a.id, plan_id: "essential", amount_egp: 350 }).select("id").single();
    const ref = randomBytes(6).toString("hex");
    const wrong = await admin.rpc("settle_order", {
      p_order_id: order.data!.id, p_provider: "manual", p_provider_ref: ref, p_amount_egp: 1, p_approved_by: null, p_receipt_media_id: null,
    });
    expect(wrong.data).toBe(false);
    const ok = await admin.rpc("settle_order", {
      p_order_id: order.data!.id, p_provider: "manual", p_provider_ref: ref, p_amount_egp: 350, p_approved_by: null, p_receipt_media_id: null,
    });
    expect(ok.data).toBe(true);
    const again = await admin.rpc("settle_order", {
      p_order_id: order.data!.id, p_provider: "manual", p_provider_ref: `${ref}-2`, p_amount_egp: 350, p_approved_by: null, p_receipt_media_id: null,
    });
    expect(again.data).toBe(false);
    const ev = await admin.from("events").select("plan_id").eq("id", eventA.id).single();
    expect(ev.data!.plan_id).toBe("essential");
    const second = await admin.from("orders").insert({ event_id: eventA.id, user_id: a.id, plan_id: "premium", amount_egp: 750, status: "paid" });
    expect(second.error).not.toBeNull();
  });

  it("rate limiter counts per key, so one busy key does not throttle another", async () => {
    const k1 = `t:${randomBytes(4).toString("hex")}`;
    const k2 = `t:${randomBytes(4).toString("hex")}`;
    const hits = await Promise.all(Array.from({ length: 6 }, () => admin.rpc("rate_limit_hit", { p_key: k1, p_window_seconds: 60, p_max: 5 })));
    expect(hits.filter((h) => h.data === true)).toHaveLength(5);
    const other = await admin.rpc("rate_limit_hit", { p_key: k2, p_window_seconds: 60, p_max: 5 });
    expect(other.data).toBe(true);
  });

  it("jobs are unique per kind and ref, and a claimed job is not handed out twice", async () => {
    const ref = randomBytes(6).toString("hex");
    expect((await admin.from("jobs").insert({ kind: "test", ref })).error).toBeNull();
    expect((await admin.from("jobs").insert({ kind: "test", ref })).error).not.toBeNull();
    const [c1, c2] = await Promise.all([
      admin.rpc("jobs_claim", { p_limit: 50, p_visibility_seconds: 60 }),
      admin.rpc("jobs_claim", { p_limit: 50, p_visibility_seconds: 60 }),
    ]);
    const claimed = [...(c1.data ?? []), ...(c2.data ?? [])].filter((j: { ref: string }) => j.ref === ref);
    expect(claimed).toHaveLength(1);
  });
});
