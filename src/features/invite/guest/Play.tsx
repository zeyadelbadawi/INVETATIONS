"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { pick } from "@/content/schema";
import { getMessages } from "../messages";
import { apiPost, guestPath } from "../lib/api";
import { Icon } from "../Icon";
import type { GuestPlayer } from "../types";
import { teamColor, useInvite } from "./GuestContext";
import { Scoreboard } from "./Scoreboard";

type JoinResponse = { player: GuestPlayer; rejoinCode: string | null };

function RejoinCode({ code, onDone }: { code: string; onDone: () => void }) {
  const { locale } = useInvite();
  const t = getMessages(locale);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="inv-code" role="alertdialog" aria-labelledby="rejoin-title" aria-describedby="rejoin-body" tabIndex={-1} ref={ref} data-testid="rejoin">
      <h3 id="rejoin-title" className="inv-h3">
        {t.play.rejoinTitle}
      </h3>
      <p className="inv-code__digits inv-num" dir="ltr" data-testid="rejoin-code">
        {code}
      </p>
      <p id="rejoin-body" className="inv-hint">
        {t.play.rejoinBody}
      </p>
      <button type="button" className="inv-btn inv-btn--solid" onClick={onDone}>
        {t.play.rejoinDone}
      </button>
    </div>
  );
}

function Badge() {
  const { me, locale } = useInvite();
  const t = getMessages(locale);
  const ref = useRef<HTMLDivElement>(null);
  if (!me?.player) return null;
  const team = me.teams.find((item) => item.id === me.player?.teamId);
  return (
    <div className="inv-badge" style={{ "--team": teamColor(team?.color) } as CSSProperties} ref={ref} data-testid="badge">
      <span className="inv-badge__name">{me.player.name}</span>
      <span className="inv-badge__team">{team ? t.play.badge(pick(team.name, locale)) : t.play.noTeam}</span>
      {me.player.approved ? null : <span className="inv-hint">{t.play.pending}</span>}
    </div>
  );
}

