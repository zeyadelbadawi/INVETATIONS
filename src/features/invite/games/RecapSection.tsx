"use client";

import type { CSSProperties } from "react";
import { pick } from "@/content/schema";
import { getMessages } from "../messages";
import { formatNumber } from "../lib/format";
import { teamColor, useInvite } from "../guest/GuestContext";
import type { RecapData } from "./types";

export function RecapSection({ recap }: { recap: RecapData }) {
  const { locale } = useInvite();
  const t = getMessages(locale);
  const winner = recap.teams.find((team) => team.id === recap.winnerTeamId);
  const max = Math.max(1, ...recap.teams.map((team) => team.score));
  return (
    <section id="recap" className="inv-block inv-recap" aria-labelledby="recap-title" data-testid="recap">
      <h2 id="recap-title" className="inv-h2">
        {t.recap.title}
      </h2>
      <p className="inv-recap__winner" style={{ "--team": teamColor(winner?.color) } as CSSProperties}>
        {winner ? t.recap.winner(pick(winner.name, locale)) : t.recap.tie}
      </p>
      <ul className="inv-score__bars" aria-label={t.recap.finalScores}>
        {recap.teams.map((team) => (
          <li key={team.id} className="inv-score__row" style={{ "--team": teamColor(team.color), "--fill": team.score / max } as CSSProperties}>
            <span className="inv-score__name">
              <span className="inv-score__dot" aria-hidden="true" />
              {pick(team.name, locale)}
            </span>
            <span className="inv-score__value inv-num">{formatNumber(team.score, locale)}</span>
            <span className="inv-score__bar" aria-hidden="true" />
          </li>
        ))}
      </ul>
      {recap.myPoints !== null ? <p className="inv-text">{t.recap.yours(recap.myPoints)}</p> : null}
      {recap.highlights.length > 0 ? (
        <>
          <h3 className="inv-h3">{t.recap.highlights}</h3>
          <ul className="inv-wishes">
            {recap.highlights.map((item) => (
              <li key={item.id} className="inv-wish">
                <p className="inv-wish__text">{item.text}</p>
                <p className="inv-wish__meta">{item.author}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
