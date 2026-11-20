import type { BlockOf, BlockType } from "@/content/schema";
import type { Locale } from "@/i18n/config";

export type BlockFormProps<T extends BlockType> = {
  block: BlockOf<T>;
  onChange: (block: BlockOf<T>) => void;
  lang: Locale;
  timezone: string;
  // The event's start (events.starts_at), the single source of the date, and where it is changed.
  eventStart: string | null;
  settingsHref: string;
};

export const EMPTY = { ar: "", en: "" };
