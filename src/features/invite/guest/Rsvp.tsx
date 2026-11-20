"use client";

import { useId, useRef, useState } from "react";
import { getMessages } from "../messages";
import { apiPost, guestPath } from "../lib/api";
import { Icon } from "../Icon";
import type { GuestPlayer, GuestRsvp } from "../types";
import { useInvite } from "./GuestContext";
import { JoinCard, RejoinCode, type JoinResponse } from "./Play";

const GROUP_CAP = 6;
type Status = GuestRsvp["status"];

function Stepper({ label, value, min, max, onChange, less, more }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; less: string; more: string }) {
  return (
    <div className="inv-stepper" role="group" aria-label={label}>
      <span className="inv-stepper__label">{label}</span>
      <button type="button" className="inv-stepper__btn" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`${less}: ${label}`}>
        <Icon name="minus" />
      </button>
      <output className="inv-stepper__value inv-num" aria-live="polite">
        {value}
      </output>
      <button type="button" className="inv-stepper__btn" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`${more}: ${label}`}>
        <Icon name="plus" />
      </button>
    </div>
  );
}

export function Rsvp() {
  const { status, me, expectGuest, event, locale, demo, patch } = useInvite();
  const t = getMessages(locale);
  const noteId = useId();
  const nameId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const saved = me?.rsvp ?? null;
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<Status | null>(null);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  // Shown once, held only in memory: the server never returns the code again.
  const [rejoinCode, setRejoinCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (event.status === "postponed" || event.status === "cancelled") return null;
  if (status === "loading" && expectGuest) {
    return (
      <section className="inv-block inv-skeleton" aria-hidden="true">
        <span className="inv-skeleton__line inv-skeleton__line--title" />
        <span className="inv-skeleton__line" />
        <span className="inv-skeleton__line" />
      </section>
    );
  }
  if (status !== "ready" || !me) return null;

  const personal = me.invitation.kind === "personal";
  const cap = personal ? me.invitation.paxCap : GROUP_CAP;
  const open = me.rsvpOpen && event.status === "published";
  const showForm = open && (saved === null || editing);
  const counted = choice === "yes" || choice === "maybe";
  // Shared links answer per person, so the server needs a name first. With games
  // that happens in «يلا نلعب»; without them (Basic plan) the reply asks for it.
  const games = event.entitlements.games;
  const needsName = !personal && !me.player;
  const nameHere = needsName && !games;
  const claimFirst = nameHere && me.household.length > 0;

  const joined = (response: JoinResponse) => {
    patch({ player: response.player });
    setRejoinCode(response.rejoinCode);
  };

  const startEdit = () => {
    setChoice(saved?.status ?? null);
    setAdults(Math.max(1, saved?.adults ?? 1));
    setChildren(saved?.children ?? 0);
    setNote(saved?.note ?? "");
    setError(null);
    setEditing(true);
  };

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (demo) return;
    if (nameHere && Array.from(name.trim()).length < 2) return setError(t.play.invalidName);
    if (!choice) return setError(t.rsvp.pickOne);
    setBusy(true);
    setError(null);
    if (nameHere) {
      // Same request and rules as joining from the games section, without a team.
      const join = await apiPost<{ player: GuestPlayer; rejoinCode: string | null }>(guestPath(event.slug, "join"), { name: name.trim() });
      if (!join.ok) {
        setBusy(false);
        return setError(join.error === "invalid_name" || join.error === "invalid" ? t.play.invalidName : join.error === "full" ? t.play.full : join.error === "slow_down" ? t.common.slowDown : t.common.error);
      }
      joined(join.data);
    }
    const body = { status: choice, adults: counted ? (personal ? adults : 1) : 0, children: counted && personal ? children : 0, note: note.trim() };
    const result = await apiPost<{ rsvp: GuestRsvp }>(guestPath(event.slug, "rsvp"), body);
    setBusy(false);
    if (result.ok) {
      patch({ rsvp: result.data.rsvp });
      setEditing(false);
      requestAnimationFrame(() => headingRef.current?.focus());
      return;
    }
    if (result.error === "rsvp_closed") patch({ rsvpOpen: false });
    setError(
      result.error === "over_cap" ? t.rsvp.overCap : result.error === "not_joined" ? t.rsvp.joinFirst : result.error === "rsvp_closed" ? t.rsvp.closed : result.error === "slow_down" ? t.common.slowDown : t.common.error,
    );
  };

  const doneText = saved ? { yes: t.rsvp.doneYes, no: t.rsvp.doneNo, maybe: t.rsvp.doneMaybe }[saved.status] : "";
  const options: [Status, string][] = [
    ["yes", t.rsvp.yes],
    ["maybe", t.rsvp.maybe],
    ["no", t.rsvp.no],
  ];

  return (
    <section id="rsvp" className="inv-block inv-rsvp" aria-labelledby="rsvp-title" data-testid="rsvp">
      <h2 id="rsvp-title" className="inv-h2" tabIndex={-1} ref={headingRef}>
        {t.rsvp.title}
      </h2>
      {personal ? <p className="inv-hint">{t.rsvp.forParty(me.invitation.label)}</p> : null}

      {rejoinCode ? <RejoinCode code={rejoinCode} onDone={() => (setRejoinCode(null), headingRef.current?.focus())} /> : null}
      {needsName && games ? (
        <p className="inv-text" data-testid="rsvp-join-first">
          <a className="inv-link" href="#play">
            {t.rsvp.joinFirst}
          </a>
        </p>
      ) : claimFirst ? (
        <JoinCard onJoined={joined} withTeams={false} />
      ) : showForm ? (
        <form className="inv-form" onSubmit={submit} noValidate data-testid="rsvp-form">
          {nameHere ? (
            <label className="inv-field" htmlFor={nameId}>
              <span className="inv-field__label">{t.play.name}</span>
              <input id={nameId} className="inv-input" name="guest-name" autoComplete="name" maxLength={40} placeholder={t.play.namePlaceholder} value={name} onChange={(e) => (setName(e.target.value), setError(null))} disabled={busy || demo} data-testid="rsvp-name" />
            </label>
          ) : null}
          <fieldset className="inv-choices" disabled={busy || demo}>
            <legend className="inv-sr">{t.rsvp.title}</legend>
            {options.map(([value, label]) => (
              <label key={value} className="inv-choice" data-value={value}>
                <input type="radio" name="rsvp-status" value={value} checked={choice === value} onChange={() => setChoice(value)} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          {counted && personal && cap > 1 ? (
            <div className="inv-party">
              <Stepper label={t.rsvp.adults} value={adults} min={children > 0 ? 0 : 1} max={cap - children} onChange={setAdults} less={t.rsvp.less} more={t.rsvp.more} />
              <Stepper label={t.rsvp.children} value={children} min={0} max={cap - adults} onChange={setChildren} less={t.rsvp.less} more={t.rsvp.more} />
              <p className="inv-hint">{t.rsvp.cap(cap)}</p>
            </div>
          ) : null}

          <label className="inv-field" htmlFor={noteId}>
            <span className="inv-field__label">{t.rsvp.note}</span>
            <textarea id={noteId} className="inv-input" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy || demo} />
          </label>

          <p className="inv-error" role="alert">
            {error}
          </p>
          <div className="inv-actions">
            <button type="submit" className="inv-btn inv-btn--solid inv-btn--wide" disabled={busy || demo}>
              {busy ? t.rsvp.sending : t.rsvp.submit}
            </button>
            {editing ? (
              <button type="button" className="inv-btn" onClick={() => setEditing(false)} disabled={busy}>
                {t.common.cancel}
              </button>
            ) : null}
          </div>
        </form>
      ) : saved ? (
        <div className="inv-answer" data-status={saved.status} role="status" data-testid="rsvp-answer">
          <span className="inv-answer__mark" aria-hidden="true">
            <Icon name="check" size={22} />
          </span>
          <p className="inv-answer__text">{doneText}</p>
          {saved.status !== "no" && personal && cap > 1 ? <p className="inv-hint">{t.rsvp.summary(saved.adults, saved.children)}</p> : null}
          {open ? (
            <button type="button" className="inv-btn" onClick={startEdit}>
              {t.rsvp.change}
            </button>
          ) : (
            <p className="inv-hint">{t.rsvp.closed}</p>
          )}
        </div>
      ) : (
        <div role="status">
          <p className="inv-text">{t.rsvp.closed}</p>
          <p className="inv-hint">{t.rsvp.closedBody}</p>
        </div>
      )}
    </section>
  );
}