function JoinCard({ onJoined }: { onJoined: (response: JoinResponse) => void }) {
  const { me, event, locale, teamJoin, demo } = useInvite();
  const t = getMessages(locale);
  const nameId = useId();
  const codeId = useId();
  const canPick = teamJoin === "pick" && !event.settings.lockTeams && (me?.teams.length ?? 0) > 0;
  const household = me?.household ?? [];
  const personal = me?.invitation.kind === "personal";

  const [mode, setMode] = useState<"claim" | "new">(household.length > 0 ? "claim" : "new");
  const [name, setName] = useState("");
  const [teamKey, setTeamKey] = useState<string | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messageFor = (code: string) =>
    ({ invalid_name: t.play.invalidName, invalid: t.play.invalidName, full: t.play.full, bad_team: t.play.badTeam, bad_code: t.play.badCode, not_found: t.play.badCode, locked: t.play.lockedOut, slow_down: t.common.slowDown })[code] ?? t.common.error;

  const send = async (body: unknown) => {
    if (demo) return;
    setBusy(true);
    setError(null);
    const result = await apiPost<JoinResponse>(guestPath(event.slug, "join"), body);
    setBusy(false);
    if (result.ok) onJoined(result.data);
    else setError(messageFor(result.error));
  };

  const submitNew = (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (Array.from(name.trim()).length < 2) return setError(t.play.invalidName);
    if (canPick && !teamKey) return setError(t.play.badTeam);
    void send(canPick && teamKey ? { name: name.trim(), teamKey } : { name: name.trim() });
  };

  if (mode === "claim" && household.length > 0) {
    return (
      <div className="inv-join" data-testid="join-claim">
        <p className="inv-text">
          <strong>{t.play.householdTitle}</strong> {t.play.householdBody}
        </p>
        <ul className="inv-members">
          {household.map((member) => (
            <li key={member.id}>
              {personal ? (
                <button type="button" className="inv-btn inv-btn--wide" disabled={busy || demo} onClick={() => send({ claim: member.id })}>
                  {member.name} <span className="inv-hint">{t.play.thatsMe}</span>
                </button>
              ) : (
                <button type="button" className="inv-btn inv-btn--wide" aria-pressed={claimId === member.id} disabled={busy || demo} onClick={() => setClaimId(member.id)}>
                  {member.name}
                </button>
              )}
            </li>
          ))}
        </ul>
        {!personal && claimId ? (
          <form
            className="inv-form"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              if (!/^[0-9]{6}$/.test(code)) return setError(t.play.badCode);
              void send({ claim: claimId, code });
            }}
          >
            <label className="inv-field" htmlFor={codeId}>
              <span className="inv-field__label">{t.play.code}</span>
              <input id={codeId} className="inv-input inv-num" dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </label>
            <button type="submit" className="inv-btn inv-btn--solid" disabled={busy}>
              {t.play.claim}
            </button>
          </form>
        ) : null}
        <p className="inv-error" role="alert">
          {error}
        </p>
        <button type="button" className="inv-link" onClick={() => (setMode("new"), setError(null))}>
          {t.play.newPlayer}
        </button>
      </div>
    );
  }

  return (
    <form className="inv-form inv-join" onSubmit={submitNew} noValidate data-testid="join-form">
      <p className="inv-text">{canPick ? t.play.intro : t.play.introAssigned}</p>
      <label className="inv-field" htmlFor={nameId}>
        <span className="inv-field__label">{t.play.name}</span>
        <input id={nameId} className="inv-input" name="player-name" autoComplete="given-name" maxLength={40} placeholder={t.play.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} disabled={busy || demo} enterKeyHint="done" />
      </label>
      {canPick ? (
        <fieldset className="inv-teams" disabled={busy || demo} data-count={me?.teams.length}>
          <legend className="inv-field__label">{t.play.pickTeam}</legend>
          {me?.teams.map((team) => (
            <label key={team.id} className="inv-team" style={{ "--team": teamColor(team.color) } as CSSProperties} data-testid={`team-${team.key}`}>
              <input type="radio" name="team" value={team.key} checked={teamKey === team.key} onChange={() => setTeamKey(team.key)} />
              <span className="inv-team__name">{pick(team.name, locale)}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <p className="inv-error" role="alert">
        {error}
      </p>
      <div className="inv-actions">
        <button type="submit" className="inv-btn inv-btn--solid inv-btn--wide" disabled={busy || demo}>
          {busy ? t.play.joining : t.play.join}
        </button>
        {household.length > 0 ? (
          <button type="button" className="inv-link" onClick={() => (setMode("claim"), setError(null))}>
            {personal ? t.play.householdTitle : t.play.haveCode}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function Play() {
  const { status, me, event, locale, patch, expectGuest } = useInvite();
  const t = getMessages(locale);
  // Shown once, held only in memory: the server never returns the code again.
  const [rejoinCode, setRejoinCode] = useState<string | null>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  if (!event.entitlements.games || event.status === "cancelled" || event.status === "postponed") return null;
  if (status === "loading" && expectGuest) {
    return (
      <section className="inv-block inv-skeleton" aria-hidden="true">
        <span className="inv-skeleton__line inv-skeleton__line--title" />
        <span className="inv-skeleton__line" />
      </section>
    );
  }
  if (status !== "ready" || !me) return null;

  const onJoined = (response: JoinResponse) => {
    patch({ player: response.player });
    setRejoinCode(response.rejoinCode);
    if (!response.rejoinCode) requestAnimationFrame(() => badgeRef.current?.focus());
  };

  return (
    <section id="play" className="inv-block inv-play" aria-labelledby="play-title" data-testid="play">
      <h2 id="play-title" className="inv-h2">
        {t.play.title}
      </h2>
      {me.player ? (
        <div tabIndex={-1} ref={badgeRef} className="inv-play__me">
          <Badge />
          {rejoinCode ? (
            <RejoinCode
              code={rejoinCode}
              onDone={() => {
                setRejoinCode(null);
                badgeRef.current?.focus();
              }}
            />
          ) : null}
        </div>
      ) : event.status === "published" ? (
        <JoinCard onJoined={onJoined} />
      ) : null}
      <Scoreboard />
      {me.player ? null : <p className="inv-sr">{t.games.joinToPlay}</p>}
    </section>
  );
}

export function PlayIcon() {
  return <Icon name="check" />;
}
