import type { BlockOf, BlockType } from "@/content/schema";
import type { Locale } from "@/i18n/config";

export type BlockFormProps<T extends BlockType> = {
  block: BlockOf<T>;
  onChange: (block: BlockOf<T>) => void;
  lang: Locale;
  timezone: string;
};

export const EMPTY = { ar: "", en: "" };
