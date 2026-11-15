// Phase 4 gate: the answer cannot be learned before the database releases it.
import { describe, expect, it } from "vitest";
import { admin } from "../db/helpers";
import { makeGuest, makeLiveEvent } from "./fixtures";
import { joinAsNewPlayer } from "@/lib/guest/join";
import { openAnswer, sealAnswer } from "@/lib/reveal/crypto";
import { cancelReveal, issueKeeperLink, keeperSeal, keeperStatus, releaseIfDue, startReveal } from "@/lib/reveal/service";
import { readLive } from "@/lib/live";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

describe("reveal crypto", () => {
  it("produces the same ciphertext length for every answer", () => {
    const lengths = [["boy"], ["girl"], ["boy", "girl"], ["girl", "girl", "boy"]].map(
      (a) => sealAnswer(a as ("boy" | "girl")[], ID_A, ID_B).ciphertext.length,
    );
    expect(new Set(lengths).size).toBe(1);
  });

  it("uses a fresh nonce per seal and round-trips", () => {
    const one = sealAnswer(["girl"], ID_A, ID_B);
    const two = sealAnswer(["girl"], ID_A, ID_B);
    expect(one.nonce.equals(two.nonce)).toBe(false);
    expect(one.ciphertext.equals(two.ciphertext)).toBe(false);
    expect(openAnswer(one.ciphertext, one.nonce, one.keyVersion, ID_A, ID_B)).toEqual(["girl"]);
  });

  it("cannot be opened for a different reveal or event", () => {
    const sealed = sealAnswer(["boy"], ID_A, ID_B);
    expect(() => openAnswer(sealed.ciphertext, sealed.nonce, sealed.keyVersion, ID_B, ID_B)).toThrow();
    expect(() => openAnswer(sealed.ciphertext, sealed.nonce, sealed.keyVersion, ID_A, ID_A)).toThrow();
  });
});

describe("secret keeper", () => {
  it("binds to the first device, never returns the value, and locks at countdown", async () => {
    const { event, host } = await makeLiveEvent();
    const code = (await issueKeeperLink(event.id, host.id))!;
    expect(await keeperStatus(code, null)).toEqual({ state: "ready" });
    expect(await keeperSeal(code, "device-one", ["girl"])).toBe("sealed");

    const status = await keeperStatus(code, "device-one");
    expect(JSON.stringify(status)).not.toMatch(/girl|boy/);
    expect(status.state).toBe("sealed");
    expect((await keeperStatus(code, "device-two")).state).toBe("other_device");
    expect(await keeperSeal(code, "device-two", ["boy"])).toBe("other_device");

    // Correcting from the bound device is allowed until the countdown starts.
    expect(await keeperSeal(code, "device-one", ["boy"])).toBe("sealed");
    expect(await startReveal(event.id, host.id, 60)).not.toBeNull();
    expect(await keeperSeal(code, "device-one", ["girl"])).toBe("locked");
    expect(await issueKeeperLink(event.id, host.id)).toBeNull();
  });

  it("a reissued link kills the old one", async () => {
    const { event, host } = await makeLiveEvent();
    const first = (await issueKeeperLink(event.id, host.id))!;
    const second = (await issueKeeperLink(event.id, host.id))!;
    expect((await keeperStatus(first, null)).state).toBe("not_found");
    expect((await keeperStatus(second, null)).state).toBe("ready");
  });
});

