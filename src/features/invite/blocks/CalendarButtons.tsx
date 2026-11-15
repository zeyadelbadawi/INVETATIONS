"use client";

import type { Locale } from "@/i18n/config";
import { getMessages } from "../messages";
import { Icon } from "../Icon";
import { buildIcs, googleCalendarUrl, type CalendarEvent } from "../lib/ics";

// `calendar.url` arrives as a path; the origin is added in the browser so the
// cached shell does not depend on the host it was rendered for.
export function CalendarButtons({ calendar, locale }: { calendar: CalendarEvent; locale: Locale }) {
  const t = getMessages(locale);
  const absolute = (): CalendarEvent => ({ ...calendar, url: new URL(calendar.url, window.location.origin).toString() });

  const download = () => {
    const blob = new Blob([buildIcs(absolute())], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${t.blocks.icsName}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  };

  return (
    <div className="inv-actions" role="group" aria-label={t.blocks.addToCalendar}>
      <a
        className="inv-btn"
        href={googleCalendarUrl(calendar)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          event.currentTarget.href = googleCalendarUrl(absolute());
        }}
      >
        <Icon name="calendar" /> {t.blocks.googleCalendar}
      </a>
      <button type="button" className="inv-btn" onClick={download}>
        <Icon name="download" /> {t.blocks.icsFile}
      </button>
    </div>
  );
}
