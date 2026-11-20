import type { CSSProperties, ReactNode } from "react";

type Props = {
  still: { avif: string; webp: string };
  alt: string;
  /** Width / height of the picture. The scene stills are 16:9. */
  aspect?: number;
  /** Marks placed in % of the picture, as on a scene's frame overlay. */
  overlay?: ReactNode;
  children?: ReactNode;
  className?: string;
  priority?: boolean;
  id?: string;
  "aria-labelledby"?: string;
};

// A scene's last frame as a full-screen still. The overlay box is the whole
// picture at "cover" size, placed like the picture, so copy positioned in % of
// the frame stays on the same spot of it at every screen shape (the same rule
// as the scene player's frame overlay). Scene variables are pinned to their
// final values so shared overlay styles show their end state.
export function StillFrame({ still, alt, aspect = 16 / 9, overlay, children, className, priority = false, id, ...rest }: Props) {
  const frame = {
    "--seq-fw": `max(100cqw, calc(100cqh * ${aspect}))`,
    width: "var(--seq-fw)",
    height: `calc(var(--seq-fw) / ${aspect})`,
    left: "calc((100cqw - var(--seq-fw)) * 0.5)",
    top: `calc((100cqh - var(--seq-fw) / ${aspect}) * 0.5)`,
  } as CSSProperties;
  return (
    <section id={id} className={`mk-still ${className ?? ""}`} {...rest}>
      <picture>
        <source type="image/avif" srcSet={still.avif} />
        <img src={still.webp} alt={alt} width={1920} height={1080} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" className="mk-still__img" />
      </picture>
      <div className="mk-still__frame" style={frame}>
        {overlay}
      </div>
      <div className="mk-still__copy">{children}</div>
    </section>
  );
}
