import { parseContent, pick, type EventContent } from "@/content/schema";

// A short name for lists. Events have no name column: the name typed at
// creation lives in the link-preview title, and the template fields are the
// fallback. Always rendered as text.
export function eventName(rawContent: unknown, locale: "ar" | "en", fallback: string): string {
  const content: EventContent = parseContent(rawContent);
  const title = pick(content.preview.title, locale);
  if (title) return title;
  for (const value of Object.values(content.fields)) {
    const text = pick(value, locale);
    if (text) return text;
  }
  return fallback;
}
