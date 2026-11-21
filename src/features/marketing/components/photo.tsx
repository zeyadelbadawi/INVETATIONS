/* eslint-disable @next/next/no-img-element -- static photographs, already sized webp at 640 and 1200 */
import type { CSSProperties } from "react";

// Photographs in public/marketing/photos, square, at 640 and 1200 px:
// `<name>-640.webp` and `<name>-1200.webp`. Each one shows the moment the copy
// next to it talks about; the crop is set by the caller's CSS (object-fit,
// object-position), so the box keeps its size before the file arrives.
export type PhotoName = "phone-lanterns" | "hall-hands" | "garden-family" | "grandmother-phone" | "laptop-jasmine" | "wedding-reception-table";

type Props = {
  name: PhotoName;
  alt: string;
  /** The `sizes` attribute: how wide the picture is drawn at each viewport. */
  sizes: string;
  className?: string;
  style?: CSSProperties;
  /** For a picture in the first viewport. */
  eager?: boolean;
};

export function Photo({ name, alt, sizes, className, style, eager = false }: Props) {
  const base = `/marketing/photos/${name}`;
  return (
    <img
      src={`${base}-1200.webp`}
      srcSet={`${base}-640.webp 640w, ${base}-1200.webp 1200w`}
      sizes={sizes}
      alt={alt}
      width={1200}
      height={1200}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      className={className}
      style={style}
    />
  );
}
