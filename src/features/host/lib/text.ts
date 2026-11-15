import type { EventKind } from "@/templates/types";

// ASCII part of a slug from the event's name. Arabic-only names fall back to the
// kind; the random suffix is added by the caller.
export function slugBase(name: string, kind: EventKind): string {
  const ascii = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return ascii.length >= 1 ? ascii : kind.replace(/_/g, "-");
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function latinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_DIGITS.indexOf(d);
    return String(i >= 0 ? i : PERSIAN_DIGITS.indexOf(d));
  });
}

// E.164, or null when the number cannot be understood. Egyptian mobiles typed
// the local way (01xxxxxxxxx) get +20.
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = latinDigits(input).replace(/[\s\-().‎‏]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (/^01[0-9]{9}$/.test(s)) s = `+20${s.slice(1)}`;
  else if (/^1[0125][0-9]{8}$/.test(s)) s = `+20${s}`;
  else if (/^20[0-9]{10}$/.test(s)) s = `+${s}`;
  return /^\+[1-9][0-9]{7,14}$/.test(s) ? s : null;
}

// Fills {name}-style placeholders in a message.
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

export function newItemId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0");
}
