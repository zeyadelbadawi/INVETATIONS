"use client";

import type { CSSProperties } from "react";
import { pick } from "@/content/schema";
import { getMessages } from "../messages";
import { formatPoints } from "../lib/format";
import { teamColor, useInvite } from "../guest/GuestContext";
import type { RecapData } from "./types";

export function RecapSection({ recap }: { recap: RecapData }) {
  const { locale } = useInvite();
  const t = getMessages(locale);
  const winner = recap.teams.find((team) => team.id === recap.winnerTeamId);
  const max = Math.max(1, ...recap.teams.map((team) => team.score));
  const top = (recap.topPlayers ?? []).filter((entry) => entry.players.length > 0);
  const teamById = new Map(recap.teams.map((team) => [team.id, team]));
  return (
    <section id="recap" className="inv-block inv-recap" aria-labelledby="recap-title" data-testid="recap">
      <h2 id="recap-title" className="inv-h2">
        {t.recap.title}
      </h2>
      <p className="inv-recap__winner" style={{ "--team": teamColor(winner?.color) } as CSSProperties} data-testid="recap-winner">
        {winner ? t.recap.winner(pick(winner.name, locale)) : t.recap.tie}
      </p>
      <ul className="inv-score__bars" aria-label={t.recap.finalScores}>
        {recap.teams.map((team) => (
          <li key={team.id} className="inv-score__row" style={{ "--team": teamColor(team.color), "--fill": team.score / max } as CSSProperties}>
            <span className="inv-score__name">
              {pick(team.name, locale)}
            </span>
            <span className="inv-score__value inv-num">{formatPoints(team.score, locale)}</span>
            <span className="inv-score__bar" aria-hidden="true" />
          </li>
        ))}
      </ul>
      {recap.myPoints !== null ? <p className="inv-text">{t.recap.yours(recap.myPoints)}</p> : null}
      {top.length > 0 ? (
        <>
          <h3 className="inv-h3">{t.recap.topPlayers}</h3>
          <div className="inv-recap__top" data-testid="recap-top">
            {top.map((entry) => {
              const team = teamById.get(entry.teamId);
              return (
                <div key={entry.teamId} className="inv-recap__team" style={{ "--team": teamColor(team?.color) } as CSSProperties}>
                  {team ? <p className="inv-score__name">{pick(team.name, locale)}</p> : null}
                  <ol className="inv-plainlist">
                    {entry.players.map((player, i) => (
                      // Names are guest text: rendered as text only.
                      <li key={`${entry.teamId}-${i}`}>
                        <span>{player.name}</span>
                        <span className="inv-num">{t.recap.playerPoints(player.points)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      {recap.highlights.length > 0 ? (
        <>
          <h3 className="inv-h3">{t.recap.highlights}</h3>
          <ul className="inv-wishes" data-testid="recap-highlights">
            {recap.highlights.map((item) => (
              <li key={item.id} className="inv-wish">
                {item.mediaUrl ? (
                  // A short-lived signed link from private storage.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="inv-wish__photo" src={item.mediaUrl} alt={t.recap.photoBy(item.author)} loading="lazy" referrerPolicy="no-referrer" />
                ) : null}
                {item.text ? <p className="inv-wish__text">{item.text}</p> : null}
                <p className="inv-wish__meta">{item.author}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
