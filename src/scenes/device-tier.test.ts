import { describe, expect, it } from "vitest";
import { decideTier, readTierEnvironment, ringSizeFor, tierPlaysScenes, type TierEnvironment } from "./device-tier";

const desktop: TierEnvironment = {
  reducedMotion: false,
  saveData: false,
  effectiveType: "4g",
  coarsePointer: false,
  viewportWidth: 1440,
  deviceMemoryGb: 8,
};

describe("decideTier", () => {
  it("gives HIGH to a capable desktop", () => {
    expect(decideTier(desktop)).toBe("HIGH");
  });

  it("gives STATIC for reduced motion, whatever else is true", () => {
    expect(decideTier({ ...desktop, reducedMotion: true })).toBe("STATIC");
    expect(decideTier({ ...desktop, reducedMotion: true, saveData: true })).toBe("STATIC");
  });

  it("gives LOW for Save-Data and for 2g / slow-2g", () => {
    expect(decideTier({ ...desktop, saveData: true })).toBe("LOW");
    expect(decideTier({ ...desktop, effectiveType: "2g" })).toBe("LOW");
    expect(decideTier({ ...desktop, effectiveType: "slow-2g" })).toBe("LOW");
  });

  it("does not downgrade on a 3g estimate", () => {
    expect(decideTier({ ...desktop, effectiveType: "3g" })).toBe("HIGH");
  });

  it("gives MID for a coarse pointer, a narrow viewport or little memory", () => {
    expect(decideTier({ ...desktop, coarsePointer: true })).toBe("MID");
    expect(decideTier({ ...desktop, viewportWidth: 1023 })).toBe("MID");
    expect(decideTier({ ...desktop, viewportWidth: 1024 })).toBe("HIGH");
    expect(decideTier({ ...desktop, deviceMemoryGb: 4 })).toBe("MID");
    expect(decideTier({ ...desktop, deviceMemoryGb: 2 })).toBe("MID");
  });

  it("treats missing connection and memory hints as no reason to downgrade", () => {
    expect(decideTier({ ...desktop, effectiveType: undefined, deviceMemoryGb: undefined })).toBe("HIGH");
  });

  it("plays scenes on MID and HIGH only", () => {
    expect(tierPlaysScenes("HIGH")).toBe(true);
    expect(tierPlaysScenes("MID")).toBe(true);
    expect(tierPlaysScenes("LOW")).toBe(false);
    expect(tierPlaysScenes("STATIC")).toBe(false);
  });
});

describe("ringSizeFor", () => {
  it("keeps 24 frames on desktop, 18 on phones, 12 with 4 GB or less", () => {
    expect(ringSizeFor({ coarsePointer: false, deviceMemoryGb: 8 })).toBe(24);
    expect(ringSizeFor({ coarsePointer: false })).toBe(24);
    expect(ringSizeFor({ coarsePointer: true, deviceMemoryGb: 8 })).toBe(18);
    expect(ringSizeFor({ coarsePointer: true })).toBe(18);
    expect(ringSizeFor({ coarsePointer: false, deviceMemoryGb: 4 })).toBe(12);
    expect(ringSizeFor({ coarsePointer: true, deviceMemoryGb: 2 })).toBe(12);
  });
});

describe("readTierEnvironment", () => {
  function fakeWindow(queries: Record<string, boolean>, navigator: object, innerWidth: number): Window {
    return {
      innerWidth,
      navigator,
      matchMedia: (query: string) => ({ matches: queries[query] === true }),
    } as unknown as Window;
  }

  it("reads media queries and navigator hints", () => {
    const env = readTierEnvironment(
      fakeWindow({ "(pointer: coarse)": true }, { connection: { saveData: true, effectiveType: "3g" }, deviceMemory: 4 }, 390),
    );
    expect(env).toEqual({
      reducedMotion: false,
      saveData: true,
      effectiveType: "3g",
      coarsePointer: true,
      viewportWidth: 390,
      deviceMemoryGb: 4,
    });
  });

  it("copes with browsers that have neither hint", () => {
    const env = readTierEnvironment(fakeWindow({ "(prefers-reduced-motion: reduce)": true }, {}, 1280));
    expect(env.reducedMotion).toBe(true);
    expect(env.saveData).toBe(false);
    expect(env.effectiveType).toBeUndefined();
    expect(env.deviceMemoryGb).toBeUndefined();
    expect(decideTier(env)).toBe("STATIC");
  });
});
