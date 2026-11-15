"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { burst, resolveColor } from "./confetti";
import type { RevealStyleProps } from "./styles";

const TAPS = 3;

// One balloon per baby. Each tap blows it up a little; the third pops it.
export default function Balloon({ babies, t, onDone }: RevealStyleProps) {
  const [taps, setTaps] = useState<number[]>(() => babies.map(() => 0));
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stops = useRef<(() => void)[]>([]);
  const allPopped = taps.every((n) => n >= TAPS);

  useEffect(() => {
    if (!allPopped) return;
    const timer = setTimeout(onDone, 1500);
    return () => clearTimeout(timer);
  }, [allPopped, onDone]);
  useEffect(() => () => stops.current.forEach((stop) => stop()), []);

  const tap = (index: number, target: HTMLElement) => {
    const next = taps[index] + 1;
    setTaps((current) => current.map((n, i) => (i === index ? n + 1 : n)));
    if (next !== TAPS) return;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const box = target.getBoundingClientRect();
    const frame = stage.getBoundingClientRect();
    const colors = [babies[index].color, "var(--paper)", "var(--accent)"].map((c) => resolveColor(stage, c));
    stops.current.push(burst(canvas, { x: box.left - frame.left + box.width / 2, y: box.top - frame.top + box.height * 0.4 }, [colors[0], colors[0], colors[1], colors[2]]));
    navigator.vibrate?.(30);
  };

  const left = Math.max(...taps.map((n) => TAPS - n));
  return (
    <div className="inv-balloons" ref={stageRef} data-count={babies.length}>
      <canvas ref={canvasRef} className="inv-confetti" aria-hidden="true" />
      <div className="inv-balloons__row">
        {babies.map((baby, index) =>
          taps[index] >= TAPS ? (
            <p key={index} className="inv-balloons__answer" style={{ "--answer": baby.color } as CSSProperties}>
              {baby.label}
            </p>
          ) : (
            <button key={index} type="button" className="inv-balloon" data-taps={taps[index]} onClick={(e) => tap(index, e.currentTarget)} aria-label={babies.length > 1 ? `${t.balloonHint} (${t.baby(index + 1)})` : t.balloonHint}>
              <svg viewBox="0 0 120 170" width="120" height="170" aria-hidden="true" focusable="false">
                <path className="inv-balloon__string" d="M60 132c-8 10 8 16 0 36" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path className="inv-balloon__body" d="M60 4c30 0 50 24 50 56 0 34-26 62-44 68l4 8H50l4-8C36 122 10 94 10 60 10 28 30 4 60 4z" fill="currentColor" />
                <path d="M36 30c8-10 18-14 28-14" fill="none" stroke="var(--paper)" strokeOpacity="0.5" strokeWidth="5" strokeLinecap="round" />
              </svg>
            </button>
          ),
        )}
      </div>
      <p className="inv-hint" role="status">
        {allPopped ? "" : left === TAPS ? t.balloonHint : t.balloonMore(left)}
      </p>
    </div>
  );
}
