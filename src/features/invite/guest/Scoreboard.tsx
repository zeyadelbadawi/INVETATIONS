"use client";

import type { CSSProperties } from "react";
import { pick } from "@/content/schema";
import { getMessages } from "../messages";
import { formatPoints } from "../lib/format";
import { teamColor, useInvite } from "./GuestContext";
import { useLive } from "./Live";

// Two teams pull a rope; three or more race on bars. Only transforms move.
export function Scoreboard() {
  const { me, locale } = useInvite();
  const { live, failing } = useLive();
  const t = getMessages(locale);
  if (!me || me.teams.length < 2) return null;

  const rows = me.teams.map((team) => {
    const entry = live?.scores.find((s) => s.teamId === team.id);
    return { team, score: entry?.score ?? 0, players: entry?.players ?? 0, mine: me.player?.teamId === team.id };
  });
  const total = rows.reduce((sum, row) => sum + row.score, 0);
  const max = Math.max(...rows.map((row) => row.score), 1);
  const duel = rows.length === 2;
  const share = total > 0 ? rows[0].score / total : 0.5;
  // The knot never reaches an end, so both sides stay visible however lopsided the score.
  const pull = 0.12 + share * 0.76;

  return (
    <div className="inv-score" data-testid="scoreboard" aria-busy={live === null}>
      <h3 className="inv-h3">{t.play.scoreboard}</h3>
      {duel ? (
        <div className="inv-rope" style={{ "--pull": pull, "--team-start": teamColor(rows[0].team.color), "--team-end": teamColor(rows[1].team.color) } as CSSProperties} aria-hidden="true">
          <span className="inv-rope__fill" />
          <span className="inv-rope__knot">
            <span className="inv-rope__mark" />
          </span>
        </div>
      ) : null}
      <ul className={duel ? "inv-score__duel" : "inv-score__bars"}>
        {rows.map((row) => (
          <li key={row.team.id} className="inv-score__row" data-mine={row.mine ? "true" : "false"} style={{ "--team": teamColor(row.team.color), "--fill": row.score / max } as CSSProperties}>
            <span className="inv-score__name">
              {pick(row.team.name, locale)}
              {row.mine ? <span className="inv-score__you">{t.play.you}</span> : null}
            </span>
            <span className="inv-score__value inv-num" data-testid={`score-${row.team.key}`}>
              {formatPoints(row.score, locale)}
            </span>
            <span className="inv-score__players">{row.mine ? t.play.playersWithYou(row.players) : t.play.players(row.players)}</span>
            {duel ? null : <span className="inv-score__bar" aria-hidden="true" />}
          </li>
        ))}
      </ul>
      <p className="inv-hint" role="status">
        {failing ? t.common.offline : total === 0 ? t.play.scoreboardEmpty : ""}
      </p>
    </div>
  );
}
