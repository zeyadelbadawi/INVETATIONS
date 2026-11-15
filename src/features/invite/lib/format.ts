import type { Locale } from "@/i18n/config";

// Latin digits in Arabic too: dates and times are read aloud and typed into
// maps and calendars, and mixed digit systems confuse older phones.
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
}

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    return "Africa/Cairo";
  }
}

export type DateParts = { weekday: string; day: string; month: string; year: string; time: string };

export function dateParts(iso: string, timeZone: string, locale: Locale): DateParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const zone = safeZone(timeZone);
  const tag = intlLocale(locale);
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, { timeZone: zone, ...options }).format(date);
  return {
    weekday: part({ weekday: "long" }),
    day: part({ day: "numeric" }),
    month: part({ month: "long" }),
    year: part({ year: "numeric" }),
    time: formatTime(iso, zone, locale),
  };
}

export function formatTime(iso: string, timeZone: string | undefined, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timeZone ? safeZone(timeZone) : undefined,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone: string | undefined, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timeZone ? safeZone(timeZone) : undefined,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

// True when the wall clock in the viewer's zone differs from the event's zone at that instant.
export function zoneDiffers(iso: string, eventZone: string): boolean {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hour12: false };
  try {
    return new Intl.DateTimeFormat("en", { ...options, timeZone: safeZone(eventZone) }).format(date) !== new Intl.DateTimeFormat("en", options).format(date);
  } catch {
    return false;
  }
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(value);
}

// First grapheme of each given text: the monogram.
export function initials(values: string[]): string[] {
  return values
    .map((value) => Array.from(value.trim())[0] ?? "")
    .filter((letter) => letter !== "")
    .slice(0, 3)
    .map((letter) => letter.toLocaleUpperCase());
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

// https, tel and mailto only, re-checked at render time (security rule 14).
export function safeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "tel:", "mailto:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

// The map link is built from the coordinates alone, never from host text.
export function mapHref(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function channel(hex: string, at: number): number {
  const value = parseInt(hex.slice(at, at + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0;
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}
