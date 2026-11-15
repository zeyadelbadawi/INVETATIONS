"use server";

import { z } from "zod";
import { requireEventAccess } from "@/lib/events/access";
import { adminDb } from "@/lib/supabase/admin";
import type { ActionResult } from "../lib/errors";
import { readRevealStatus, signWallMedia, type RevealStatus } from "../lib/play-data";
import { run } from "../lib/run";

const ids = z.array(z.uuid()).max(80);

// Signed links so a host or moderator can look at a photo or play a voice note
// before approving it. Ten minutes, this event's wall media only.
export async function wallMediaUrls(eventId: string, mediaIds: string[]): Promise<ActionResult<{ urls: Record<string, string> }>> {
  return run("wallMediaUrls", async () => {
    await requireEventAccess(eventId, "moderate");
    const parsed = ids.safeParse(mediaIds);
    if (!parsed.success) return { urls: {} };
    return { urls: await signWallMedia(adminDb(), eventId, parsed.data) };
  });
}

// Where the reveal stands — times and a count, nothing about the answer.
export async function revealStatus(eventId: string): Promise<ActionResult<{ status: RevealStatus }>> {
  return run("revealStatus", async () => {
    await requireEventAccess(eventId, "manage_reveal");
    return { status: await readRevealStatus(adminDb(), eventId) };
  });
}
