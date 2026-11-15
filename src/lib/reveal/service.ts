import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { bytea, hashForDb, newLinkCode, parseBytea } from "@/lib/security/tokens";
import { openAnswer, sealAnswer, type Answer } from "@/lib/reveal/crypto";
import { refreshScores } from "@/lib/guest/scores";

export const REVEAL_WIN_POINTS = 20;
export const MIN_LEAD_SECONDS = 60;

// Creates (or replaces) the secret keeper's link. Returns the code once; only
// its hash is stored. Not possible once a countdown has started.
export async function issueKeeperLink(eventId: string, actorId: string): Promise<string | null> {
  const db = adminDb();
  const { data: existing } = await db.from("reveals").select("id, reveal_at, revealed_at").eq("event_id", eventId).maybeSingle();
  if (existing && (existing.reveal_at || existing.revealed_at)) return null;

  const code = newLinkCode();
  const patch = { keeper_code_hash: hashForDb(code), keeper_device_hash: null };
  const { error } = existing
    ? await db.from("reveals").update(patch).eq("id", existing.id)
    : await db.from("reveals").insert({ event_id: eventId, ...patch });
  if (error) throw new Error(`keeper link failed: ${error.message}`);
  await audit({ actorId, actorKind: "host", action: "reveal.keeper_link_issued", eventId });
  return code;
}

export type KeeperState = "ready" | "sealed" | "locked" | "other_device" | "not_found";

async function findByKeeperCode(code: string) {
  const { data } = await adminDb()
    .from("reveals")
    .select("id, event_id, keeper_device_hash, sealed_at, seal_count, reveal_at, revealed_at")
    .eq("keeper_code_hash", hashForDb(code))
    .maybeSingle();
  return data;
}

// The keeper page is write-only: it reports whether something is sealed, never what.
export async function keeperStatus(code: string, deviceToken: string | null): Promise<{ state: KeeperState; babies?: number }> {
  const r = await findByKeeperCode(code);
  if (!r) return { state: "not_found" };
  if (r.reveal_at || r.revealed_at) return { state: "locked" };
  if (r.keeper_device_hash) {
    const bound = parseBytea(r.keeper_device_hash as unknown as string).toString("hex");
    if (!deviceToken || bound !== parseBytea(hashForDb(deviceToken)).toString("hex")) return { state: "other_device" };
  }
  return { state: r.sealed_at ? "sealed" : "ready" };
}

export async function keeperSeal(code: string, deviceToken: string, answer: Answer): Promise<KeeperState> {
  const r = await findByKeeperCode(code);
  if (!r) return "not_found";
  if (r.reveal_at || r.revealed_at) return "locked";

  const deviceHash = hashForDb(deviceToken);
  if (r.keeper_device_hash) {
    const bound = parseBytea(r.keeper_device_hash as unknown as string).toString("hex");
    if (bound !== parseBytea(deviceHash).toString("hex")) return "other_device";
  }

  const sealed = sealAnswer(answer, r.id, r.event_id);
  // The guard on reveal_at closes the race with a countdown starting right now.
  const { data, error } = await adminDb()
    .from("reveals")
    .update({
      ciphertext: bytea(sealed.ciphertext),
      nonce: bytea(sealed.nonce),
      key_version: sealed.keyVersion,
      keeper_device_hash: deviceHash,
      sealed_at: new Date().toISOString(),
      seal_count: r.seal_count + 1,
    })
    .eq("id", r.id)
    .is("reveal_at", null)
    .is("revealed_at", null)
    .select("id");
  if (error) throw new Error(`seal failed: ${error.message}`);
  if (!data || data.length === 0) return "locked";

  // Never record the value or anything derived from it.
  await audit({ actorKind: "keeper", action: "reveal.sealed", eventId: r.event_id, metadata: { seal_count: r.seal_count + 1 } });
  return "sealed";
}

export async function startReveal(eventId: string, actorId: string, leadSeconds: number): Promise<string | null> {
  const { data, error } = await adminDb().rpc("reveal_start", {
    p_event_id: eventId,
    p_lead_seconds: Math.max(MIN_LEAD_SECONDS, Math.floor(leadSeconds)),
  });
  if (error) throw new Error(`reveal start failed: ${error.message}`);
  if (!data) return null;
  await audit({ actorId, actorKind: "host", action: "reveal.started", eventId, metadata: { reveal_at: data } });
  return data;
}

export async function cancelReveal(eventId: string, actorId: string): Promise<boolean> {
  const { data, error } = await adminDb().rpc("reveal_cancel", { p_event_id: eventId });
  if (error) throw new Error(`reveal cancel failed: ${error.message}`);
  if (data) await audit({ actorId, actorKind: "host", action: "reveal.cancelled", eventId });
  return data === true;
}

// Releases the answer if its time has come. The database decides, on its own
// clock, whether the moment has passed. Publishing the result is idempotent, so
// if a request dies between the two steps the next one finishes the job.
// Safe to call from any request.
export async function releaseIfDue(eventId: string): Promise<void> {
  const db = adminDb();
  const { error } = await db.rpc("reveal_release", { p_event_id: eventId });
  if (error) throw new Error(`reveal release failed: ${error.message}`);

  // The ciphertext is read only once the database has marked the reveal released.
  const { data: row } = await db
    .from("reveals")
    .select("id, ciphertext, nonce, key_version")
    .eq("event_id", eventId)
    .not("revealed_at", "is", null)
    .maybeSingle();
  if (!row || !row.ciphertext || !row.nonce || row.key_version === null) return;

  const { data: live } = await db.from("live_state").select("phase, version").eq("event_id", eventId).maybeSingle();
  if (live?.phase === "revealed") return;

  const answer = openAnswer(
    parseBytea(row.ciphertext as unknown as string),
    parseBytea(row.nonce as unknown as string),
    row.key_version,
    row.id,
    eventId,
  );

  await db.from("live_state").upsert({
    event_id: eventId,
    phase: "revealed",
    public_payload: { answer, revealedAt: new Date().toISOString() },
    version: (live?.version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  });

  // Team pick is settled here, from the reveal itself; no one could enter this
  // truth beforehand (security R1). Twins of both kinds reward no team.
  const winner = answer.every((a) => a === answer[0]) ? answer[0] : null;
  if (winner) {
    const { data: team } = await db.from("teams").select("id").eq("event_id", eventId).eq("key", winner).maybeSingle();
    if (team) {
      const { data: players } = await db
        .from("players")
        .select("id")
        .eq("event_id", eventId)
        .eq("team_id", team.id)
        .eq("approved", true)
        .is("removed_at", null);
      if (players && players.length > 0) {
        await db.from("score_events").upsert(
          players.map((p) => ({
            event_id: eventId,
            player_id: p.id,
            team_id: team.id,
            points: REVEAL_WIN_POINTS,
            reason: "reveal_win",
            ref: row.id,
          })),
          { onConflict: "player_id,reason,ref", ignoreDuplicates: true },
        );
        await refreshScores(eventId);
      }
    }
  }
  await audit({ actorKind: "system", action: "reveal.released", eventId });
}
