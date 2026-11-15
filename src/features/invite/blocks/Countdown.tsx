"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { getMessages } from "../messages";

const pad = (n: number) => String(n).padStart(2, "0");

// Ticks in the browser only: the server render (which is cached) shows dashes,
// so the shell never contains a time.
export function Countdown({ target, locale }: { target: string; locale: Locale }) {
  const t = getMessages(locale);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const left = now === null ? null : Math.max(0, new Date(target).getTime() - now);
  if (left === 0) return <p className="inv-countdown__done">{t.blocks.started}</p>;

  const seconds = left === null ? null : Math.floor(left / 1000);
  const cells: [string, string][] = [
    [seconds === null ? "––" : String(Math.floor(seconds / 86400)), t.blocks.days],
    [seconds === null ? "––" : pad(Math.floor((seconds % 86400) / 3600)), t.blocks.hours],
    [seconds === null ? "––" : pad(Math.floor((seconds % 3600) / 60)), t.blocks.minutes],
    [seconds === null ? "––" : pad(seconds % 60), t.blocks.seconds],
  ];
  return (
    <div className="inv-countdown" role="timer" aria-label={t.blocks.countdown}>
      {cells.map(([value, label]) => (
        <div key={label} className="inv-countdown__cell">
          <span className="inv-countdown__value inv-num">{value}</span>
          <span className="inv-countdown__label">{label}</span>
        </div>
      ))}
    </div>
  );
}
