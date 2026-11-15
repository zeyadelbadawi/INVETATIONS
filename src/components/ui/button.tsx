import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:opacity-90",
  secondary: "border border-line bg-raised text-fg hover:bg-surface",
  ghost: "text-fg hover:bg-raised",
  danger: "border border-danger/40 bg-raised text-danger hover:bg-danger/5",
};

// 44px minimum height: hosts use this on phones.
const sizes: Record<Size, string> = {
  md: "min-h-11 px-4 text-base",
  sm: "min-h-11 px-3 text-sm sm:min-h-9",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = ""): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...rest }: Props) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}
