// Sample data for the editor preview only. Nothing here is imported by the
// live invitation page: the preview is also the visual harness for the play
// sections whose endpoints do not exist yet.
import type { Template } from "@/templates/types";
import type { Locale } from "@/i18n/config";
import { getMessages } from "../messages";
import type { DemoExtras } from "../Extras";
import type { GameItem, GamesData, RecapData, WallData } from "../games/types";
import type { GuestMe, LivePayload } from "../types";

const L = (ar: string, en: string) => ({ ar, en });
const ok = async () => ({ ok: true as const, points: 5 });

export function demoMe(template: Template, locale: Locale, guestBlocks: GuestMe["guestBlocks"], joined: boolean): GuestMe {
  const t = getMessages(locale);
  const teams = template.teams.map((team) => ({ id: team.key, key: team.key, name: team.name, color: team.color }));
  return {
    invitation: { kind: "personal", label: t.preview.guestName, paxCap: 4 },
    player: joined ? { id: "demo", name: t.preview.playerName, teamId: teams[teams.length - 1]?.id ?? null, approved: true, teamSwitchedAt: null } : null,
    household: [],
    rsvp: null,
    teams,
    guestBlocks,
    rsvpOpen: true,
  };
}

export function demoLive(template: Template, phase: LivePayload["phase"], revealInSeconds = 42): LivePayload {
  const sample = [64, 58, 37];
  return {
    v: 1,
    status: "published",
    phase,
    revealAt: phase === "countdown" ? new Date(Date.now() + revealInSeconds * 1000).toISOString() : null,
    answer: null,
    scores: template.teams.map((team, index) => ({ teamId: team.key, score: sample[index] ?? 20, players: 9 - index * 2 })),
  };
}

const noResults = { answered: [] as string[], myPoints: 0, tally: null, results: null };

function demoGames(kind: Template["kind"]): GamesData {
  const quiz: GameItem = {
    ...noResults,
    id: "g1",
    kind: "quiz",
    state: "open",
    view: {
      kind: "quiz",
      state: "open",
      title: L("مين عارف العرسان أكتر؟", "Who knows the couple best?"),
      intro: L("5 أسئلة سريعة. كل إجابة صح بتزوّد فريقك.", "Five quick questions. Every right answer scores for your team."),
      timed: false,
      secondsPerQuestion: 20,
      pointsCorrect: 10,
      speedBonus: 0,
      questionIds: ["q1"],
      questions: null,
    },
  };
  const vote: GameItem = {
    ...noResults,
    id: "g2",
    kind: "vote",
    state: "open",
    view: {
      kind: "vote",
      state: "open",
      title: L("مين فيهم؟", "Who's more likely?"),
      intro: null,
      mode: "this_or_that",
      showTally: "after_vote",
      minTallyVotes: 5,
      pointsParticipation: 2,
      pointsMatch: 5,
      questions: [{ id: "v1", prompt: L("مين بيتأخر دايماً؟", "Who's always late?"), options: [{ id: "him", label: L("هو", "Him") }, { id: "her", label: L("هي", "Her") }] }],
    },
    answered: ["v1"],
    tally: { questions: [{ id: "v1", total: 23, options: [{ id: "him", count: 15 }, { id: "her", count: 8 }], numbers: null, suppressed: null }] },
  };
  const prediction: GameItem = {
    ...noResults,
    id: "g3",
    kind: "prediction",
    state: "open",
    view: {
      kind: "prediction",
      state: "open",
      title: L("توقعات اليوم", "Predictions for the day"),
      intro: null,
      pointsParticipation: 2,
      pointsExact: 10,
      pointsClose: 5,
      questions: [
        { id: "p1", prompt: L("الزفة هتتأخر كام دقيقة؟", "How many minutes late will the zaffa start?"), type: "number", min: 0, max: 180, unit: L("دقيقة", "minutes"), tolerance: 5 },
        { id: "p2", prompt: L("مين هيعيط الأول؟", "Who cries first?"), type: "choice", truthFromReveal: false, options: [{ id: "mum", label: L("ماما", "Mum") }, { id: "dad", label: L("بابا", "Dad") }] },
      ],
    },
  };
  const clues: GameItem = {
    ...noResults,
    id: "g4",
    kind: "clues",
    state: "open",
    view: {
      kind: "clues",
      state: "open",
      title: L("علامات الحمل", "The old wives' signs"),
      intro: L("شوف العلامات وقرر: هتفضل في فريقك؟", "Read the signs and decide: are you staying on your team?"),
      pointsParticipation: 1,
      clues: [
        { id: "c1", locked: false, text: L("ماما نفسها في حادق طول الوقت", "Mum craves salty food all the time"), hint: L("بيقولوا الحادق يعني ولد", "They say salty means a boy") },
        { id: "c2", locked: true, revealAt: new Date(Date.now() + 86_400_000).toISOString() },
      ],
    },
  };
  return {
    games: kind === "gender_reveal" ? [clues, vote, prediction] : [quiz, vote, prediction],
    answer: ok,
    serve: async () => ({ ok: true, done: true }),
    switchTeam: kind === "gender_reveal" ? ok : null,
    refresh: () => {},
  };
}

function demoWall(locale: Locale): WallData {
  const say = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const post = { kind: "text" as const, teamId: null, mediaUrl: null, createdAt: "" };
  return {
    canPost: true,
    voiceEnabled: true,
    photosEnabled: true,
    postText: ok,
    postMedia: ok,
    report: async () => {},
    posts: [
      { ...post, id: "w1", author: say("خالتو منى", "Aunt Mona"), body: say("ربنا يتمم بخير ويسعدكم يا حبايبي", "May your days together be full of joy"), status: "visible", mine: false },
      { ...post, id: "w2", author: say("كريم", "Karim"), body: say("أخيراً! مستني الفرح من سنين", "Finally! I've waited years for this wedding"), status: "pending", mine: true },
    ],
  };
}

function demoRecap(template: Template, locale: Locale): RecapData {
  const teams = template.teams.map((team, index) => ({ id: team.key, name: team.name, color: team.color, score: [72, 64, 41][index] ?? 30 }));
  return {
    teams,
    winnerTeamId: teams[0]?.id ?? null,
    myPoints: 34,
    highlights: [{ id: "h1", author: locale === "ar" ? "تيتة" : "Grandma", text: locale === "ar" ? "ألف مبروك يا ولاد" : "Congratulations, my dears" }],
  };
}

export function demoExtras(template: Template, locale: Locale): DemoExtras {
  return { games: demoGames(template.kind), wall: demoWall(locale), recap: demoRecap(template, locale), shareOpen: true };
}
