// Shapes of the play sections' data. Games and the wall come from the guest API
// (/api/guest/[slug]/games, /wall, /upload); view and tally shapes are those of
// the pure game modules in src/play. The recap has no endpoint yet.
import type { Localized } from "@/content/schema";
import type { QuizQuestionView, QuizView } from "@/play/modules/quiz";
import type { VoteView } from "@/play/modules/vote";
import type { CluesView } from "@/play/modules/clues";
import type { PredictionView } from "@/play/modules/prediction";
import type { GameState, Tally } from "@/play/types";

export type GameView = QuizView | VoteView | PredictionView | CluesView;

// One entry of GET /api/guest/[slug]/games.
export type GameItem = {
  id: string;
  kind: string;
  state: GameState;
  view: GameView;
  answered: string[]; // question ids this player has answered
  myPoints: number;
  tally: Tally | null;
  results: unknown;
};

export type SubmitResult = { ok: true; points: number } | { ok: false; error: string };
export type ServeResult = { ok: true; done: true } | { ok: true; done: false; question: QuizQuestionView; servedAt: number; seconds: number | null } | { ok: false; error: string };
export type AnswerValue = { optionId: string } | { value: string | number } | { seen: true };

export type GamesData = {
  games: GameItem[];
  answer: (gameId: string, questionId: string, answer: AnswerValue) => Promise<SubmitResult>;
  serve: (gameId: string) => Promise<ServeResult>;
  // Present while this player may still change sides (once, before the countdown).
  switchTeam: ((teamKey: string) => Promise<SubmitResult>) | null;
  refresh: () => void;
};

// One entry of GET /api/guest/[slug]/wall.
export type WallPost = {
  id: string;
  kind: "text" | "voice" | "photo";
  body: string | null;
  author: string;
  teamId: string | null;
  mine: boolean;
  status: "visible" | "pending";
  mediaUrl: string | null; // short-lived signed URL
  createdAt: string;
};
export type WallData = {
  posts: WallPost[];
  canPost: boolean;
  voiceEnabled: boolean;
  photosEnabled: boolean;
  postText: (text: string) => Promise<SubmitResult>;
  postMedia: (purpose: "wall_voice" | "wall_photo", file: Blob, caption: string) => Promise<SubmitResult>;
  report: (postId: string) => Promise<void>;
};

export type RecapData = {
  teams: { id: string; name: Localized; color: string; score: number }[];
  winnerTeamId: string | null; // null = tie
  myPoints: number | null;
  highlights: { id: string; author: string; text: string }[];
};
