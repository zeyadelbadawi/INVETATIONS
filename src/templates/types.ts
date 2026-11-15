import type { BlockType, Localized } from "@/content/schema";

export type EventKind = "wedding" | "gender_reveal" | "corporate";

export type SceneRef = {
  id: string;        // e.g. "draft.opening"
  rev: number;
  scrollVh: number;
  holdVh: number;
  leadVh?: number;
  gate: boolean;     // only gating scenes hold the splash (launch scope §4)
};

export type FieldDef = {
  key: string;
  label: Localized;
  maxLength: number;
  required: boolean;
  placeholder?: Localized;
};

// Where a field sits on the footage. Positions are percentages of the frame,
// given per variant because the phone file is a 4:5 crop of the 16:9 frame.
export type OverlaySlot = {
  field: string;
  scene: string;
  role: "eyebrow" | "title" | "subtitle";
  // Visible over this part of the scene: progress (the move) or hold (the last frame).
  appear: { on: "progress" | "hold"; from: number; to: number };
  position: Record<"desktop" | "mobile", { x: number; y: number; width: number }>;
  align: "start" | "center" | "end";
  maxLines: number;
  wash: boolean;
};

export type Palette = {
  id: string;
  name: Localized;
  // Applied to overlays, blocks and the splash. Footage is never recoloured.
  tokens: { ink: string; paper: string; accent: string; accentSoft: string; onAccent: string };
};

export type TeamPreset = { key: string; name: Localized; color: string };

export type Template = {
  id: string;
  version: number;
  kind: EventKind;
  name: Localized;
  description: Localized;
  scenes: SceneRef[];
  fields: FieldDef[];
  overlays: OverlaySlot[];
  splash: { kind: "initials" | "logo"; from: string[] };   // field keys whose first letters form the monogram
  blocks: { type: BlockType; enabled: boolean }[];         // default blocks, in order
  palettes: Palette[];
  fontPairs: { id: string; name: Localized }[];
  teams: TeamPreset[];
  teamJoin: "pick" | "assigned";
  reveal?: { neutral: true; styles: ("balloon" | "scratch")[] };
};
