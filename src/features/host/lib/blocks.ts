import type { BlockType, EventContent } from "@/content/schema";
import type { EventKind, Template } from "@/templates/types";

// Which sections each occasion offers (launch scope §2), plus whatever the
// template itself starts with.
const BY_KIND: Record<EventKind, BlockType[]> = {
  wedding: ["details", "countdown", "quote", "story", "families", "programme", "location", "gallery", "dress_code", "notes", "faq"],
  gender_reveal: ["details", "countdown", "programme", "location", "dress_code", "notes", "faq"],
  corporate: ["details", "countdown", "programme", "people", "location", "dress_code", "contact", "notes", "faq"],
};

export function allowedBlocks(template: Template): BlockType[] {
  return [...new Set([...BY_KIND[template.kind], ...template.blocks.map((b) => b.type)])];
}

// The event's start lives in events.starts_at only (set in Settings). Older
// drafts may still carry a date inside the "Date and place" section; it is
// dropped before preview and publish so no page can show a second date.
export function withoutBlockDates(content: EventContent): EventContent {
  return { ...content, blocks: content.blocks.map((block) => (block.type === "details" ? { ...block, startsAt: null } : block)) };
}
