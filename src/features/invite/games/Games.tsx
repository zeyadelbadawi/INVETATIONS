"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import { pick, type Localized } from "@/content/schema";
import type { QuizQuestionView, QuizView } from "@/play/modules/quiz";
import type { VoteView } from "@/play/modules/vote";
import type { CluesView } from "@/play/modules/clues";
import type { PredictionView } from "@/play/modules/prediction";
import type { QuestionTally } from "@/play/types";
import type { Locale } from "@/i18n/config";
import { getMessages, type Messages } from "../messages";
import { formatDateTime } from "../lib/format";
import { Icon } from "../Icon";
import { teamColor, useInvite } from "../guest/GuestContext";
import type { GameItem, GamesData } from "./types";

type CardProps<V> = { game: GameItem & { view: V }; data: GamesData; locale: Locale; t: Messages; disabled: boolean };
type Option = { id: string; label: Localized };

function Frame({ kind, title, intro, state, t, children }: { kind: string; title: string; intro: string; state: string; t: Messages; children: React.ReactNode }) {
  const id = useId();
  const stateLabel = state === "open" ? t.games.open : state === "settled" ? t.games.settled : t.games.closed;
  return (
    <article className="inv-game" aria-labelledby={id} data-kind={kind} data-state={state} data-testid={`game-${kind}`}>
      <header className="inv-game__head">
        <h3 id={id} className="inv-h3">
          {title}
        </h3>
        <span className="inv-status" data-state={state}>
          {stateLabel}
        </span>
      </header>
      {intro ? <p className="inv-text">{intro}</p> : null}
      {children}
    </article>
  );
}

function Options({ name, options, value, onPick, disabled, locale }: { name: string; options: Option[]; value: string | null; onPick: (id: string) => void; disabled: boolean; locale: Locale }) {
  return (
    <div className="inv-options" role="radiogroup">
      {options.map((option) => (
        <label key={option.id} className="inv-choice">
          <input type="radio" name={name} value={option.id} checked={value === option.id} onChange={() => onPick(option.id)} disabled={disabled} />
          <span>{pick(option.label, locale)}</span>
        </label>
      ))}
    </div>
  );
}

