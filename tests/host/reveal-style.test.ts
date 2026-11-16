// Reveal style choice: owner only ("manage_reveal"), refused once the
// countdown starts, and never touches the sealed columns (security R1, rules 28-29).
import { beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/supabase/server", () => ({
  hostDb: async () => ({ auth: { getClaims: async () => ({ data: auth.userId ? { claims: { sub: auth.userId } } : null }) } }),
}));

import { admin, makeHost } from "../db/helpers";
import { makeLiveEvent } from "../guest/fixtures";
import { chooseRevealStyle, revealStyleState } from "@/features/control/actions";
import { readRevealStyle } from "@/features/control/reveal-style";
import { AccessError } from "@/lib/events/access";
import { readLive } from "@/lib/live";

const SEALED = ["keeper_code_hash", "keeper_device_hash", "seal_count", "sealed_at", "ciphertext", "nonce", "key_version", "reveal_at", "revealed_at"] as const;

async function sealedRow(eventId: string) {
  const { data } = await admin.from("reveals").select(SEALED.join(", ")).eq("event_id", eventId).single();
  return data as unknown as Record<string, unknown>;
}

describe("reveal style", () => {
  let owner: string;
  let eventId: string;
  let slugEvent: Awaited<ReturnType<typeof makeLiveEvent>>["event"];

  beforeAll(async () => {
    const made = await makeLiveEvent("gender_reveal");
    owner = made.host.id;
    eventId = made.event.id;
    slugEvent = made.event;
  });

  it("creates the reveal row with the style only when none exists", async () => {
    auth.userId = owner;
    expect((await admin.from("reveals").select("id").eq("event_id", eventId).maybeSingle()).data).toBeNull();
    expect(await chooseRevealStyle(eventId, "scratch")).toEqual({ ok: true, style: "scratch" });
    const row = await sealedRow(eventId);
    for (const column of ["keeper_code_hash", "keeper_device_hash", "sealed_at", "ciphertext", "nonce", "key_version", "reveal_at", "revealed_at"]) expect(row[column]).toBeNull();
    expect(row.seal_count).toBe(0);
    expect(await revealStyleState(eventId)).toEqual({ style: "scratch", styles: ["balloon", "scratch"], locked: false });
    // The public live payload follows.
    expect((await readLive(slugEvent)).revealStyle).toBe("scratch");
  });

  it("changes the style of a sealed reveal without touching any sealed column", async () => {
    auth.userId = owner;
    await admin
      .from("reveals")
      .update({ keeper_code_hash: "\\x" + "ab".repeat(32), keeper_device_hash: "\\x" + "cd".repeat(32), ciphertext: "\\x" + "ef".repeat(272), nonce: "\\x" + "01".repeat(12), key_version: 1, seal_count: 2, sealed_at: new Date().toISOString() })
      .eq("event_id", eventId);
    const before = await sealedRow(eventId);
    expect(await chooseRevealStyle(eventId, "balloon")).toEqual({ ok: true, style: "balloon" });
    expect(await sealedRow(eventId)).toEqual(before);
    expect((await admin.from("reveals").select("style").eq("event_id", eventId).single()).data!.style).toBe("balloon");
  });

  it("is owner only: moderators, staff with every grantable capability and other hosts are refused", async () => {
    const moderator = await makeHost("rs-mod");
    const staff = await makeHost("rs-staff");
    const stranger = await makeHost("rs-other");
    await admin.from("event_members").insert({ event_id: eventId, user_id: moderator.id, role: "moderator" });
    await admin.from("staff_grants").insert({
      event_id: eventId, staff_id: staff.id, created_by: owner,
      capabilities: ["view", "edit_content", "manage_invitations", "manage_play", "moderate"],
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    });
    for (const user of [moderator.id, staff.id, stranger.id, null]) {
      auth.userId = user;
      await expect(chooseRevealStyle(eventId, "scratch")).rejects.toBeInstanceOf(AccessError);
      await expect(revealStyleState(eventId)).rejects.toBeInstanceOf(AccessError);
    }
    expect((await admin.from("reveals").select("style").eq("event_id", eventId).single()).data!.style).toBe("balloon");
  });

  it("is refused once the countdown has started, and after the reveal", async () => {
    auth.userId = owner;
    const before = await sealedRow(eventId);
    await admin.from("live_state").update({ phase: "countdown" }).eq("event_id", eventId);
    expect(await chooseRevealStyle(eventId, "scratch")).toEqual({ ok: false, reason: "locked" });
    expect((await readRevealStyle(eventId))!.locked).toBe(true);

    // Even if live_state lags, a set reveal_at locks the style.
    await admin.from("live_state").update({ phase: "idle" }).eq("event_id", eventId);
    const revealAt = new Date(Date.now() + 120_000).toISOString();
    await admin.from("reveals").update({ reveal_at: revealAt }).eq("event_id", eventId);
    expect(await chooseRevealStyle(eventId, "scratch")).toEqual({ ok: false, reason: "locked" });

    const after = await sealedRow(eventId);
    expect({ ...after, reveal_at: null }).toEqual({ ...before, reveal_at: null });
    expect((await admin.from("reveals").select("style").eq("event_id", eventId).single()).data!.style).toBe("balloon");
  });

  it("is not available on other kinds of event and rejects unknown styles", async () => {
    const { event, host } = await makeLiveEvent("wedding");
    auth.userId = host.id;
    expect(await chooseRevealStyle(event.id, "scratch")).toEqual({ ok: false, reason: "not_allowed" });
    expect((await admin.from("reveals").select("id").eq("event_id", event.id).maybeSingle()).data).toBeNull();
    auth.userId = owner;
    await expect(chooseRevealStyle(eventId, "confetti" as "balloon")).rejects.toThrow();
  });
});
