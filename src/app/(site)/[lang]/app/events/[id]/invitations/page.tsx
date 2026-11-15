import { notFound } from "next/navigation";
import { lang as rootLang } from "next/root-params";
import { Suspense } from "react";
import { isLocale } from "@/i18n/config";
import { appOrigin } from "@/lib/env";
import { adminDb } from "@/lib/supabase/admin";
import { PageSkeleton } from "@/features/host/components/app-header";
import { InvitationsManager, type InvitationView } from "@/features/host/components/invitations-manager";
import { loadEntitlements } from "@/features/host/lib/access";
import { seatsUsed } from "@/features/host/lib/invitations";
import { eventForPage } from "@/features/host/lib/page";
import { hostMessages } from "@/features/host/messages";

type Props = PageProps<"/[lang]/app/events/[id]/invitations">;

function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}•••••${phone.slice(-2)}`;
}

async function InvitationsLoader({ params }: Pick<Props, "params">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();
  // Access is decided first; every query below is scoped to this one event.
  const { actor, event } = await eventForPage(lang, id, "manage_invitations", "invitations");
  const db = adminDb();
  const [{ data: rows }, { data: teams }, entitlements, used] = await Promise.all([
    db
      .from("invitations")
      .select("id, kind, label, side_team_id, pax_cap, max_players, phone, opened_at, revoked_at, created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false })
      .limit(3000),
    db.from("teams").select("id, name_ar, name_en, position").eq("event_id", event.id).order("position"),
    loadEntitlements(db, event.plan_id),
    seatsUsed(db, event.id),
  ]);
  const teamOptions = (teams ?? []).map((team) => ({ id: team.id, name: lang === "ar" ? team.name_ar : team.name_en }));
  const teamName = new Map(teamOptions.map((team) => [team.id, team.name]));

  const invitations: InvitationView[] = (rows ?? [])
    .map((row) => ({
      id: row.id,
      label: row.label,
      kind: row.kind as InvitationView["kind"],
      side: row.side_team_id ? teamName.get(row.side_team_id) ?? null : null,
      seats: row.kind === "personal" ? row.pax_cap : row.max_players,
      // Staff working under a grant see masked numbers only (security A3).
      phone: row.phone ? (actor.kind === "staff" ? maskPhone(row.phone) : row.phone) : null,
      opened: row.opened_at !== null,
      revoked: row.revoked_at !== null,
    }))
    // The open link first, then newest first.
    .sort((a, b) => Number(b.kind === "open") - Number(a.kind === "open"));

  return (
    <InvitationsManager
      key={event.id}
      lang={lang}
      eventId={event.id}
      slug={event.slug}
      origin={appOrigin()}
      invitations={invitations}
      teams={teamOptions}
      used={used}
      maxGuests={entitlements.max_guests}
      personalLinks={entitlements.personal_links}
      hasPlan={event.plan_id !== null}
      canExport={actor.kind === "owner"}
    />
  );
}

export default async function InvitationsPage({ params }: Props) {
  const l = await rootLang();
  return (
    <Suspense fallback={<PageSkeleton label={hostMessages(isLocale(l) ? l : "ar").common.loading} />}>
      <InvitationsLoader params={params} />
    </Suspense>
  );
}
