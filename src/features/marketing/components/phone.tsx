import Image from "next/image";
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
  sizes?: string;
  "data-pos"?: "start" | "end";
};

// A real product screen (from the invitation e2e suite) in a phone bezel.
export function Phone({ shot, alt, className = "", style, eager = false, sizes = "(min-width: 768px) 272px, 46vw", ...rest }: Props) {
  return (
    <div className={`mk-phone ${className}`} style={style} {...rest}>
      <Image
        src={`/marketing/${shot}.webp`}
        alt={alt}
        width={390}
        height={844}
        sizes={sizes}
        unoptimized
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
      />
    </div>
  );
}
