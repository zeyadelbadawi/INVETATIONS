import type { ButtonHTMLAttributes } from "react";

// primary: the one main action of a view (lantern fill, dark text).
// secondary: every other action (outline).
// ghost: low-weight actions in toolbars.
// danger: the first, reversible click of a destructive action (outline in red).
// dangerText: a destructive first click in a list of rows, where outlines would be noise.
// destructive: the confirming click of a destructive action (solid red).
type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerText" | "destructive";
type Size = "md" | "sm" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-control text-center font-medium leading-tight select-none " +
  "transition-[background-color,border-color,color,filter] duration-150 ease-out " +
  "disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:brightness-95 active:brightness-90",
  secondary: "border border-line bg-raised text-fg hover:border-fg/35 active:bg-surface",
  ghost: "text-fg hover:bg-fg/[0.06] active:bg-fg/10",
  danger: "border border-danger/45 bg-transparent text-danger hover:border-danger hover:bg-danger/[0.06]",
  dangerText: "text-danger hover:bg-danger/[0.06]",
  destructive: "bg-danger text-raised hover:brightness-95 active:brightness-90",
};

// 44px minimum on phones: hosts work from their phones on the day.
const sizes: Record<Size, string> = {
  md: "min-h-11 px-4 text-base",
  sm: "min-h-11 px-3 text-sm sm:min-h-9",
  lg: "min-h-14 px-5 text-lg",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = ""): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...rest }: Props) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}
