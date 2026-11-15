// Device tier, decided once per page load (playbook §6.2).
// The inline boot scripts (boot-script.ts) repeat the STATIC/LOW rules; keep them in step.

export type DeviceTier = "STATIC" | "LOW" | "MID" | "HIGH";

export type TierEnvironment = {
  reducedMotion: boolean;
  saveData: boolean;
  /** `navigator.connection.effectiveType`, where the browser has it. */
  effectiveType?: string;
  coarsePointer: boolean;
  viewportWidth: number;
  /** `navigator.deviceMemory` in GB, where the browser has it. */
  deviceMemoryGb?: number;
};

const TWO_G = /(^|-)2g$/;
const MID_MAX_WIDTH = 1024;
const LOW_MEMORY_GB = 4;

export function decideTier(env: TierEnvironment): DeviceTier {
  if (env.reducedMotion) return "STATIC";
  // Only Save-Data and 2G drop to stills. Chrome reports "3g" on ordinary Wi-Fi;
  // the real line speed is measured during the download instead (§7.3).
  if (env.saveData || TWO_G.test(env.effectiveType ?? "")) return "LOW";
  const lowMemory = env.deviceMemoryGb !== undefined && env.deviceMemoryGb <= LOW_MEMORY_GB;
  if (env.coarsePointer || env.viewportWidth < MID_MAX_WIDTH || lowMemory) return "MID";
  return "HIGH";
}

/** Scenes play on MID and HIGH; STATIC and LOW get the still version. */
export function tierPlaysScenes(tier: DeviceTier): boolean {
  return tier === "MID" || tier === "HIGH";
}

/** Decoded-frame ring: 24 on desktop, 18 on phones, 12 with ≤ 4 GB (§6.5). */
export function ringSizeFor(env: Pick<TierEnvironment, "coarsePointer" | "deviceMemoryGb">): number {
  if (env.deviceMemoryGb !== undefined && env.deviceMemoryGb <= LOW_MEMORY_GB) return 12;
  return env.coarsePointer ? 18 : 24;
}

type ConnectionLike = { saveData?: boolean; effectiveType?: string };
type NavigatorWithHints = Navigator & { connection?: ConnectionLike; deviceMemory?: number };

export function readTierEnvironment(win: Window): TierEnvironment {
  const nav = win.navigator as NavigatorWithHints;
  const matches = (query: string) => typeof win.matchMedia === "function" && win.matchMedia(query).matches;
  return {
    reducedMotion: matches("(prefers-reduced-motion: reduce)"),
    saveData: nav.connection?.saveData === true,
    effectiveType: nav.connection?.effectiveType,
    coarsePointer: matches("(pointer: coarse)"),
    viewportWidth: win.innerWidth,
    deviceMemoryGb: nav.deviceMemory,
  };
}

let cached: { tier: DeviceTier; ringSize: number } | null = null;

function decideOnce(): { tier: DeviceTier; ringSize: number } {
  if (!cached) {
    const env = readTierEnvironment(window);
    cached = { tier: decideTier(env), ringSize: ringSizeFor(env) };
  }
  return cached;
}

/** Browser only. The first call decides; later calls return the same answer for the whole visit. */
export function getDeviceTier(): DeviceTier {
  return decideOnce().tier;
}

/** Browser only. */
export function getRingSize(): number {
  return decideOnce().ringSize;
}
