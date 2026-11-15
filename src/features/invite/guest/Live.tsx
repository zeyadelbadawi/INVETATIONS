"use client";

// One poller per page for the public live endpoint (technical design §7):
// every 5 s, every second inside a countdown, paused while the tab is hidden,
// backing off when the network fails. The URL never carries a query string.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiGet, livePath } from "../lib/api";
import type { LivePayload } from "../types";
import { useInvite } from "./GuestContext";

type LiveValue = { live: LivePayload | null; failing: boolean };
const LiveContext = createContext<LiveValue>({ live: null, failing: false });

export const useLive = () => useContext(LiveContext);

const IDLE_MS = 5000;
const COUNTDOWN_MS = 1000;
const MAX_BACKOFF_MS = 60_000;

export function LiveProvider({ demoLive, children }: { demoLive?: LivePayload; children: ReactNode }) {
  const { event, status, demo } = useInvite();
  const slug = event.slug;
  // The reveal is public to the link; scores are only shown to guests with a session.
  const closed = event.status === "cancelled" || event.status === "postponed";
  const enabled = !demo && !closed && ((event.kind === "gender_reveal" && event.entitlements.reveal) || (event.entitlements.games && status === "ready"));
  const [value, setValue] = useState<LiveValue>({ live: null, failing: false });
  const phase = useRef<LivePayload["phase"]>("idle");

  useEffect(() => {
    if (!enabled || demoLive) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let failures = 0;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (!stopped && !document.hidden) timer = setTimeout(poll, ms);
    };
    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      const result = await apiGet<LivePayload>(livePath(slug), controller.signal);
      if (stopped || controller.signal.aborted) return;
      if (result.ok && typeof result.data?.phase === "string") {
        failures = 0;
        phase.current = result.data.phase;
        setValue((current) => (current.live && current.live.v === result.data.v && sameScores(current.live, result.data) && !current.failing ? current : { live: result.data, failing: false }));
        schedule(result.data.phase === "countdown" ? COUNTDOWN_MS : IDLE_MS);
      } else if (result.status === 404) {
        stopped = true; // unknown event: nothing to poll
      } else {
        failures += 1;
        setValue((current) => (current.failing ? current : { ...current, failing: true }));
        const base = phase.current === "countdown" ? COUNTDOWN_MS : IDLE_MS;
        schedule(Math.min(MAX_BACKOFF_MS, base * 2 ** Math.min(failures, 6)) * (0.8 + Math.random() * 0.4));
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(timer);
        controller?.abort();
      } else {
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [slug, enabled, demoLive]);

  return <LiveContext.Provider value={demoLive ? { live: demoLive, failing: false } : value}>{children}</LiveContext.Provider>;
}

function sameScores(a: LivePayload, b: LivePayload): boolean {
  if (a.phase !== b.phase || a.revealAt !== b.revealAt || a.scores.length !== b.scores.length) return false;
  return a.scores.every((s, i) => s.teamId === b.scores[i].teamId && s.score === b.scores[i].score && s.players === b.scores[i].players);
}
