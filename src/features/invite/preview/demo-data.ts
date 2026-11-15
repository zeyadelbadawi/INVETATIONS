// Sample data for the editor preview only. Nothing here is imported by the
// live invitation page: the preview is also the visual harness for the play
// sections whose endpoints do not exist yet.
import type { Template } from "@/templates/types";
import type { Locale } from "@/i18n/config";
import { getMessages } from "../messages";
import type { DemoExtras } from "../Extras";
import type { Game, RecapData, WallData } from "../games/types";
import type { GuestMe, LivePayload } from "../types";

const L = (ar: string, en: string) => ({ ar, en });
const ok = async () => ({ ok: true as const, score: 5 });

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

function demoGames(kind: Template["kind"]): Game[] {
  const quiz: Game = {
    id: "g1",
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
      questions: [
        {
          id: "q1",
          prompt: L("اتقابلوا أول مرة فين؟", "Where did they first meet?"),
          image: null,
          options: [
            { id: "a", label: L("في الجامعة", "At university") },
            { id: "b", label: L("في فرح صاحبهم", "At a friend's wedding") },
            { id: "c", label: L("في الشغل", "At work") },
          ],
        },
      ],
    },
    doneIds: [],
    earned: 0,
    serveNext: async () => null,
    answer: ok,
  };
  const vote: Game = {
    id: "g2",
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
      questions: [
        {
          id: "v1",
          prompt: L("مين بيتأخر دايماً؟", "Who's always late?"),
          options: [
            { id: "him", label: L("هو", "Him") },
            { id: "her", label: L("هي", "Her") },
          ],
        },
      ],
    },
    mine: { v1: "him" },
    tally: { questions: [{ id: "v1", total: 23, options: [{ id: "him", count: 15 }, { id: "her", count: 8 }], numbers: null, suppressed: null }] },
    answer: ok,
  };
  const prediction: Game = {
    id: "g3",
    view: {
      kind: "prediction",
      state: "open",
      title: L("توقعات اليوم", "Predictions for the day"),
      intro: null,
      closesAt: null,
      questions: [
        { id: "p1", prompt: L("الزفة هتتأخر كام دقيقة؟", "How many minutes late will the zaffa start?"), type: "number", min: 0, max: 180, unit: L("دقيقة", "minutes") },
        {
          id: "p2",
          prompt: L("مين هيعيط الأول؟", "Who cries first?"),
          type: "choice",
          options: [
            { id: "mum", label: L("ماما", "Mum") },
            { id: "dad", label: L("بابا", "Dad") },
          ],
        },
      ],
    },
    mine: {},
    answer: ok,
  };
  const clues: Game = {
    id: "g4",
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
    seenIds: [],
    markSeen: ok,
    switchTeam: ok,
  };
  return kind === "gender_reveal" ? [clues, vote, prediction] : [quiz, vote, prediction];
}

function demoWall(locale: Locale): WallData {
  const pickText = (ar: string, en: string) => (locale === "ar" ? ar : en);
  return {
    canPost: true,
    voiceEnabled: true,
    postText: ok,
    postVoice: ok,
    report: async () => {},
    posts: [
      { id: "w1", kind: "text", author: pickText("خالتو منى", "Aunt Mona"), text: pickText("ربنا يتمم بخير ويسعدكم يا حبايبي", "May your days together be full of joy"), audioUrl: null, status: "visible", mine: false, createdAt: "" },
      { id: "w2", kind: "text", author: pickText("كريم", "Karim"), text: pickText("أخيراً! مستني الفرح من سنين", "Finally! I've waited years for this wedding"), audioUrl: null, status: "pending", mine: true, createdAt: "" },
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
