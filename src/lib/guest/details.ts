import "server-only";
import type { Block } from "@/content/schema";
import { getGuestBlocks, type PublicEvent } from "@/lib/events/published";
import { referencedImages, signContentImages } from "@/lib/media/content";

// The part of an event only guests may see (security V1): guest-only blocks and
// short-lived links for the images they show. Call only after a session or
// passcode check.
export type GuestDetails = {
  guestBlocks: Block[];
  // Media id -> signed URL (≤ 10 minutes), only for images these blocks reference.
  media: Record<string, string>;
  // Passcode events keep even their public blocks out of the cached shell, so
  // the whole body comes from here: public and guest blocks, in host order.
  content: { blocks: Block[]; order: string[] } | null;
};

export async function readGuestDetails(event: PublicEvent): Promise<GuestDetails> {
  const guestBlocks = await getGuestBlocks(event.id);
  // Signed only for ids the published content names, re-checked against this
  // event, its purpose and its processing state.
  const media = await signContentImages(event.id, referencedImages(guestBlocks));
  return {
    guestBlocks,
    media,
    content: event.hasPasscode ? { blocks: [...event.blocks, ...guestBlocks], order: event.order } : null,
  };
}
