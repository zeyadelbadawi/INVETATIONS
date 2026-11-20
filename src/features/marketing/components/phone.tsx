/* eslint-disable @next/next/no-img-element -- static product screens, already sized webp */
import type { CSSProperties } from "react";

export type Shot =
  | "names-ar"
  | "names-en"
  | "scoreboard-ar"
  | "countdown-ar"
  | "reveal-result-ar"
  | "reveal-en"
  | "corporate-en"
  | "private-en"
  | "quiz-ar"
  | "vote-ar"
  | "wall-ar"
  | "keeper-ar"
  | "rsvp-ar"
  | "details-ar";

type Props = {
  shot: Shot;
  alt: string;
  className?: string;
  style?: CSSProperties;
  eager?: boolean;
};

// A real product screen (from the invitation e2e suite) in a thin phone bezel.
// The screen sits in its own clipping box so it can slide inside the bezel.
export function Phone({ shot, alt, className = "", style, eager = false }: Props) {
  return (
    <div className={`mk-phone ${className}`} style={style}>
      <div className="mk-phone__screen">
        <img src={`/marketing/${shot}.webp`} alt={alt} width={390} height={844} loading={eager ? "eager" : "lazy"} decoding="async" />
      </div>
    </div>
  );
}
