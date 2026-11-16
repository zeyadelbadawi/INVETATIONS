// Calendar export, built in the browser. Times are written in UTC (unambiguous
// in every calendar app without shipping a VTIMEZONE table) and the event's IANA
// zone travels in X-WR-TIMEZONE so apps that honour it display the event zone.

export type CalendarEvent = {
  uid: string;
  title: string;
  description: string;
  location: string;
  start: string; // ISO
  end: string | null; // ISO
  timeZone: string;
  url: string;
};

const DEFAULT_HOURS = 3;

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// RFC 5545 §3.3.11: backslash, semicolon and comma are escaped; newlines become \n.
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

// RFC 5545 §3.1: lines are at most 75 octets; continuation lines start with a space.
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of Array.from(line)) {
    const size = encoder.encode(char).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function eventRange(event: Pick<CalendarEvent, "start" | "end">): { start: Date; end: Date } {
  const start = new Date(event.start);
  const given = event.end ? new Date(event.end) : null;
  const end = given && given.getTime() > start.getTime() ? given : new Date(start.getTime() + DEFAULT_HOURS * 3600_000);
  return { start, end };
}

export function buildIcs(event: CalendarEvent, now: Date = new Date()): string {
  const { start, end } = eventRange(event);
  const zone = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(event.timeZone) ? event.timeZone : "UTC";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lamma//Invitation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-TIMEZONE:${zone}`,
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : "",
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : "",
    `URL:${escapeIcsText(event.url)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.filter((line) => line !== "").map(foldIcsLine).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const { start, end } = eventRange(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    ctz: event.timeZone,
    details: [event.description, event.url].filter(Boolean).join("\n"),
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
