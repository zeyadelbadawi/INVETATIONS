import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/events/access";
import { getTemplate } from "@/templates/registry";

// How guests uncover the gender-reveal answer. Changeable only before the
// countdown starts. Touches the `style` column alone: the keeper code, device,
// ciphertext, nonce and key version are never selected or written here
// (security R1, rule 29). Callers authorise first ("manage_reveal": owner only).

export type RevealStyle = "balloon" | "scratch";
export type RevealStyleState = { style: RevealStyle | null; styles: RevealStyle[]; locked: boolean };
export type SetStyleResult = { ok: true; style: RevealStyle } | { ok: false; reason: "not_allowed" | "unsupported" | "locked" };

async function allowedStyles(eventId: string): Promise<RevealStyle[] | null> {
  const { data: event } = await adminDb().from("events").select("kind, template_id, template_version").eq("id", eventId).maybeSingle();
  if (!event || event.kind !== "gender_reveal") return null;
  const template = getTemplate(event.template_id, event.template_version);
  return template?.reveal?.styles ?? null;
}

async function countdownStarted(eventId: string): Promise<boolean> {
  const db = adminDb();
  const [{ data: reveal }, { data: live }] = await Promise.all([
    db.from("reveals").select("reveal_at, revealed_at").eq("event_id", eventId).maybeSingle(),
    db.from("live_state").select("phase").eq("event_id", eventId).maybeSingle(),
  ]);
  return Boolean(reveal?.reveal_at || reveal?.revealed_at || (live && live.phase !== "idle"));
}

export async function readRevealStyle(eventId: string): Promise<RevealStyleState | null> {
  const styles = await allowedStyles(eventId);
  if (!styles) return null;
  const { data } = await adminDb().from("reveals").select("style").eq("event_id", eventId).maybeSingle();
  const stored = data?.style as RevealStyle | undefined;
  return { style: stored && styles.includes(stored) ? stored : (styles[0] ?? null), styles, locked: await countdownStarted(eventId) };
}

export async function setRevealStyle(eventId: string, actor: Actor, style: RevealStyle): Promise<SetStyleResult> {
  const styles = await allowedStyles(eventId);
  if (!styles) return { ok: false, reason: "not_allowed" };
  if (!styles.includes(style)) return { ok: false, reason: "unsupported" };
  if (await countdownStarted(eventId)) return { ok: false, reason: "locked" };

  const db = adminDb();
  // The guard on reveal_at closes the race with a countdown starting now.
  const guarded = () =>
    db.from("reveals").update({ style }).eq("event_id", eventId).is("reveal_at", null).is("revealed_at", null).select("id");

  let { data: updated, error } = await guarded();
  if (error) throw new Error(`reveal style failed: ${error.message}`);
  if (!updated || updated.length === 0) {
    const { data: existing } = await db.from("reveals").select("id").eq("event_id", eventId).maybeSingle();
    if (existing) return { ok: false, reason: "locked" };
    // No reveal row yet: create one with the style only. A keeper link issued
    // at the same moment wins the insert; the guarded update then applies.
    const inserted = await db.from("reveals").upsert({ event_id: eventId, style }, { onConflict: "event_id", ignoreDuplicates: true }).select("id");
    if (inserted.error) throw new Error(`reveal style failed: ${inserted.error.message}`);
    if (!inserted.data || inserted.data.length === 0) {
      ({ data: updated, error } = await guarded());
      if (error) throw new Error(`reveal style failed: ${error.message}`);
      if (!updated || updated.length === 0) return { ok: false, reason: "locked" };
    }
  }

  await audit({ actorId: actor.userId, actorKind: "host", action: "reveal.style_set", eventId, metadata: { style } });
  return { ok: true, style };
}
