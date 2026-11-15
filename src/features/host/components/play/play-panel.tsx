"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { GameView, LiveView, PlayerView, PostView, RevealStatus } from "../../lib/play-data";
import { hostMessages } from "../../messages";
import { GamesSection } from "./games-section";
import { PlayersSection } from "./players-section";
import { RevealSection } from "./reveal-section";
import { WallSection } from "./wall-section";

type Tab = "guests" | "wall" | "games" | "reveal";

type Props = {
  lang: Locale;
  eventId: string;
  slug: string;
  origin: string;
  timezone: string;
  isReveal: boolean;
  isOwner: boolean;
  published: boolean;
  entitlements: { games: boolean; reveal: boolean };
  players: PlayerView[];
  teams: { id: string; name: string }[];
  posts: PostView[];
  games: GameView[];
  revealStatus: RevealStatus | null;
  live: LiveView;
};

const REFRESH_MS = 15_000;

export function PlayPanel(props: Props) {
  const { lang, eventId, timezone } = props;
  const t = hostMessages(lang).play;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("guests");

  // New guests, wishes and answers arrive while the host is watching: reload
  // the page's data every few seconds, but only while the tab is on screen.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  const waiting = props.players.filter((player) => !player.approved).length;
  const pendingPosts = props.posts.filter((post) => post.status === "pending").length;
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "guests", label: t.tabs.guests, count: waiting },
    { id: "wall", label: t.tabs.wall, count: pendingPosts },
    { id: "games", label: t.tabs.games, count: 0 },
    ...(props.isReveal ? [{ id: "reveal" as const, label: t.tabs.reveal, count: 0 }] : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div role="group" aria-label={t.tabsLabel} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium ${
              tab === id ? "border-fg bg-fg text-raised" : "border-line bg-raised text-fg hover:bg-surface"
            }`}
          >
            {label}
            {count > 0 ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">{count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "guests" ? <PlayersSection lang={lang} eventId={eventId} players={props.players} teams={props.teams} /> : null}
      {tab === "wall" ? <WallSection lang={lang} eventId={eventId} posts={props.posts} timezone={timezone} /> : null}
      {tab === "games" ? (
        <GamesSection lang={lang} eventId={eventId} games={props.games} entitled={props.entitlements.games} isOwner={props.isOwner} timezone={timezone} />
      ) : null}
      {tab === "reveal" && props.isReveal ? (
        <RevealSection
          lang={lang}
          eventId={eventId}
          slug={props.slug}
          origin={props.origin}
          timezone={timezone}
          entitled={props.entitlements.reveal}
          published={props.published}
          isOwner={props.isOwner}
          status={props.revealStatus}
          live={props.live}
        />
      ) : null}
    </div>
  );
}
