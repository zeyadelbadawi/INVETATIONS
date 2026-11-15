// Data interface of the play sections that have no endpoint yet. The components
// in this folder are fed only through these shapes; the hooks in ./hooks return
// null until the endpoints exist, and the page renders a section only when its
// hook returns data. View shapes follow src/play (the pure game modules).
import type { Localized } from "@/content/schema";
import type { QuizQuestionView, QuizView } from "@/play/modules/quiz";
import type { VoteView } from "@/play/modules/vote";
import type { CluesView } from "@/play/modules/clues";
import type { GameState, Tally } from "@/play/types";

// src/play has no prediction module yet; this mirrors the others' conventions.
export type PredictionQuestionView =
  | { id: string; prompt: Localized; type: "choice"; options: { id: string; label: Localized }[] }
  | { id: string; prompt: Localized; type: "number"; min: number; max: number; unit: Localized | null };
export type PredictionView = {
  kind: "prediction";
  state: Exclude<GameState, "hidden">;
  title: Localized;
  intro: Localized | null;
  closesAt: string | null;
  questions: PredictionQuestionView[];
};

export type PredictionAnswer = { optionId: string } | { value: number };
export type SubmitResult = { ok: true; score: number } | { ok: false; error: string };

export type QuizGame = {
  id: string;
  view: QuizView;
  // Ids already answered (or expired) by this player, and the points earned so far.
  doneIds: string[];
  earned: number;
  // Timed quizzes serve one question at a time: ask for the next one, then answer it.
  serveNext: () => Promise<{ question: QuizQuestionView; deadline: number | null } | null>;
  answer: (questionId: string, optionId: string) => Promise<SubmitResult>;
};
export type VoteGame = {
  id: string;
  view: VoteView;
  mine: Record<string, string>; // questionId → optionId
  tally: Tally | null;
  answer: (questionId: string, optionId: string) => Promise<SubmitResult>;
};
export type PredictionGame = {
  id: string;
  view: PredictionView;
  mine: Record<string, PredictionAnswer>;
  answer: (questionId: string, answer: PredictionAnswer) => Promise<SubmitResult>;
};
export type CluesGame = {
  id: string;
  view: CluesView;
  seenIds: string[];
  markSeen: (clueId: string) => Promise<SubmitResult>;
  // Present while the player may still switch team (once, before the countdown).
  switchTeam: ((teamKey: string) => Promise<SubmitResult>) | null;
};
export type Game = QuizGame | VoteGame | PredictionGame | CluesGame;

export type WallPost = {
  id: string;
  kind: "text" | "voice";
  author: string; // first name
  text: string;
  audioUrl: string | null; // short-lived signed URL
  status: "visible" | "pending";
  mine: boolean;
  createdAt: string;
};
export type WallData = {
  posts: WallPost[];
  canPost: boolean;
  voiceEnabled: boolean;
  postText: (text: string) => Promise<SubmitResult>;
  postVoice: (audio: Blob) => Promise<SubmitResult>;
  report: (postId: string) => Promise<void>;
};

export type RecapData = {
  teams: { id: string; name: Localized; color: string; score: number }[];
  winnerTeamId: string | null; // null = tie
  myPoints: number | null;
  highlights: { id: string; author: string; text: string }[];
};
