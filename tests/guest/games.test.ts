// Phase 3 gate: game integrity through the API layer.
import { describe, expect, it } from "vitest";
import { admin } from "../db/helpers";
import { makeGuest, makeLiveEvent } from "./fixtures";
import { joinAsNewPlayer } from "@/lib/guest/join";
import { listGames, serveQuestion, submitAnswer } from "@/lib/guest/games";
import { readLive } from "@/lib/live";
import { saveGame, setGameState, setTruth, settleGame } from "@/features/control/games";
import { predictionConfigSchema } from "@/play/modules/prediction";
import { quizInput, thisOrThatConfig, thisOrThatTruth } from "@/play/fixtures";
import { chooseN, teamScore } from "@/play/scoring";
import type { Actor } from "@/lib/events/access";

const SECRET = "zz-secret-option";

async function setup() {
  const { event, host, teams } = await makeLiveEvent("wedding");
  const actor: Actor = { userId: host.id, kind: "owner", grantId: null };
  const join = async (name: string, teamKey: string) => {
    const guest = await makeGuest(event, "group");
    const joined = await joinAsNewPlayer(event, guest, { name, teamKey });
    if (!joined.ok) throw new Error("join failed");
    return { ...guest, player: joined.player };
  };
  return { event, actor, teams, join };
}

// A quiz whose correct options carry a marker nobody else uses.
const quiz = (timed: boolean) => ({
  ...quizInput,
  timed,
  questions: quizInput.questions.map((q, i) =>
    i === 0 ? { ...q, options: [...q.options.slice(0, 3), { id: SECRET, label: { ar: "سر", en: "secret" } }] } : q,
  ),
});
const quizTruth = { answers: { q1: SECRET, q2: "c", q3: "yes" } };

