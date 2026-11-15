"use client";

// Everything personal reaches the page here, in the browser, after the cached
// shell has loaded: one request to /api/guest/[slug]/me (technical design §3).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Block } from "@/content/schema";
import type { TeamPreset } from "@/templates/types";
import type { Locale } from "@/i18n/config";
import { apiGet, guestPath } from "../lib/api";
import type { GuestMe, InviteEvent, RevealStyle } from "../types";

export type GuestStatus = "loading" | "anon" | "ready" | "error";

export type InviteContextValue = {
  event: InviteEvent;
  locale: Locale;
  titleFields: string[];
  teamPresets: TeamPreset[];
  teamJoin: "pick" | "assigned";
  revealStyle: RevealStyle;
  // The editor preview: sample data, nothing is sent anywhere.
  demo: boolean;
  status: GuestStatus;
  me: GuestMe | null;
  // A session was seen on this device before: show skeletons instead of the "open your link" card while loading.
  expectGuest: boolean;
  refresh: () => void;
  patch: (change: Partial<GuestMe>) => void;
};

const InviteContext = createContext<InviteContextValue | null>(null);

export function useInvite(): InviteContextValue {
  const value = useContext(InviteContext);
  if (!value) throw new Error("useInvite must be used inside InviteProvider");
  return value;
}

const hintKey = (slug: string) => `lamma:guest:${slug}`;

function readHint(slug: string): boolean {
  try {
    return window.localStorage.getItem(hintKey(slug)) === "1";
  } catch {
    return false;
  }
}

export function writeGuestHint(slug: string, present: boolean): void {
  try {
    if (present) window.localStorage.setItem(hintKey(slug), "1");
    else window.localStorage.removeItem(hintKey(slug));
  } catch {
    // Storage may be unavailable (private mode); the hint is only cosmetic.
  }
}

const subscribeNever = () => () => {};

export type InviteProviderProps = {
  event: InviteEvent;
  locale: Locale;
  titleFields: string[];
  teamPresets: TeamPreset[];
  teamJoin: "pick" | "assigned";
  revealStyle: RevealStyle;
  // Given by the preview: used as-is, no request is made.
  demoMe?: GuestMe;
  children: ReactNode;
};

const RETRY_MS = [1500, 4000, 10000];

export function InviteProvider({ event, locale, titleFields, teamPresets, teamJoin, revealStyle, demoMe, children }: InviteProviderProps) {
  const demo = demoMe !== undefined;
  const [state, setState] = useState<{ status: GuestStatus; me: GuestMe | null }>({ status: "loading", me: null });
  const [attempt, setAttempt] = useState(0);
  const tries = useRef(0);
  const expectGuest = useSyncExternalStore(
    subscribeNever,
    () => readHint(event.slug),
    () => false,
  );

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    apiGet<GuestMe>(guestPath(event.slug, "me"), controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) {
        tries.current = 0;
        writeGuestHint(event.slug, true);
        setState({ status: "ready", me: result.data });
      } else if (result.status === 401 || result.status === 404) {
        writeGuestHint(event.slug, false);
        setState({ status: "anon", me: null });
      } else if (tries.current < RETRY_MS.length) {
        timer = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS[tries.current++]);
      } else {
        setState((current) => (current.status === "ready" ? current : { status: "error", me: null }));
      }
    });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [demo, event.slug, attempt]);

  const refresh = useCallback(() => {
    tries.current = 0;
    setAttempt((n) => n + 1);
  }, []);
  const patch = useCallback((change: Partial<GuestMe>) => {
    setState((current) => (current.me ? { ...current, me: { ...current.me, ...change } } : current));
  }, []);

  const value = useMemo<InviteContextValue>(
    () => ({
      event,
      locale,
      titleFields,
      teamPresets,
      teamJoin,
      revealStyle,
      demo,
      status: demo ? "ready" : state.status,
      me: demo ? demoMe : state.me,
      expectGuest: demo || expectGuest,
      refresh,
      patch,
    }),
    [event, locale, titleFields, teamPresets, teamJoin, revealStyle, demo, demoMe, state, expectGuest, refresh, patch],
  );
  return <InviteContext.Provider value={value}>{children}</InviteContext.Provider>;
}

export function guestBlock(me: GuestMe | null, id: string): Block | null {
  return me?.guestBlocks.find((block) => block.id === id) ?? null;
}

// CSS colour for a team token such as "team-a". Tokens are an allow-list; anything else falls back to the accent.
export function teamColor(token: string | undefined): string {
  return token && /^team-[abc]$/.test(token) ? `var(--${token})` : "var(--accent)";
}
