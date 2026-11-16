// Shapes of the play sections' data. Games and the wall come from the guest API
// (/api/guest/[slug]/games, /wall, /upload); view and tally shapes are those of
// the pure game modules in src/play. The recap comes from /api/guest/[slug]/recap.
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
  myPoints: number | null; // null while a quiz is open: points show after it closes

  tally: Tally | null;
  results: unknown;
};

// `points` is absent for a quiz answer: whether it scored is not told until the quiz closes.
export type SubmitResult = { ok: true; points: number | null } | { ok: false; error: string };
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

// GET /api/guest/[slug]/recap, after the event. Names are first names of
// approved players only; photo links are short-lived and only for players who
// may see wall photos.
export type RecapData = {
  teams: { id: string; key?: string; name: Localized; color: string; score: number; players?: number }[];
  winnerTeamId: string | null; // null = tie
  topPlayers?: { teamId: string; players: { name: string; points: number }[] }[];
  myPoints: number | null;
  highlights: { id: string; kind?: "text" | "voice" | "photo"; author: string; text: string; mediaUrl?: string | null }[];
};
