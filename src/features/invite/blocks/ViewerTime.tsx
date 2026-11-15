"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";
import { getMessages } from "../messages";
import { formatDateTime, zoneDiffers } from "../lib/format";

const subscribe = () => () => {};

// Shown only to someone whose phone is in another time zone (relatives abroad).
export function ViewerTime({ iso, timeZone, locale }: { iso: string; timeZone: string; locale: Locale }) {
  const differs = useSyncExternalStore(
    subscribe,
    () => zoneDiffers(iso, timeZone),
    () => false,
  );
  if (!differs) return null;
  return <p className="inv-hint inv-viewer-time">{getMessages(locale).blocks.yourTime(formatDateTime(iso, undefined, locale))}</p>;
}
