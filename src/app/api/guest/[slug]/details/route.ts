import { fail, guestRead, json } from "@/lib/guest/route";
import { readGuestDetails } from "@/lib/guest/details";
import { hasPasscodeGrant } from "@/lib/guest/passcode";

// The guest-only blocks for a passcode event, for a visitor who unlocked it
// with the passcode (or holds a session). Nothing personal: no invitation,
// player or RSVP. Private and uncached like every guest response.
export const GET = guestRead(async ({ event, guest }) => {
  if (!event.hasPasscode) return fail("not_found", 404);
  if (!guest && !(await hasPasscodeGrant(event.id))) return fail("passcode_required", 401);
  const details = await readGuestDetails(event);
  return json({ guestBlocks: details.guestBlocks, media: details.media, content: details.content });
});
