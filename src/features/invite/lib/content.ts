import { pick, type Block, type Localized } from "@/content/schema";
import type { Locale } from "@/i18n/config";
import type { InviteEvent } from "../types";

function isLocalized(value: unknown): value is Localized {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.ar === "string" && typeof v.en === "string" && Object.keys(v).length === 2;
}

function walk(value: unknown, seen: { ar: boolean; en: boolean }): void {
  if (isLocalized(value)) {
    if (value.ar.trim()) seen.ar = true;
    if (value.en.trim()) seen.en = true;
    return;
  }
  if (Array.isArray(value)) value.forEach((item) => walk(item, seen));
  else if (typeof value === "object" && value !== null) Object.values(value).forEach((item) => walk(item, seen));
}

// The language switch is offered only when the host wrote something in both languages.
export function hasBothLanguages(content: { fields: unknown; blocks: unknown }): boolean {
  const seen = { ar: false, en: false };
  walk(content.fields, seen);
  walk(content.blocks, seen);
  return seen.ar && seen.en;
}

const has = (value: Localized | undefined, locale: Locale) => pick(value, locale).trim() !== "";

// A block with nothing to show is skipped rather than rendered as an empty frame.
export function isEmptyBlock(block: Block, locale: Locale, event: Pick<InviteEvent, "startsAt">): boolean {
  switch (block.type) {
    case "details":
      return !(block.startsAt ?? event.startsAt) && !has(block.venue, locale) && !has(block.city, locale);
    case "countdown":
      return false; // decided by the caller, which knows the start time
    case "programme":
      return block.items.every((item) => !has(item.title, locale));
    case "location":
      return !has(block.label, locale) && !has(block.address, locale) && (block.lat === null || block.lng === null);
    case "story":
      return !has(block.body, locale);
    case "families":
      return block.sides.every((side) => !has(side.names, locale));
    case "gallery":
      return block.images.length === 0;
    case "quote":
      return !has(block.body, locale);
    case "dress_code":
      return !has(block.note, locale) && block.colors.length === 0;
    case "notes":
      return block.items.every((item) => !has(item.body, locale));
    case "faq":
      return block.items.every((item) => !has(item.question, locale));
    case "people":
      return block.items.every((item) => !has(item.name, locale));
    case "contact":
      return !has(block.name, locale) && !block.phone && !block.link;
  }
}

export function eventStart(event: Pick<InviteEvent, "startsAt" | "blocks">, extra: Block[] = []): string | null {
  for (const block of [...event.blocks, ...extra]) if (block.type === "details" && block.startsAt) return block.startsAt;
  return event.startsAt;
}

export function eventTitle(event: Pick<InviteEvent, "fields" | "preview">, titleFields: string[], locale: Locale, joiner: string): string {
  const custom = pick(event.preview?.title, locale).trim();
  if (custom) return custom;
  return titleFields
    .map((key) => pick(event.fields[key], locale).trim())
    .filter(Boolean)
    .join(joiner);
}

export function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
