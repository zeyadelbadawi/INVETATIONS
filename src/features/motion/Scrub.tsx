"use client";

// Scroll-scrubbed building blocks shared by the public site and the invitation.
// See src/features/motion/README.md for the CSS contract.

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { registerScrub, type ScrubRange } from "./scrub-loop";

export function useScrub(ref: RefObject<HTMLElement | null>, range: ScrubRange, span?: number) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    return registerScrub(element, { range, span });
  }, [ref, range, span]);
}

type Tag = "div" | "section" | "header" | "footer" | "figure" | "article" | "aside" | "ol" | "ul" | "li";

export type ScrubProps = {
  as?: Tag;
  range?: ScrubRange;
  span?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  id?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
};

/** An element that carries its own scroll progress as `--p`. */
export function Scrub({ as: Component = "div", range = "enter", span, className, style, children, ...rest }: ScrubProps) {
  const ref = useRef<HTMLElement>(null);
  useScrub(ref, range, span);
  return (
    // The union of tag types is too wide for TS to check the ref; every tag is an HTMLElement.
    <Component ref={ref as never} className={className} style={style} data-scrub={range} {...rest}>
      {children}
    </Component>
  );
}

export type PinnedProps = Omit<ScrubProps, "range" | "span"> & {
  /** Total height of the scroll track in viewport heights (at least 100). Capped at 400. */
  lengthVh: number;
  stageClassName?: string;
};

/**
 * A tall track with a sticky, viewport-high stage. `--p` runs 0→1 while the stage
 * is pinned. Under reduced motion (`data-still`) the track collapses to its
 * content and the stage stops being sticky: give the stage a complete static
 * layout for that case.
 */
export function Pinned({ lengthVh, stageClassName, className, style, children, ...rest }: PinnedProps) {
  const length = Math.min(400, Math.max(100, lengthVh));
  return (
    <Scrub range="pin" className={`mo-pin ${className ?? ""}`} style={{ ...style, "--pin-length": `${length}svh` } as CSSProperties} {...rest}>
      <div className={`mo-stage ${stageClassName ?? ""}`}>{children}</div>
    </Scrub>
  );
}

export type ScrubWordsProps = {
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "span" | "blockquote";
  className?: string;
  id?: string;
  /** Which progress drives the reveal: the nearest `--p` (default), or a scene's hold/move. */
  source?: "p" | "hold" | "progress";
  /** Part of the source progress over which the words appear. */
  from?: number;
  to?: number;
};

/**
 * Word-by-word reveal driven by scroll. Screen readers get the sentence once,
 * unsplit; the split words are hidden from them. Without JS or with reduced
 * motion the source progress is 1 and every word is fully visible.
 */
export function ScrubWords({ text, as: Tag = "p", className, id, source = "p", from = 0, to = 1 }: ScrubWordsProps) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <Tag
      id={id}
      className={`mo-words ${className ?? ""}`}
      data-src={source}
      style={{ "--from": from, "--to": Math.max(to, from + 0.01), "--n": words.length } as CSSProperties}
    >
      <span className="mo-sr">{text}</span>
      <span aria-hidden="true">
        {words.map((word, index) => (
          <span key={index}>
            <span className="mo-w" style={{ "--i": index } as CSSProperties}>
              {word}
            </span>{" "}
          </span>
        ))}
      </span>
    </Tag>
  );
}
