import "server-only";
import type { Locale } from "./config";
import type ar from "./ar.json";

export type Dictionary = typeof ar;

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  ar: () => import("./ar.json").then((m) => m.default),
  en: () => import("./en.json").then((m) => m.default),
};

export function getDictionary(locale: Locale): Promise<Dictionary> {
  return loaders[locale]();
}
