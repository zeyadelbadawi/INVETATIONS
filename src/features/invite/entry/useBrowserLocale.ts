"use client";

import { useSyncExternalStore } from "react";
import { defaultLocale, type Locale } from "@/i18n/config";

const subscribe = () => () => {};

// Pages without a locale in their URL (link entry, secret keeper) follow the phone's language.
export function useBrowserLocale(): Locale {
  return useSyncExternalStore<Locale>(
    subscribe,
    () => {
      const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
      for (const language of languages) {
        if (/^ar\b/i.test(language)) return "ar";
        if (/^en\b/i.test(language)) return "en";
      }
      return defaultLocale;
    },
    () => defaultLocale,
  );
}
