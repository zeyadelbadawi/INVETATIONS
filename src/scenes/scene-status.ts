// Per-scene state shared between the scenes, the splash gate, tests and a debug meter (playbook §7.3, §10.1).

export type SceneMode = "engine" | "video" | "still";

export type SceneState = {
  /** What draws the scene: the WebCodecs engine, the video element, or just the poster. */
  mode: SceneMode;
  /** The scene has drawn the frame for its scroll position (or settled on its poster). */
  ready: boolean;
  /** The canvas or video is visible over the poster. */
  shown: boolean;
  /** Fractional frame the scroll position asks for. */
  want: number;
  /** Frame index on screen; -1 before the first draw. */
  presented: number;
  /** Largest jump between two consecutive drawn frames. */
  maxStep: number;
  /** The scene holds the splash. */
  gate: boolean;
};

export type SceneStatusSnapshot = {
  scenes: Readonly<Record<string, Readonly<SceneState>>>;
  /** The visit was switched to the still version (slow line, §7.3). */
  stills: boolean;
};

/** Global that exposes the live state to tests and the meter. */
export const SCENE_STATUS_GLOBAL = "__ss";

const live: { scenes: Record<string, SceneState>; stills: boolean } = { scenes: {}, stills: false };
const listeners = new Set<() => void>();
const SERVER_SNAPSHOT: SceneStatusSnapshot = { scenes: {}, stills: false };
let snapshot: SceneStatusSnapshot = SERVER_SNAPSHOT;

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)[SCENE_STATUS_GLOBAL] = live;
}

function publish(): void {
  const scenes: Record<string, SceneState> = {};
  for (const key of Object.keys(live.scenes)) scenes[key] = { ...live.scenes[key] };
  snapshot = { scenes, stills: live.stills };
  for (const listener of [...listeners]) listener();
}

export function subscribeSceneStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Immutable; replaced when a scene's `mode`, `ready`, `shown` or the scene list changes. */
export function getSceneStatusSnapshot(): SceneStatusSnapshot {
  return snapshot;
}

export function getSceneStatusServerSnapshot(): SceneStatusSnapshot {
  return SERVER_SNAPSHOT;
}

/** The live, mutable state of one scene, including the per-frame fields. */
export function getSceneState(key: string): SceneState | undefined {
  return live.scenes[key];
}

export function registerScene(key: string, gate: boolean): () => void {
  const state: SceneState = { mode: "still", ready: false, shown: false, want: 0, presented: -1, maxStep: 0, gate };
  live.scenes[key] = state;
  publish();
  return () => {
    if (live.scenes[key] === state) {
      delete live.scenes[key];
      publish();
    }
  };
}

/**
 * Updates a scene. `want`, `presented` and `maxStep` change every frame, so they are written
 * without waking subscribers; read them with `getSceneState` or from the global.
 */
export function reportScene(key: string, patch: Partial<Omit<SceneState, "gate">>): void {
  const state = live.scenes[key];
  if (!state) return;
  const notify =
    (patch.mode !== undefined && patch.mode !== state.mode) ||
    (patch.ready !== undefined && patch.ready !== state.ready) ||
    (patch.shown !== undefined && patch.shown !== state.shown);
  Object.assign(state, patch);
  if (notify) publish();
}

export function isStillsVisit(): boolean {
  return live.stills;
}

/** Switches the whole visit to the still version; scenes drop their players. */
export function switchVisitToStills(): void {
  if (live.stills) return;
  live.stills = true;
  publish();
}
