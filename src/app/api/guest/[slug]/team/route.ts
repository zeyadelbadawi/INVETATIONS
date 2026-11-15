import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { fail, guestWrite, json } from "@/lib/guest/route";
import { getTemplate } from "@/templates/registry";

const schema = z.object({ teamKey: z.string().regex(/^[a-z0-9_]{1,32}$/) });

// A player may change sides once, and only before a reveal countdown starts.
// Points already earned stay with the team they were earned for.
export const POST = guestWrite({ schema, requirePlayer: true }, async ({ event, guest, input }) => {
  const player = guest.player!;
  const template = getTemplate(event.templateId, event.templateVersion);
  if (template?.teamJoin !== "pick" || event.settings.lockTeams) return fail("teams_locked", 409);
  if (player.teamSwitchedAt) return fail("already_switched", 409);

  const db = adminDb();
  const [{ data: team }, { data: live }] = await Promise.all([
    db.from("teams").select("id").eq("event_id", event.id).eq("key", input.teamKey).maybeSingle(),
    db.from("live_state").select("phase").eq("event_id", event.id).maybeSingle(),
  ]);
  if (!team) return fail("bad_team", 400);
  if (live && live.phase !== "idle") return fail("teams_locked", 409);
  if (team.id === player.teamId) return json({ ok: true, teamId: team.id });

  const { data, error } = await db
    .from("players")
    .update({ team_id: team.id, team_switched_at: new Date().toISOString() })
    .eq("event_id", event.id)
    .eq("id", player.id)
    .is("team_switched_at", null)
    .select("id");
  if (error) throw new Error(`team switch failed: ${error.message}`);
  if (!data || data.length === 0) return fail("already_switched", 409);
  return json({ ok: true, teamId: team.id });
});
