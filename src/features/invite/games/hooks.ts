"use client";

// Connection points for the endpoints that do not exist yet (games, wall,
// recap). Each returns null, so the production page renders none of these
// sections. Replace the bodies with real fetching; the components need no change.
import type { Game, RecapData, WallData } from "./types";

export function useGames(_slug: string): Game[] | null {
  void _slug;
  return null;
}

export function useWall(_slug: string): WallData | null {
  void _slug;
  return null;
}

export function useRecap(_slug: string): RecapData | null {
  void _slug;
  return null;
}
