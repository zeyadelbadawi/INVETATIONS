"use client";

// Everything personal reaches the page here, in the browser, after the cached
// shell has loaded: one request to /api/guest/[slug]/me (technical design §3).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Block } from "@/content/schema";
import type { TeamPreset } from "@/templates/types";
import type { Locale } from "@/i18n/config";
import { apiGet, apiPost, guestPath } from "../lib/api";
import type { GuestDetails, GuestMe, InviteEvent, RevealStyle } from "../types";

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
  // Guest-only blocks this visitor may see: from /me with a session, or from
  // /details after the event passcode. Null while locked.
  details: GuestDetails | null;
  // How the details were unlocked; "passcode" visitors have no invitation or player.
  access: "session" | "passcode" | null;
  unlock: (passcode: string) => Promise<UnlockResult>;
  refresh: () => void;
  patch: (change: Partial<GuestMe>) => void;
};

export type UnlockResult = "ok" | "wrong" | "locked" | "slow" | "error";

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
  const [unlocked, setUnlocked] = useState<GuestDetails | null>(null);
  const gated = Boolean(event.hasPasscode);
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
        if (!gated) {
          setState({ status: "anon", me: null });
          return;
        }
        // No session: a passcode cookie may still unlock the guest-only blocks.
        // Asked before leaving "loading", so the form does not flash first.
        apiGet<GuestDetails>(guestPath(event.slug, "details"), controller.signal).then((details) => {
          if (controller.signal.aborted) return;
          if (details.ok) setUnlocked(details.data);
          setState({ status: "anon", me: null });
        });
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
  }, [demo, event.slug, attempt, gated]);

  const refresh = useCallback(() => {
    tries.current = 0;
    setAttempt((n) => n + 1);
  }, []);
  const patch = useCallback((change: Partial<GuestMe>) => {
    setState((current) => (current.me ? { ...current, me: { ...current.me, ...change } } : current));
  }, []);

  const unlock = useCallback(
    async (passcode: string): Promise<UnlockResult> => {
      const result = await apiPost<{ ok: true }>(guestPath(event.slug, "passcode"), { passcode });
      if (!result.ok) {
        if (result.status === 401) return "wrong";
        if (result.status === 429) return result.error === "locked" ? "locked" : "slow";
        return "error";
      }
      const details = await apiGet<GuestDetails>(guestPath(event.slug, "details"));
      if (!details.ok) return "error";
      setUnlocked(details.data);
      return "ok";
    },
    [event.slug],
  );

  const me = demo ? demoMe : state.me;
  const status = demo ? "ready" : state.status;
  const details = useMemo<GuestDetails | null>(() => {
    if (status === "ready" && me) return { guestBlocks: me.guestBlocks, media: me.media ?? {}, content: me.content ?? null };
    return unlocked;
  }, [status, me, unlocked]);
  const access = status === "ready" && me ? "session" : unlocked ? "passcode" : null;

  const value = useMemo<InviteContextValue>(
    () => ({
      event,
      locale,
      titleFields,
      teamPresets,
      teamJoin,
      revealStyle,
      demo,
      status,
      me: me ?? null,
      expectGuest: demo || expectGuest,
      details,
      access,
      unlock,
      refresh,
      patch,
    }),
    [event, locale, titleFields, teamPresets, teamJoin, revealStyle, demo, status, me, expectGuest, details, access, unlock, refresh, patch],
  );
  return <InviteContext.Provider value={value}>{children}</InviteContext.Provider>;
}

export function guestBlock(details: GuestDetails | null, id: string): Block | null {
  return details?.guestBlocks.find((block) => block.id === id) ?? null;
}

// CSS colour for a team token such as "team-a". Tokens are an allow-list; anything else falls back to the accent.
export function teamColor(token: string | undefined): string {
  return token && /^team-[abc]$/.test(token) ? `var(--${token})` : "var(--accent)";
}
