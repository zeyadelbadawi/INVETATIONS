import { fail, guestRead, json } from "@/lib/guest/route";
import { readRecap } from "@/lib/guest/recap";

// After the event: final standings, top players (first names, approved only)
// and the wishes the hosts highlighted. Session holders only; the public shell
// shows team totals and nothing else (security rule 20).
export const GET = guestRead(async ({ event, guest }) => {
  if (!guest) return fail("no_session", 401);
  const recap = await readRecap(event, guest);
  if (!recap) return fail("not_ended", 409);
  return json(recap);
});
