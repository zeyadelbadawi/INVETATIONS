// Phase 3 gate: joining, caps, rejoin lockout, idempotent points.
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { admin, hash } from "../db/helpers";
import { makeGuest, makeLiveEvent } from "./fixtures";
import { claimPlayer, joinAsNewPlayer } from "@/lib/guest/join";
import { award } from "@/lib/guest/scores";

describe("joining", () => {
  it("creates a player on the chosen team, awards join points once and returns a rejoin code", async () => {
    const { event, teams } = await makeLiveEvent();
    const guest = await makeGuest(event, "group");
    const result = await joinAsNewPlayer(event, guest, { name: "  منى‮  أحمد ", teamKey: "girl" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.player.name).toBe("منى أحمد");
    expect(result.player.teamId).toBe(teams.find((t) => t.key === "girl")!.id);
    expect(result.rejoinCode).toMatch(/^[0-9]{6}$/);

    expect(await award(event.id, result.player, "join", result.player.id, 5)).toBe(0);
    const { data: ledger } = await admin.from("score_events").select("points").eq("player_id", result.player.id);
    expect(ledger).toHaveLength(1);
    const { data: session } = await admin.from("guest_sessions").select("player_id").eq("id", guest.sessionId).single();
    expect(session!.player_id).toBe(result.player.id);
  });

  it("rejects an unknown team and too-short names", async () => {
    const { event } = await makeLiveEvent();
    const guest = await makeGuest(event);
    expect(await joinAsNewPlayer(event, guest, { name: "Ali", teamKey: "nope" })).toMatchObject({ ok: false, reason: "bad_team" });
    expect(await joinAsNewPlayer(event, guest, { name: "​" })).toMatchObject({ ok: false, reason: "invalid_name" });
  });

  it("stops at the household's pax cap", async () => {
    const { event } = await makeLiveEvent();
    const guest = await makeGuest(event, "personal", 2);
    expect((await joinAsNewPlayer(event, guest, { name: "Ahmed", teamKey: "boy" })).ok).toBe(true);
    expect((await joinAsNewPlayer(event, guest, { name: "Sara", teamKey: "boy" })).ok).toBe(true);
    expect(await joinAsNewPlayer(event, guest, { name: "Omar", teamKey: "boy" })).toMatchObject({ ok: false, reason: "full" });
  });

  it("holds open-link players for approval and gives them no points yet", async () => {
    const { event } = await makeLiveEvent();
    const guest = await makeGuest(event, "open");
    const result = await joinAsNewPlayer(event, guest, { name: "Stranger", teamKey: "boy" });
    expect(result.ok && result.player.approved).toBe(false);
    if (!result.ok) return;
    const { data: ledger } = await admin.from("score_events").select("id").eq("player_id", result.player.id);
    expect(ledger).toHaveLength(0);
  });
});

describe("re-claiming a player", () => {
  it("needs the right code on shared links and locks after five wrong tries", async () => {
    const { event } = await makeLiveEvent();
    const first = await makeGuest(event, "group");
    const joined = await joinAsNewPlayer(event, first, { name: "Mona", teamKey: "girl" });
    if (!joined.ok) throw new Error("join failed");

    // Same invitation, another browser.
    const { data: session } = await admin
      .from("guest_sessions")
      .insert({ token_hash: hash(randomBytes(32).toString("hex")), event_id: event.id, invitation_id: first.invitation.id, expires_at: new Date(Date.now() + 86400000).toISOString() })
      .select("id")
      .single();
    const other = { ...first, sessionId: session!.id, player: null };

    for (let i = 0; i < 4; i++) {
      expect(await claimPlayer(event, other, joined.player.id, "000000")).toMatchObject({ ok: false, reason: "bad_code" });
    }
    expect(await claimPlayer(event, other, joined.player.id, "000000")).toMatchObject({ ok: false, reason: "locked" });
    // Even the right code is refused while locked.
    expect(await claimPlayer(event, other, joined.player.id, joined.rejoinCode!)).toMatchObject({ ok: false, reason: "locked" });

    await admin.from("player_secrets").update({ locked_until: null }).eq("player_id", joined.player.id);
    expect((await claimPlayer(event, other, joined.player.id, joined.rejoinCode!)).ok).toBe(true);
  });

  it("refuses a player from another invitation", async () => {
    const { event } = await makeLiveEvent();
    const a = await makeGuest(event, "personal");
    const b = await makeGuest(event, "personal");
    const joined = await joinAsNewPlayer(event, a, { name: "Hany", teamKey: "boy" });
    if (!joined.ok) throw new Error("join failed");
    expect(await claimPlayer(event, b, joined.player.id, undefined)).toMatchObject({ ok: false, reason: "not_found" });
  });
});
