/* eslint-disable @next/next/no-img-element -- static product screens, already sized webp */
import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";

// Product screens in public/marketing, captured from the current product in
// both languages: `<shot>-ar.webp` and `<shot>-en.webp`.
export type Shot =
  | "opening"
  | "rsvp"
  | "team"
  | "quiz"
  | "scoreboard"
  | "host-new"
  | "host-editor"
  | "host-guests"
  | "host-publish"
  | "host-send"
  | "host-follow";

type Props = {
  shot: Shot;
  lang: Locale;
  alt: string;
  className?: string;
  style?: CSSProperties;
  eager?: boolean;
};

// A real product screen in a thin phone bezel.
// The screen sits in its own clipping box so it can slide inside the bezel.
export function Phone({ shot, lang, alt, className = "", style, eager = false }: Props) {
  return (
    <div className={`mk-phone ${className}`} style={style}>
      <div className="mk-phone__screen">
        <img src={`/marketing/${shot}-${lang}.webp`} alt={alt} width={390} height={844} loading={eager ? "eager" : "lazy"} decoding="async" />
      </div>
    </div>
  );
}

// Two captures of the same screen stacked: `under` shows first, `over` is
// uncovered on top of it by CSS (the caller's class). One accessible picture.
export function LayeredPhone({ under, over, alt, className = "", overClassName = "" }: { under: string; over: string; alt: string; className?: string; overClassName?: string }) {
  return (
    <div className={`mk-phone ${className}`} role="img" aria-label={alt}>
      <div className="mk-phone__screen">
        <img src={under} alt="" width={390} height={844} loading="lazy" decoding="async" />
        <img src={over} alt="" width={390} height={844} loading="lazy" decoding="async" className={overClassName} />
      </div>
    </div>
  );
}
