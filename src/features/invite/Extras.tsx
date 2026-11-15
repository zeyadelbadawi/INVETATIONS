"use client";

// The sections whose code is not needed for the first view: games, wishes wall,
// recap and the share card. Each is its own chunk, fetched only when it has
// something to show.

import dynamic from "next/dynamic";
import { useState } from "react";
import { getMessages } from "./messages";
import { useInvite } from "./guest/GuestContext";
import { useGames, useRecap, useWall } from "./games/hooks";
import type { Game, RecapData, WallData } from "./games/types";

const GameList = dynamic(() => import("./games/Games").then((m) => m.GameList), { ssr: false });
const WishesWall = dynamic(() => import("./games/WishesWall").then((m) => m.WishesWall), { ssr: false });
const RecapSection = dynamic(() => import("./games/RecapSection").then((m) => m.RecapSection), { ssr: false });
const ShareCard = dynamic(() => import("./share/ShareCard"), { ssr: false });

export type DemoExtras = { games?: Game[]; wall?: WallData; recap?: RecapData; shareOpen?: boolean };

function Share({ startOpen }: { startOpen: boolean }) {
  const { me, event, locale } = useInvite();
  const t = getMessages(locale);
  const [open, setOpen] = useState(startOpen);
  if (!me?.player || !event.settings.sharingEnabled || !event.entitlements.share_cards) return null;
  if (open) return <ShareCard />;
  return (
    <section className="inv-block inv-share" aria-labelledby="share-title" data-testid="share-teaser">
      <h2 id="share-title" className="inv-h2">
        {t.share.title}
      </h2>
      <p className="inv-text">{t.share.intro}</p>
      <button type="button" className="inv-btn inv-btn--solid" onClick={() => setOpen(true)}>
        {t.share.make}
      </button>
    </section>
  );
}

export function Extras({ demoExtras }: { demoExtras?: DemoExtras }) {
  const { event, status } = useInvite();
  const liveGames = useGames(event.slug);
  const liveWall = useWall(event.slug);
  const liveRecap = useRecap(event.slug);
  const games = demoExtras?.games ?? liveGames;
  const wall = demoExtras?.wall ?? liveWall;
  const recap = demoExtras?.recap ?? liveRecap;
  if (status !== "ready") return null;
  const closed = event.status === "cancelled" || event.status === "postponed";
  return (
    <>
      {games && event.entitlements.games && !closed ? <GameList games={games} /> : null}
      {wall && !closed ? <WishesWall wall={wall} /> : null}
      {closed ? null : <Share startOpen={demoExtras?.shareOpen ?? false} />}
      {recap && event.status === "ended" ? <RecapSection recap={recap} /> : null}
    </>
  );
}
