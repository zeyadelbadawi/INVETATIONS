"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { burst, resolveColor } from "./confetti";
import type { RevealStyleProps } from "./styles";

const BRUSH = 26;
const CLEAR_AT = 0.5;

function Card({ baby, hint, onCleared }: { baby: { label: string; color: string }; hint: string; onCleared: (element: HTMLElement) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!wrap || !canvas || !context) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    // The foil is the same for every answer: accent stripes and the hint.
    const foil = resolveColor(wrap, "var(--accent)");
    const shine = resolveColor(wrap, "color-mix(in oklab, var(--accent) 70%, var(--paper))");
    context.fillStyle = foil;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = shine;
    context.lineWidth = 6;
    for (let x = -height; x < width; x += 22) {
      context.beginPath();
      context.moveTo(x, height);
      context.lineTo(x + height, 0);
      context.stroke();
    }
    context.fillStyle = resolveColor(wrap, "var(--on-accent)");
    context.font = `600 16px ${getComputedStyle(wrap).fontFamily}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(hint, width / 2, height / 2);
    context.globalCompositeOperation = "destination-out";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = BRUSH * 2;

    let drawing = false;
    let done = false;
    let last: { x: number; y: number } | null = null;
    let moves = 0;

    const point = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    const scratch = (to: { x: number; y: number }) => {
      context.beginPath();
      context.moveTo(last?.x ?? to.x, last?.y ?? to.y);
      context.lineTo(to.x + 0.01, to.y + 0.01);
      context.stroke();
      last = to;
    };
    const check = () => {
      if (done) return;
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0;
      let total = 0;
      for (let i = 3; i < data.length; i += 4 * 97) {
        total += 1;
        if (data[i] < 40) clear += 1;
      }
      if (clear / total >= CLEAR_AT) {
        done = true;
        setCleared(true);
        onCleared(wrap);
      }
    };
    const down = (event: PointerEvent) => {
      drawing = true;
      last = null;
      canvas.setPointerCapture(event.pointerId);
      scratch(point(event));
    };
    const move = (event: PointerEvent) => {
      if (!drawing) return;
      scratch(point(event));
      if (++moves % 14 === 0) check();
    };
    const up = () => {
      drawing = false;
      check();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
    // The card is drawn once; its inputs do not change while it is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="inv-scratch__card" ref={wrapRef} style={{ "--answer": baby.color } as CSSProperties} data-cleared={cleared ? "true" : "false"}>
      <p className="inv-scratch__answer">{baby.label}</p>
      <canvas ref={canvasRef} className="inv-scratch__foil" aria-hidden="true" />
    </div>
  );
}

// A scratch card per baby. The answer sits under the foil, so this component is
// only ever mounted after the server has released it.
export default function Scratch({ babies, t, onDone }: RevealStyleProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const cleared = useRef(0);
  const stops = useRef<(() => void)[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      stops.current.forEach((stop) => stop());
      clearTimeout(timer.current);
    },
    [],
  );

  const onCleared = (index: number) => (element: HTMLElement) => {
    const stage = stageRef.current;
    const canvas = confettiRef.current;
    if (stage && canvas) {
      const box = element.getBoundingClientRect();
      const frame = stage.getBoundingClientRect();
      const colors = [babies[index].color, "var(--paper)", "var(--accent)"].map((c) => resolveColor(stage, c));
      stops.current.push(burst(canvas, { x: box.left - frame.left + box.width / 2, y: box.top - frame.top + box.height / 2 }, [colors[0], colors[0], colors[1], colors[2]]));
    }
    navigator.vibrate?.(30);
    cleared.current += 1;
    if (cleared.current >= babies.length) timer.current = setTimeout(onDone, 1600);
  };

  return (
    <div className="inv-scratch" ref={stageRef} data-count={babies.length}>
      <canvas ref={confettiRef} className="inv-confetti" aria-hidden="true" />
      <div className="inv-scratch__row">
        {babies.map((baby, index) => (
          <Card key={index} baby={baby} hint={t.scratchHint} onCleared={onCleared(index)} />
        ))}
      </div>
      <p className="inv-sr">{t.scratchHint}</p>
    </div>
  );
}
