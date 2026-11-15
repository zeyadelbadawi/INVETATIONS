import { guestRead, json } from "@/lib/guest/route";
import { listGames } from "@/lib/guest/games";

export const GET = guestRead(async ({ event, guest }) => json({ games: await listGames(event, guest) }));
