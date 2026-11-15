import { notFound } from "next/navigation";
import { lang as rootLang } from "next/root-params";
import { Suspense } from "react";
import { isLocale } from "@/i18n/config";
import { appOrigin } from "@/lib/env";
import { adminDb } from "@/lib/supabase/admin";
import { PageSkeleton } from "@/features/host/components/app-header";
import { PlayPanel } from "@/features/host/components/play/play-panel";
import { loadEntitlements } from "@/features/host/lib/access";
import { eventForPage } from "@/features/host/lib/page";
import { loadGames, loadPlayers, loadPosts, readLiveView, readRevealStatus } from "@/features/host/lib/play-data";
import { hostMessages } from "@/features/host/messages";

type Props = PageProps<"/[lang]/app/events/[id]/play">;

async function PlayLoader({ params }: Pick<Props, "params">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();
  // Access first. The reads below run on the service key, each one filtered by
  // this event's id, so the page also works for staff holding a grant; every
  // button calls an action that authorises again for its own capability.
  const { actor, event } = await eventForPage(lang, id, "view", "play");
  const db = adminDb();
  const isOwner = actor.kind === "owner";
  const isReveal = event.kind === "gender_reveal";

  const [entitlements, players, posts, games, teams, live, revealStatus] = await Promise.all([
    loadEntitlements(db, event.plan_id),
    loadPlayers(db, event.id),
    loadPosts(db, event.id),
    // Whether answers are stored is shown to the owner only.
    loadGames(db, event.id, isOwner),
    db.from("teams").select("id, name_ar, name_en, position").eq("event_id", event.id).order("position"),
    readLiveView(db, event.id),
    // Times and a count only; nothing about the answer is ever read here.
    isOwner && isReveal ? readRevealStatus(db, event.id) : Promise.resolve(null),
  ]);

  return (
    <PlayPanel
      lang={lang}
      eventId={event.id}
      slug={event.slug}
      origin={appOrigin()}
      timezone={event.timezone}
      isReveal={isReveal}
      isOwner={isOwner}
      published={event.status === "published"}
      entitlements={{ games: entitlements.games, reveal: entitlements.reveal }}
      players={players}
      teams={(teams.data ?? []).map((team) => ({ id: team.id, name: lang === "ar" ? team.name_ar : team.name_en }))}
      posts={posts}
      games={games}
      revealStatus={revealStatus}
      live={live}
    />
  );
}

export default async function PlayPage({ params }: Props) {
  const l = await rootLang();
  return (
    <Suspense fallback={<PageSkeleton label={hostMessages(isLocale(l) ? l : "ar").common.loading} />}>
      <PlayLoader params={params} />
    </Suspense>
  );
}
