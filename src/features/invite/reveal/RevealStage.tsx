"use client";

// The gender-reveal stage: idle → countdown lobby → the guest opens the answer → result.
// The answer exists nowhere on this page until the server releases it (security
// rule 27); until then the stage is the same for every outcome.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { getMessages } from "../messages";
import { apiGet, guestPath } from "../lib/api";
import type { Answer } from "../types";
import { teamColor, useInvite } from "../guest/GuestContext";
import { useLive } from "../guest/Live";
import type { RevealStyleProps } from "./styles";

const loadBalloon = () => import("./Balloon");
const loadScratch = () => import("./Scratch");
const Balloon = dynamic<RevealStyleProps>(loadBalloon, { ssr: false });
const Scratch = dynamic<RevealStyleProps>(loadScratch, { ssr: false });

type RevealResponse = { released: false; remainingMs: number | null } | { released: true; answer: Answer };

const isAnswer = (value: unknown): value is Answer => Array.isArray(value) && value.length > 0 && value.length <= 3 && value.every((item) => item === "boy" || item === "girl");

const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Offset between this phone's clock and the database clock, from /api/time,
// corrected for the round trip. The reveal is released on database time.
function useClockOffset(active: boolean): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let best = Infinity;
    const sample = async () => {
      const sent = Date.now();
      const result = await apiGet<{ now: number }>("/api/time");
      const received = Date.now();
      if (cancelled || !result.ok || typeof result.data?.now !== "number") return;
      const trip = received - sent;
      if (trip < best) {
        best = trip;
        setOffset(result.data.now - (sent + trip / 2));
      }
    };
    void sample();
    const again = setTimeout(sample, 1500);
    const onVisible = () => {
      if (!document.hidden) void sample();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(again);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);
  return offset;
}

function useNow(active: boolean, everyMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, everyMs);
    // A backgrounded tab throttles timers; catch up the moment it returns.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, everyMs]);
  return now;
}

function clock(seconds: number): string {
  if (seconds < 60) return String(seconds);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function RevealStage({ demoAnswer, demoInteractive = false }: { demoAnswer?: Answer; demoInteractive?: boolean }) {
  const { event, locale, me, teamPresets, revealStyle, demo } = useInvite();
  const { live } = useLive();
  const t = getMessages(locale).reveal;
  const calm = useSyncExternalStore(subscribeMotion, reducedMotion, () => false);

  const phase = live?.phase ?? "idle";
  const counting = phase === "countdown" && live?.revealAt != null;
  const [fetched, setFetched] = useState<Answer | null>(null);
  // Was this guest in the lobby? Then they get to open it themselves; a late opener sees the result.
  const [witnessed, setWitnessed] = useState(demoInteractive);
  const [opened, setOpened] = useState(false);
  if (counting && !witnessed) setWitnessed(true);

  const answer = demoAnswer ?? fetched ?? (isAnswer(live?.answer) ? live.answer : null);
  const offset = useClockOffset(counting && !answer);
  const now = useNow(counting && !answer, 200);
  const remainingMs = counting && now !== null && live?.revealAt ? new Date(live.revealAt).getTime() - (now + offset) : null;
  const atZero = remainingMs !== null && remainingMs <= 0;

  // The reveal styles are separate chunks; fetch them during the lobby so zero is instant.
  useEffect(() => {
    if (counting) void (revealStyle === "scratch" ? loadScratch() : loadBalloon());
  }, [counting, revealStyle]);

  // At zero, ask until the server lets go. Jitter keeps a hall of phones from asking in the same instant.
  useEffect(() => {
    if (!atZero || answer || demo) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const ask = async () => {
      const result = await apiGet<RevealResponse>(guestPath(event.slug, "reveal"));
      if (cancelled) return;
      if (result.ok && result.data.released && isAnswer(result.data.answer)) {
        setFetched(result.data.answer);
        return;
      }
      attempt += 1;
      const wait = result.ok && !result.data.released && result.data.remainingMs ? Math.min(result.data.remainingMs, 2000) : Math.min(400 * 1.5 ** attempt, 5000);
      timer = setTimeout(ask, wait + 150 + Math.random() * 600);
    };
    timer = setTimeout(ask, Math.random() * 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [atZero, answer, demo, event.slug]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const finish = useCallback(() => {
    setOpened(true);
    requestAnimationFrame(() => headingRef.current?.focus());
  }, []);

  if (event.status === "cancelled" || event.status === "postponed") return null;

  const colorOf = (kind: "boy" | "girl") => teamColor(teamPresets.find((team) => team.key === kind)?.color);
  const babies = (answer ?? []).map((kind) => ({ label: t[kind], color: colorOf(kind) }));
  const interactive = answer !== null && witnessed && !opened && !calm;
  const showResult = answer !== null && !interactive;

  let verdict: { title: string; body: string } | null = null;
  if (showResult && answer) {
    const mine = me?.teams.find((team) => team.id === me.player?.teamId)?.key;
    const same = answer.every((kind) => kind === answer[0]);
    if (!same) verdict = { title: t.mixed, body: t.mixedBody };
    else if (mine === "boy" || mine === "girl") verdict = mine === answer[0] ? { title: t.won, body: t.wonBody } : { title: t.lost, body: t.lostBody };
    else verdict = { title: t.neutral, body: t.neutralBody };
  }

  const seconds = remainingMs === null ? null : Math.max(0, Math.ceil(remainingMs / 1000));
  const Style = revealStyle === "scratch" ? Scratch : Balloon;

  return (
    <section id="reveal" className="inv-stage" aria-labelledby="reveal-title" data-phase={showResult ? "result" : interactive ? "open" : counting ? "countdown" : "idle"} data-testid="reveal-stage">
      <h2 id="reveal-title" className={showResult ? "inv-sr" : "inv-stage__title"} tabIndex={-1} ref={headingRef}>
        {t.title}
      </h2>

      {showResult && answer ? (
        <div className="inv-result" role="status" data-testid="reveal-result" data-answer={answer.join(",")}>
          <p className="inv-result__headline">
            {babies.map((baby, index) => (
              <span key={index}>
                {index > 0 ? <span className="inv-result__and">{t.and}</span> : null}
                <span className="inv-result__word" style={{ "--answer": baby.color } as CSSProperties}>
                  {babies.length === 1 ? t.itsA(baby.label) : baby.label}
                </span>
              </span>
            ))}
          </p>
          {verdict ? (
            <p className="inv-result__verdict">
              <strong>{verdict.title}</strong> {verdict.body}
            </p>
          ) : null}
          {calm || demo ? null : (
            <button type="button" className="inv-link" onClick={() => (setWitnessed(true), setOpened(false))}>
              {t.again}
            </button>
          )}
        </div>
      ) : interactive ? (
        <div className="inv-stage__open">
          <Style babies={babies} t={t} onDone={finish} />
          <button type="button" className="inv-link" onClick={finish}>
            {t.showNow}
          </button>
        </div>
      ) : counting ? (
        <div className="inv-lobby" data-testid="reveal-countdown">
          <p className="inv-lobby__label">{atZero ? t.almost : t.lobby}</p>
          <p className="inv-lobby__clock inv-num" role="timer" aria-live="off" data-urgent={seconds !== null && seconds <= 10 ? "true" : "false"}>
            <span key={seconds ?? "x"} className="inv-lobby__digits">
              {seconds === null ? "–" : atZero ? "0" : clock(seconds)}
            </span>
          </p>
          <p className="inv-stage__body">{t.lobbyBody}</p>
        </div>
      ) : (
        <p className="inv-stage__body">{t.idle}</p>
      )}
    </section>
  );
}
