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

// Addresses under the reserved `.invalid` top-level domain cannot receive mail
// and are what server-made holding accounts use (review F1); public sign-up
// never accepts them. Production also requires email confirmation.
export function reservedEmail(email: string): boolean {
  return /\.invalid\.?$/i.test(email.trim());
}

// New event passcodes (security rule 38, review F3): at least 6 characters and
// not only digits, so a short number cannot be guessed past the throttles.
// Passcodes set before this rule keep working; only new ones are checked.
export const PASSCODE_MIN_CHARS = 6;
export function weakPasscode(value: string): boolean {
  return Array.from(value.trim()).length < PASSCODE_MIN_CHARS || /^\p{Nd}+$/u.test(value.trim());
}

// A counted phrase in both languages. Arabic needs up to six forms (0, 1, 2,
// 3–10, 11–99, 100+); English needs two. Missing forms fall back to `other`.
export type Plural = { zero?: string; one: string; two?: string; few?: string; many?: string; other: string };

const pluralRules: Record<"ar" | "en", Intl.PluralRules> = {
  ar: new Intl.PluralRules("ar"),
  en: new Intl.PluralRules("en"),
};

export function plural(lang: "ar" | "en", n: number, forms: Plural, values: Record<string, string | number> = {}): string {
  const category = pluralRules[lang].select(n) as keyof Plural;
  const template = forms[category] ?? forms.other;
  return fmt(template, { n, ...values });
}