export function QuizCard({ game, data, locale, t, disabled }: CardProps<QuizView>) {
  const { view } = game;
  const total = view.questionIds.length;
  const [current, setCurrent] = useState<{ question: QuizQuestionView; deadline: number | null } | null>(null);
  const [done, setDone] = useState(game.answered.length);
  const [finished, setFinished] = useState(view.state !== "open" || game.answered.length >= total);
  // Points are known only once the quiz has closed (the server keeps them back
  // while it is open, so they cannot reveal which answers were right).
  const earned = view.state !== "open" ? game.myPoints : null;
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const name = useId();

  useEffect(() => {
    if (!current?.deadline) return;
    const deadline = current.deadline;
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [current]);

  // The server hands out one question at a time and stamps when, so timing cannot be gamed.
  const next = async () => {
    setBusy(true);
    const served = await data.serve(game.id);
    setLeft(null);
    if (served.ok && !served.done) {
      // The countdown starts when the question reaches this phone; the server keeps its own, stricter clock.
      setCurrent({ question: served.question, deadline: served.seconds ? Date.now() + served.seconds * 1000 : null });
    } else {
      setCurrent(null);
      setFinished(true);
    }
    setBusy(false);
  };
  const answer = async (optionId: string) => {
    if (!current) return;
    setBusy(true);
    await data.answer(game.id, current.question.id, { optionId });
    setDone((n) => n + 1);
    await next();
  };

  return (
    <Frame kind="quiz" title={pick(view.title, locale)} intro={pick(view.intro ?? undefined, locale)} state={view.state} t={t}>
      {current ? (
        <div className="inv-quiz" aria-live="polite">
          <p className="inv-hint">
            {t.games.question(Math.min(done + 1, total), total)}
            {left !== null ? <span className="inv-quiz__time inv-num"> {t.games.secondsLeft(left)}</span> : null}
          </p>
          <p className="inv-quiz__prompt">{pick(current.question.prompt, locale)}</p>
          <Options key={current.question.id} name={name} options={current.question.options} value={null} onPick={answer} disabled={busy || disabled} locale={locale} />
          {left === 0 ? (
            <button type="button" className="inv-link" onClick={next} disabled={busy}>
              {t.games.next}
            </button>
          ) : null}
        </div>
      ) : finished ? (
        <p className="inv-text" role="status">
          <strong>{t.games.done}</strong> {earned !== null ? t.games.earned(earned) : t.games.pointsAfterClose}
        </p>
      ) : (
        <button type="button" className="inv-btn inv-btn--solid" onClick={next} disabled={busy || disabled}>
          {done === 0 ? t.games.start : t.games.next}
        </button>
      )}
    </Frame>
  );
}

function TallyBars({ tally, options, locale, t }: { tally: QuestionTally | undefined; options: Option[]; locale: Locale; t: Messages }) {
  if (!tally) return null;
  if (tally.suppressed) {
    return <p className="inv-hint">{{ vote_first: t.games.voteFirst, too_few: t.games.tooFew, state: t.games.afterClose }[tally.suppressed]}</p>;
  }
  const max = Math.max(1, ...(tally.options ?? []).map((o) => o.count));
  return (
    <ul className="inv-tally" aria-label={t.games.votes(tally.total)} data-testid="tally">
      {options.map((option) => {
        const count = tally.options?.find((o) => o.id === option.id)?.count ?? 0;
        return (
          <li key={option.id} style={{ "--fill": count / max } as CSSProperties}>
            <span>{pick(option.label, locale)}</span>
            <span className="inv-num">{count}</span>
            <span className="inv-tally__bar" aria-hidden="true" />
          </li>
        );
      })}
    </ul>
  );
}

export function VoteCard({ game, data, locale, t, disabled }: CardProps<VoteView>) {
  const { view } = game;
  // The API says which questions this player answered, not what they chose; the choice is kept for this visit only.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [answered, setAnswered] = useState(game.answered);
  const [busy, setBusy] = useState(false);
  const name = useId();
  const vote = async (questionId: string, optionId: string) => {
    setBusy(true);
    const result = await data.answer(game.id, questionId, { optionId });
    if (result.ok || result.error === "already_answered") {
      setPicked((current) => ({ ...current, [questionId]: optionId }));
      setAnswered((current) => [...current, questionId]);
      data.refresh();
    }
    setBusy(false);
  };
  return (
    <Frame kind="vote" title={pick(view.title, locale)} intro={pick(view.intro ?? undefined, locale)} state={view.state} t={t}>
      {view.questions.map((question) => {
        const mine = answered.includes(question.id);
        return (
          <fieldset key={question.id} className="inv-vote" data-mode={view.mode}>
            <legend className="inv-quiz__prompt">{pick(question.prompt, locale)}</legend>
            <Options name={`${name}-${question.id}`} options={question.options} value={picked[question.id] ?? null} onPick={(optionId) => vote(question.id, optionId)} disabled={busy || disabled || view.state !== "open" || mine} locale={locale} />
            {mine ? (
              <p className="inv-hint" role="status">
                <Icon name="check" size={14} /> {t.games.answered}
              </p>
            ) : null}
            <TallyBars tally={game.tally?.questions.find((q) => q.id === question.id)} options={question.options} locale={locale} t={t} />
          </fieldset>
        );
      })}
    </Frame>
  );
}

export function PredictionCard({ game, data, locale, t, disabled }: CardProps<PredictionView>) {
  const { view } = game;
  const [draft, setDraft] = useState<Record<string, string | number>>({});
  const [answered, setAnswered] = useState(game.answered);
  const [busy, setBusy] = useState(false);
  const name = useId();
  const open = view.state === "open";
  const pending = Object.keys(draft).filter((id) => !answered.includes(id));

  const save = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setBusy(true);
    for (const questionId of pending) {
      const result = await data.answer(game.id, questionId, { value: draft[questionId] });
      if (result.ok || result.error === "already_answered") setAnswered((current) => [...current, questionId]);
    }
    setBusy(false);
  };
  const set = (questionId: string, value: string | number | null) =>
    setDraft((current) => {
      const next = { ...current };
      if (value === null || value === "") delete next[questionId];
      else next[questionId] = value;
      return next;
    });

  return (
    <Frame kind="prediction" title={pick(view.title, locale)} intro={pick(view.intro ?? undefined, locale)} state={view.state} t={t}>
      <form className="inv-form" onSubmit={save}>
        {view.questions.map((question) => {
          const fieldId = `${name}-${question.id}`;
          const locked = disabled || busy || !open || answered.includes(question.id);
          const value = draft[question.id];
          if (question.type === "choice") {
            return (
              <fieldset key={question.id} className="inv-vote">
                <legend className="inv-quiz__prompt">{pick(question.prompt, locale)}</legend>
                <Options name={fieldId} options={question.options} value={typeof value === "string" ? value : null} onPick={(optionId) => set(question.id, optionId)} disabled={locked} locale={locale} />
              </fieldset>
            );
          }
          return (
            <label key={question.id} className="inv-field" htmlFor={fieldId}>
              <span className="inv-quiz__prompt">{pick(question.prompt, locale)}</span>
              <span className="inv-field__row">
                {question.type === "number" ? (
                  <input id={fieldId} className="inv-input inv-num" type="number" inputMode="decimal" dir="ltr" min={question.min} max={question.max} value={value ?? ""} onChange={(e) => set(question.id, e.target.value === "" ? null : Number(e.target.value))} disabled={locked} />
                ) : (
                  <input id={fieldId} className="inv-input inv-num" type={question.format === "date" ? "date" : "time"} dir="ltr" value={value ?? ""} onChange={(e) => set(question.id, e.target.value)} disabled={locked} />
                )}
                {question.type === "number" && pick(question.unit, locale) ? <span className="inv-hint">{pick(question.unit, locale)}</span> : null}
              </span>
            </label>
          );
        })}
        {open ? (
          <button type="submit" className="inv-btn inv-btn--solid" disabled={disabled || busy || pending.length === 0}>
            {t.games.saveGuess}
          </button>
        ) : null}
        <p className="inv-hint" role="status">
          {answered.length > 0 && pending.length === 0 ? t.games.guessSaved : ""}
        </p>
      </form>
    </Frame>
  );
}