describe("release", () => {
  it("cannot start without a sealed answer, and enforces a 60-second lobby", async () => {
    const { event, host } = await makeLiveEvent();
    expect(await startReveal(event.id, host.id, 60)).toBeNull();
    const code = (await issueKeeperLink(event.id, host.id))!;
    await keeperSeal(code, "d", ["boy"]);
    const at = (await startReveal(event.id, host.id, 1))!;
    expect(new Date(at).getTime() - Date.now()).toBeGreaterThan(55_000);
  });

  it("exposes nothing before zero, then the answer; winners get points; it is irreversible", async () => {
    const { event, host, teams } = await makeLiveEvent();
    const guestBoy = await makeGuest(event);
    const guestGirl = await makeGuest(event);
    const boy = await joinAsNewPlayer(event, guestBoy, { name: "Karim", teamKey: "boy" });
    const girl = await joinAsNewPlayer(event, guestGirl, { name: "Laila", teamKey: "girl" });
    if (!boy.ok || !girl.ok) throw new Error("join failed");

    const code = (await issueKeeperLink(event.id, host.id))!;
    await keeperSeal(code, "d", ["girl"]);
    await startReveal(event.id, host.id, 60);

    // Before zero: a release attempt does nothing and no public output carries the answer.
    await releaseIfDue(event.id);
    const before = await readLive(event);
    expect(before.phase).toBe("countdown");
    expect(before.answer).toBeNull();
    const { data: rowBefore } = await admin.from("live_state").select("public_payload").eq("event_id", event.id).single();
    expect(JSON.stringify(rowBefore)).not.toMatch(/girl|boy/);
    const { data: contentBefore } = await admin.from("events").select("published_content, content, settings").eq("id", event.id).single();
    expect(JSON.stringify(contentBefore)).not.toMatch(/"girl"|"boy"/);
    const { data: auditBefore } = await admin.from("audit_log").select("action, metadata").eq("event_id", event.id);
    expect(JSON.stringify(auditBefore)).not.toMatch(/girl|boy/);

    // Move the release time into the past (the database clock decides).
    const past = new Date(Date.now() - 2000).toISOString();
    await admin.from("reveals").update({ reveal_at: past }).eq("event_id", event.id);
    await admin.from("live_state").update({ public_payload: { revealAt: past } }).eq("event_id", event.id);

    const after = await readLive(event);
    expect(after.phase).toBe("revealed");
    expect(after.answer).toEqual(["girl"]);

    const girlTeam = teams.find((t) => t.key === "girl")!.id;
    const { data: wins } = await admin.from("score_events").select("player_id, team_id").eq("event_id", event.id).eq("reason", "reveal_win");
    expect(wins).toEqual([{ player_id: girl.player.id, team_id: girlTeam }]);

    // Releasing again changes nothing, and neither cancel nor a new countdown is possible.
    await releaseIfDue(event.id);
    const { data: winsAgain } = await admin.from("score_events").select("id").eq("event_id", event.id).eq("reason", "reveal_win");
    expect(winsAgain).toHaveLength(1);
    expect(await cancelReveal(event.id, host.id)).toBe(false);
    expect(await startReveal(event.id, host.id, 60)).toBeNull();
  });

  it("finishes publishing if the first attempt died after the database released", async () => {
    const { event, host } = await makeLiveEvent();
    const code = (await issueKeeperLink(event.id, host.id))!;
    await keeperSeal(code, "d", ["boy"]);
    await startReveal(event.id, host.id, 60);
    // Simulate: database marked it released, but the answer was never published.
    await admin.from("reveals").update({ reveal_at: new Date(Date.now() - 5000).toISOString(), revealed_at: new Date().toISOString() }).eq("event_id", event.id);
    await releaseIfDue(event.id);
    const { data } = await admin.from("live_state").select("phase, public_payload").eq("event_id", event.id).single();
    expect(data!.phase).toBe("revealed");
    expect((data!.public_payload as { answer: string[] }).answer).toEqual(["boy"]);
  });

  it("a countdown can be cancelled before zero and the keeper can then correct the answer", async () => {
    const { event, host } = await makeLiveEvent();
    const code = (await issueKeeperLink(event.id, host.id))!;
    await keeperSeal(code, "d", ["boy"]);
    await startReveal(event.id, host.id, 60);
    expect(await cancelReveal(event.id, host.id)).toBe(true);
    expect((await readLive(event)).phase).toBe("idle");
    expect(await keeperSeal(code, "d", ["girl"])).toBe("sealed");
  });

  it("gated events expose no answer or scores on the public endpoint", async () => {
    const { event, host } = await makeLiveEvent();
    const code = (await issueKeeperLink(event.id, host.id))!;
    await keeperSeal(code, "d", ["boy"]);
    await startReveal(event.id, host.id, 60);
    await admin.from("reveals").update({ reveal_at: new Date(Date.now() - 2000).toISOString() }).eq("event_id", event.id);
    await releaseIfDue(event.id);
    const live = await readLive({ ...event, hasPasscode: true });
    expect(live.answer).toBeNull();
    expect(live.scores).toEqual([]);
  });

  it("the ciphertext column has the same length whatever was sealed", async () => {
    const lengths: number[] = [];
    for (const answer of [["boy"], ["girl", "girl", "boy"]] as ("boy" | "girl")[][]) {
      const { event, host } = await makeLiveEvent();
      const code = (await issueKeeperLink(event.id, host.id))!;
      await keeperSeal(code, "d", answer);
      const { data } = await admin.from("reveals").select("ciphertext").eq("event_id", event.id).single();
      lengths.push((data!.ciphertext as unknown as string).length);
    }
    expect(lengths[0]).toBe(lengths[1]);
  });
});