describe("quiz", () => {
  it("cannot be opened without answers, and truth never appears in guest output while open", async () => {
    const { event, actor, join } = await setup();
    const saved = await saveGame(event.id, actor, { kind: "quiz", config: quiz(true) });
    if (!saved.ok) throw new Error(saved.issues.join());
    expect((await setGameState(event.id, actor, saved.id, "open")).ok).toBe(false);
    expect((await setTruth(event.id, saved.id, { answers: { q1: "nope" } })).ok).toBe(false);
    expect((await setTruth(event.id, saved.id, quizTruth)).ok).toBe(true);
    expect((await setGameState(event.id, actor, saved.id, "open")).ok).toBe(true);

    const guest = await join("Dina", "bride");
    const listed = JSON.stringify(await listGames(event, guest));
    // A timed quiz does not hand out its questions up front, so the marked option is absent entirely.
    expect(listed).not.toContain(SECRET);
    expect(listed).not.toMatch(/truth|"answers"\s*:\s*\{/);

    const served = await serveQuestion(event, guest.player, saved.id);
    expect(served.ok && !served.done).toBe(true);
    const again = await serveQuestion(event, guest.player, saved.id);
    if (!served.ok || served.done || !again.ok || again.done) throw new Error("serve failed");
    // Asking again does not restart the clock.
    expect(again.servedAt).toBe(served.servedAt);

    await submitAnswer(event, guest.player, saved.id, "q1", { optionId: SECRET });
    const after = (await listGames(event, guest))[0];
    expect(after.results).toBeNull();
    // No per-option tallies for an open quiz.
    expect(JSON.stringify(after.tally)).not.toContain(SECRET);

    await setGameState(event.id, actor, saved.id, "closed");
    const closed = (await listGames(event, guest))[0];
    expect(JSON.stringify(closed.results)).toContain(SECRET);
  });

  it("a double submit scores once", async () => {
    const { event, actor, join } = await setup();
    const saved = await saveGame(event.id, actor, { kind: "quiz", config: quiz(false) });
    if (!saved.ok) throw new Error("save failed");
    await setTruth(event.id, saved.id, quizTruth);
    await setGameState(event.id, actor, saved.id, "open");
    const guest = await join("Omar", "groom");

    const results = await Promise.all(
      Array.from({ length: 6 }, () => submitAnswer(event, guest.player, saved.id, "q2", { optionId: "c" })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "already_answered")).toHaveLength(5);

    const { data: answers } = await admin.from("game_answers").select("id").eq("game_id", saved.id).eq("player_id", guest.player.id);
    expect(answers).toHaveLength(1);
    // Quiz points reach the ledger when the quiz closes (review F6), once.
    expect((await admin.from("score_events").select("points").eq("player_id", guest.player.id).eq("reason", "quiz")).data).toHaveLength(0);
    await setGameState(event.id, actor, saved.id, "closed");
    await setGameState(event.id, actor, saved.id, "open");
    await setGameState(event.id, actor, saved.id, "closed");
    const { data: ledger } = await admin.from("score_events").select("points").eq("player_id", guest.player.id).eq("reason", "quiz");
    expect(ledger).toHaveLength(1);
    expect(ledger![0].points).toBeGreaterThan(0);
  });

  // Review F6: while a quiz is open, nothing a guest can see changes with
  // whether an answer was right: not the answer response, the games list, the
  // public live payload (team totals) or the player's details.
  it("gives no correctness signal anywhere while open, and the points after it closes", async () => {
    const { event, actor, join } = await setup();
    const saved = await saveGame(event.id, actor, { kind: "quiz", config: quiz(false) });
    if (!saved.ok) throw new Error("save failed");
    await setTruth(event.id, saved.id, quizTruth);
    await setGameState(event.id, actor, saved.id, "open");
    const right = await join("Rana", "bride");
    const wrong = await join("Wael", "bride");

    const outputs = async () => {
      const [r, w, live] = await Promise.all([listGames(event, right), listGames(event, wrong), readLive(event)]);
      return { right: r.find((g) => g.id === saved.id)!, wrong: w.find((g) => g.id === saved.id)!, live };
    };
    const before = await outputs();
    const rightAnswer = await submitAnswer(event, right.player, saved.id, "q2", { optionId: "c" });
    const wrongAnswer = await submitAnswer(event, wrong.player, saved.id, "q2", { optionId: "a" });
    // Identical responses, with no points in them.
    expect(rightAnswer).toEqual({ ok: true });
    expect(wrongAnswer).toEqual(rightAnswer);

    const after = await outputs();
    expect(after.right.myPoints).toBeNull();
    expect(after.wrong.myPoints).toBeNull();
    // The two players' views differ only in which options they were shown (seeded per player).
    const strip = (g: typeof after.right) => ({ ...g, view: null });
    expect(strip(after.right)).toEqual(strip(after.wrong));
    expect(after.right.answered).toEqual(["q2"]);
    // Team totals in the public live payload have not moved.
    expect(after.live.scores).toEqual(before.live.scores);
    const { data: ledger } = await admin.from("score_events").select("id").in("player_id", [right.player.id, wrong.player.id]).eq("reason", "quiz");
    expect(ledger).toHaveLength(0);

    await setGameState(event.id, actor, saved.id, "closed");
    const closed = await outputs();
    expect(closed.right.myPoints).toBeGreaterThan(0);
    expect(closed.wrong.myPoints).toBe(0);
    expect(closed.live.scores).not.toEqual(before.live.scores);
  });

  it("rejects unknown options, closed games and edits after answers exist", async () => {
    const { event, actor, join } = await setup();
    const saved = await saveGame(event.id, actor, { kind: "quiz", config: quiz(false) });
    if (!saved.ok) throw new Error("save failed");
    await setTruth(event.id, saved.id, quizTruth);
    const guest = await join("Salma", "bride");
    expect(await submitAnswer(event, guest.player, saved.id, "q1", { optionId: "a" })).toMatchObject({ ok: false, reason: "not_open" });
    await setGameState(event.id, actor, saved.id, "open");
    expect(await submitAnswer(event, guest.player, saved.id, "q1", { optionId: "nope" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await submitAnswer(event, guest.player, saved.id, "zzz", { optionId: "a" })).toMatchObject({ ok: false, reason: "invalid" });
    expect((await submitAnswer(event, guest.player, saved.id, "q1", { optionId: "a" })).ok).toBe(true);
    expect((await saveGame(event.id, actor, { id: saved.id, kind: "quiz", config: quiz(true) })).ok).toBe(false);
  });

  it("refuses a config that smuggles in an answer key", async () => {
    const { event, actor } = await setup();
    const result = await saveGame(event.id, actor, { kind: "quiz", config: { ...quiz(false), answers: quizTruth.answers } });
    expect(result.ok).toBe(false);
  });

  it("a game of another event cannot be answered", async () => {
    const one = await setup();
    const two = await setup();
    const saved = await saveGame(one.event.id, one.actor, { kind: "quiz", config: quiz(false) });
    if (!saved.ok) throw new Error("save failed");
    await setTruth(one.event.id, saved.id, quizTruth);
    await setGameState(one.event.id, one.actor, saved.id, "open");
    const outsider = await two.join("Intruder", "groom");
    expect(await submitAnswer(two.event, outsider.player, saved.id, "q1", { optionId: "a" })).toMatchObject({ ok: false, reason: "not_open" });
  });
});

describe("settling", () => {
  it("awards match points once, and team totals equal the ledger", async () => {
    const { event, actor, teams, join } = await setup();
    const saved = await saveGame(event.id, actor, { kind: "vote", config: thisOrThatConfig });
    if (!saved.ok) throw new Error(saved.issues.join());
    await setTruth(event.id, saved.id, thisOrThatTruth);
    await setGameState(event.id, actor, saved.id, "open");

    const a = await join("Aya", "bride");
    const b = await join("Bassem", "groom");
    const c = await join("Chahd", "groom");
    await submitAnswer(event, a.player, saved.id, "late", { optionId: "one" });
    await submitAnswer(event, a.player, saved.id, "cook", { optionId: "two" });
    await submitAnswer(event, b.player, saved.id, "late", { optionId: "two" });
    await submitAnswer(event, c.player, saved.id, "late", { optionId: "one" });

    expect((await settleGame(event.id, actor, saved.id)).ok).toBe(false); // still open
    await setGameState(event.id, actor, saved.id, "closed");
    const first = await settleGame(event.id, actor, saved.id);
    expect(first).toMatchObject({ ok: true, awarded: 3 });
    await settleGame(event.id, actor, saved.id);
    const { data: settleRows } = await admin.from("score_events").select("id").eq("event_id", event.id).eq("reason", "vote_settle");
    expect(settleRows).toHaveLength(3);

    // Recompute from the ledger in TypeScript and compare with the stored totals.
    const { data: ledger } = await admin.from("score_events").select("team_id, player_id, points").eq("event_id", event.id);
    const perTeam = new Map<string, Map<string, number>>();
    for (const row of ledger!) {
      const team = perTeam.get(row.team_id!) ?? new Map<string, number>();
      team.set(row.player_id, (team.get(row.player_id) ?? 0) + row.points);
      perTeam.set(row.team_id!, team);
    }
    const n = chooseN(teams.map((t) => perTeam.get(t.id)?.size ?? 0));
    const { data: stored } = await admin.from("team_scores").select("team_id, score").eq("event_id", event.id);
    for (const team of teams) {
      const expected = teamScore([...(perTeam.get(team.id)?.values() ?? [])], n);
      const actual = Number(stored!.find((s) => s.team_id === team.id)?.score ?? 0);
      expect(actual).toBeCloseTo(expected, 2);
    }
  });

  it("a prediction tied to the reveal cannot be settled by the host's own answer", async () => {
    const { event, actor, join } = await setup();
    const config = predictionConfigSchema.parse({
      title: { ar: "توقع", en: "Guess" },
      questions: [{ id: "team", prompt: { ar: "ولد ولا بنت؟", en: "Boy or girl?" }, type: "choice", truthFromReveal: true,
        options: [{ id: "boy", label: { ar: "ولد", en: "Boy" } }, { id: "girl", label: { ar: "بنت", en: "Girl" } }] }],
    });
    const saved = await saveGame(event.id, actor, { kind: "prediction", config });
    if (!saved.ok) throw new Error(saved.issues.join());
    expect((await setTruth(event.id, saved.id, { answers: { team: "girl" } })).ok).toBe(false);

    await setGameState(event.id, actor, saved.id, "open");
    const guest = await join("Farah", "bride");
    await submitAnswer(event, guest.player, saved.id, "team", { value: "girl" });
    await setGameState(event.id, actor, saved.id, "closed");
    expect((await settleGame(event.id, actor, saved.id)).ok).toBe(false);

    await admin.from("live_state").update({ phase: "revealed", public_payload: { answer: ["girl"] } }).eq("event_id", event.id);
    expect(await settleGame(event.id, actor, saved.id)).toMatchObject({ ok: true, awarded: 1 });
  });
});