export function ClueCards({ game, data, locale, t, disabled }: CardProps<CluesView>) {
  const { view } = game;
  const { me } = useInvite();
  const [seen, setSeen] = useState(game.answered);
  const [switched, setSwitched] = useState(false);
  const open = (clueId: string) => {
    if (seen.includes(clueId) || disabled || view.state !== "open") return;
    setSeen((current) => [...current, clueId]);
    void data.answer(game.id, clueId, { seen: true });
  };
  const others = me?.teams.filter((team) => team.id !== me.player?.teamId) ?? [];
  return (
    <Frame kind="clues" title={pick(view.title, locale)} intro={pick(view.intro ?? undefined, locale)} state={view.state} t={t}>
      <ul className="inv-clues">
        {view.clues.map((clue) =>
          clue.locked ? (
            <li key={clue.id} className="inv-clue" data-locked="true">
              <Icon name="lock" /> {t.games.clueLocked(formatDateTime(clue.revealAt, undefined, locale))}
            </li>
          ) : (
            <li key={clue.id} className="inv-clue">
              <details onToggle={(e) => e.currentTarget.open && open(clue.id)}>
                <summary>
                  <span>{pick(clue.text, locale)}</span>
                  {clue.hint ? <Icon name="down" /> : null}
                </summary>
                {clue.hint ? (
                  <p className="inv-hint">
                    {t.games.hint}: {pick(clue.hint, locale)}
                  </p>
                ) : null}
              </details>
            </li>
          ),
        )}
      </ul>
      {data.switchTeam && !switched && others.length > 0 ? (
        <div className="inv-actions">
          {others.map((team) => (
            <button
              key={team.id}
              type="button"
              className="inv-btn"
              style={{ "--team": teamColor(team.color) } as CSSProperties}
              disabled={disabled}
              data-testid={`switch-${team.key}`}
              onClick={async () => {
                const result = await data.switchTeam?.(team.key);
                if (result?.ok) setSwitched(true);
              }}
            >
              {t.games.switchTeam}: {pick(team.name, locale)}
            </button>
          ))}
        </div>
      ) : switched || me?.player?.teamSwitchedAt ? (
        <p className="inv-hint" role="status">
          {t.games.switched}
        </p>
      ) : null}
    </Frame>
  );
}

export function GameList({ data }: { data: GamesData }) {
  const { locale, me, demo } = useInvite();
  const t = getMessages(locale);
  const games = data.games.filter((game) => game.state !== "hidden" && game.view && "title" in game.view);
  if (games.length === 0) return null;
  const disabled = demo || !me?.player || !me.player.approved;
  return (
    <section id="games" className="inv-block inv-games" aria-labelledby="games-title" data-testid="games">
      <h2 id="games-title" className="inv-h2">
        {t.games.title}
      </h2>
      {!me?.player && !demo ? (
        <p className="inv-hint">
          <a className="inv-link" href="#play">
            {t.games.joinToPlay}
          </a>
        </p>
      ) : null}
      <div className="inv-games__list">
        {games.map((game) => {
          const props = { data, locale, t, disabled };
          switch (game.view.kind) {
            case "quiz":
              return <QuizCard key={game.id} game={{ ...game, view: game.view }} {...props} />;
            case "vote":
              return <VoteCard key={game.id} game={{ ...game, view: game.view }} {...props} />;
            case "prediction":
              return <PredictionCard key={game.id} game={{ ...game, view: game.view }} {...props} />;
            case "clues":
              return <ClueCards key={game.id} game={{ ...game, view: game.view }} {...props} />;
          }
        })}
      </div>
    </section>
  );
}
