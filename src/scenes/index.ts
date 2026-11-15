// Public API of the scroll-scene player. See README.md.

export { ScrollScene, type ScrollSceneProps, type SceneRenderContext, type SceneSlot } from "./ScrollScene";
export { SplashGate, type SplashGateProps, type SplashRenderState } from "./SplashGate";
export { MotionProvider, type MotionProviderProps } from "./MotionProvider";
export { useSplashGate, SplashGateController, type SplashGate as SplashGateHandle, type SplashGateOptions, type SplashGateState, type SplashPhase } from "./use-splash-gate";

export {
  prefetchScript,
  splashBootScript,
  splashCss,
  sceneNoScriptCss,
  PREFETCH_GLOBAL,
  SCENE_DATA_ID,
  SPLASH_ATTR,
  SPLASH_FAILSAFE_MS,
  SPLASH_JS_ATTR,
  SPLASH_PANEL_ATTR,
} from "./boot-script";
export {
  buildPageSceneData,
  serializePageSceneData,
  readPageSceneData,
  getVisitVariant,
  type PageSceneData,
  type PageSceneEntry,
  type PageSceneInput,
  type PrefetchEntry,
  type PrefetchRegistry,
} from "./page-data";

export {
  decodeDescription,
  keyframeAtOrBefore,
  manifestUrl,
  parseManifest,
  pickVariant,
  posterUrls,
  sceneFileUrl,
  sceneFolderUrl,
  sceneKey,
  variantForScreen,
  variantUrl,
  PORTRAIT_RATIO,
  type SceneSource,
  type VariantName,
  type VideoDecodeIndex,
  type VideoManifest,
  type VideoVariant,
} from "./manifest";
export { decideTier, getDeviceTier, getRingSize, readTierEnvironment, ringSizeFor, tierPlaysScenes, type DeviceTier, type TierEnvironment } from "./device-tier";
export {
  clamp01,
  progressToPosition,
  sectionHeightVh,
  sectionProgress,
  sectionSplit,
  walkStep,
  WALK_MS,
  WALK_SNAP,
  type SectionProgress,
  type SectionSplit,
} from "./frame-math";
export {
  getSceneState,
  getSceneStatusServerSnapshot,
  getSceneStatusSnapshot,
  isStillsVisit,
  subscribeSceneStatus,
  switchVisitToStills,
  SCENE_STATUS_GLOBAL,
  type SceneMode,
  type SceneState,
  type SceneStatusSnapshot,
} from "./scene-status";
export { estimateRemainingSeconds, getPreloader, VideoPreloader, LINE_MEASURE_MS, type LineEstimate, type PreloadItem, type PreloadProgress } from "./video-preload";
