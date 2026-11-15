"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import { pick } from "@/content/schema";
import type { QuizQuestionView } from "@/play/modules/quiz";
import type { QuestionTally } from "@/play/types";
import type { Locale } from "@/i18n/config";
import { getMessages, type Messages } from "../messages";
import { formatDateTime } from "../lib/format";
import { Icon } from "../Icon";
import { teamColor, useInvite } from "../guest/GuestContext";
import type { CluesGame, Game, PredictionAnswer, PredictionGame, QuizGame, VoteGame } from "./types";

type CardProps<G> = { game: G; locale: Locale; t: Messages; disabled: boolean };

function Frame({ kind, title, intro, state, t, children }: { kind: string; title: string; intro: string; state: string; t: Messages; children: React.ReactNode }) {
  const id = useId();
  const stateLabel = state === "open" ? t.games.open : state === "settled" ? t.games.settled : t.games.closed;
  return (
    <article className="inv-game" aria-labelledby={id} data-kind={kind} data-state={state}>
      <header className="inv-game__head">
        <h3 id={id} className="inv-h3">
          {title}
        </h3>
        <span className="inv-chip">{stateLabel}</span>
      </header>
      {intro ? <p className="inv-text">{intro}</p> : null}
      {children}
    </article>
  );
}

function Options({ name, options, value, onPick, disabled, locale }: { name: string; options: { id: string; label: { ar: string; en: string } }[]; value: string | null; onPick: (id: string) => void; disabled: boolean; locale: Locale }) {
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

export function QuizCard({ game, locale, t, disabled }: CardProps<QuizGame>) {
  const { view } = game;
  const total = view.questionIds.length;
  const [current, setCurrent] = useState<{ question: QuizQuestionView; deadline: number | null } | null>(null);
  const [done, setDone] = useState(game.doneIds.length);
  const [earned, setEarned] = useState(game.earned);
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

  const next = async () => {
    setBusy(true);
    // An untimed quiz ships all its questions; a timed one serves them one by one.
    const local = view.questions?.find((q) => !game.doneIds.includes(q.id) && view.questionIds.indexOf(q.id) >= done);
    const served = local ? { question: local, deadline: null } : await game.serveNext();
    setCurrent(served);
    setLeft(null);
    setBusy(false);
  };
  const answer = async (optionId: string) => {
    if (!current) return;
    setBusy(true);
    const result = await game.answer(current.question.id, optionId);
    if (result.ok) setEarned((n) => n + result.score);
    setDone((n) => n + 1);
    setCurrent(null);
    setBusy(false);
  };

  const finished = done >= total || view.state !== "open";
  return (
    <Frame kind="quiz" title={pick(view.title, locale)} intro={pick(view.intro ?? undefined, locale)} state={view.state} t={t}>
      {current ? (
        <div className="inv-quiz" aria-live="polite">
          <p className="inv-hint">
            {t.games.question(done + 1, total)}
            {left !== null ? <span className="inv-quiz__time inv-num"> {t.games.secondsLeft(left)}</span> : null}
          </p>
          <p className="inv-quiz__prompt">{pick(current.question.prompt, locale)}</p>
          <Options name={name} options={current.question.options} value={null} onPick={answer} disabled={busy || disabled || left === 0} locale={locale} />
        </div>
      ) : finished ? (
        <p className="inv-text" role="status">
          <strong>{t.games.done}</strong> {t.games.earned(earned)}
        </p>
      ) : (
        <button type="button" className="inv-btn inv-btn--solid" onClick={next} disabled={busy || disabled}>
          {done === 0 ? t.games.start : t.games.next}
        </button>
      )}
    </Frame>
  );
}

function TallyBars({ tally, options, locale, t }: { tally: QuestionTally | undefined; options: { id: string; label: { ar: string; en: string } }[]; locale: Locale; t: Messages }) {
  if (!tally) return null;
  if (tally.suppressed) {
    return <p className="inv-hint">{{ vote_first: t.games.voteFirst, too_few: t.games.tooFew, state: t.games.afterClose }[tally.suppressed]}</p>;
  }
  const max = Math.max(1, ...(tally.options ?? []).map((o) => o.count));
  return (
    <ul className="inv-tally" aria-label={t.games.votes(tally.total)}>
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

export function VoteCard({ game, locale, t, disabled }: CardProps<VoteGame>) {
  const { view } = game;
  const [mine, setMine] = useState(game.mine);
  const [busy, setBusy] = useState(false);
  const name = useId();
  const vote = async (questionId: string, optionId: string) => {
    setBusy(true);
    const result = await game.answer(questionId, optionId);
    if (result.ok) setMine((current) => ({ ...current, [questionId]: optionId }));
    setBusy(false);
  };
  return (
    <Frame kind="vote" title={pick(view.title, locale)} intro={pick(view.intro ?? undefined, locale)} state={view.state} t={t}>
      {view.questions.map((question) => (
        <fieldset key={question.id} className="inv-vote" data-mode={view.mode}>
          <legend className="inv-quiz__prompt">{pick(question.prompt, locale)}</legend>
          <Options name={`${name}-${question.id}`} options={question.options} value={mine[question.id] ?? null} onPick={(optionId) => vote(question.id, optionId)} disabled={busy || disabled || view.state !== "open" || question.id in mine} locale={locale} />
          {question.id in mine ? (
            <p className="inv-hint" role="status">
              <Icon name="check" size={14} /> {t.games.answered}
            </p>
          ) : null}
          <TallyBars tally={game.tally?.questions.find((q) => q.id === question.id)} options={question.options} locale={locale} t={t} />
        </fieldset>
      ))}
    </Frame>
  );
}

export function PredictionCard({ game, locale, t, disabled }: CardProps<PredictionGame>) {
  const { view } = game;
  const [draft, setDraft] = useState<Record<string, PredictionAnswer>>(game.mine);
  const [saved, setSaved] = useState(Object.keys(game.mine).length > 0);
  const [busy, setBusy] = useState(false);
  const name = useId();
  const locked = disabled || busy || view.state !== "open";

  const save = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setBusy(true);
    const results = await Promise.all(Object.entries(draft).map(([questionId, answer]) => game.answer(questionId, answer)));
    setSaved(results.every((result) => result.ok));
    setBusy(false);
  };

  return (
    <Frame kind="prediction" title={pick(view.title, locale)} intro={pick(view.intro ?? undefined, locale)} state={view.state} t={t}>
      <form className="inv-form" onSubmit={save}>
        {view.questions.map((question) => {
          const mine = draft[question.id];
          const fieldId = `${name}-${question.id}`;
          return question.type === "choice" ? (
            <fieldset key={question.id} className="inv-vote">
              <legend className="inv-quiz__prompt">{pick(question.prompt, locale)}</legend>
              <Options name={fieldId} options={question.options} value={mine && "optionId" in mine ? mine.optionId : null} onPick={(optionId) => (setSaved(false), setDraft((d) => ({ ...d, [question.id]: { optionId } })))} disabled={locked} locale={locale} />
            </fieldset>
          ) : (
            <label key={question.id} className="inv-field" htmlFor={fieldId}>
              <span className="inv-quiz__prompt">{pick(question.prompt, locale)}</span>
              <span className="inv-field__row">
                <input
                  id={fieldId}
                  className="inv-input inv-num"
                  type="number"
                  inputMode="decimal"
                  dir="ltr"
                  min={question.min}
                  max={question.max}
                  value={mine && "value" in mine ? mine.value : ""}
                  onChange={(e) => (setSaved(false), setDraft((d) => (e.target.value === "" ? d : { ...d, [question.id]: { value: Number(e.target.value) } })))}
                  disabled={locked}
                />
                {question.unit ? <span className="inv-hint">{pick(question.unit, locale)}</span> : null}
              </span>
            </label>
          );
        })}
        {view.state === "open" ? (
          <button type="submit" className="inv-btn inv-btn--solid" disabled={locked || Object.keys(draft).length === 0}>
            {t.games.saveGuess}
          </button>
        ) : null}
        <p className="inv-hint" role="status">
          {saved ? t.games.guessSaved : ""}
        </p>
      </form>
    </Frame>
  );
}

export function ClueCards({ game, locale, t, disabled }: CardProps<CluesGame>) {
  const { view } = game;
  const { me } = useInvite();
  const [seen, setSeen] = useState(game.seenIds);
  const [switched, setSwitched] = useState(false);
  const open = (clueId: string) => {
    if (seen.includes(clueId) || disabled) return;
    setSeen((current) => [...current, clueId]);
    void game.markSeen(clueId);
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
      {game.switchTeam && !switched && others.length > 0 ? (
        <div className="inv-actions">
          {others.map((team) => (
            <button
              key={team.id}
              type="button"
              className="inv-btn"
              style={{ "--team": teamColor(team.color) } as CSSProperties}
              disabled={disabled}
              onClick={async () => {
                const result = await game.switchTeam?.(team.key);
                if (result?.ok) setSwitched(true);
              }}
            >
              {t.games.switchTeam}: {pick(team.name, locale)}
            </button>
          ))}
        </div>
      ) : switched ? (
        <p className="inv-hint" role="status">
          {t.games.switched}
        </p>
      ) : null}
    </Frame>
  );
}

export function GameList({ games }: { games: Game[] }) {
  const { locale, me, demo } = useInvite();
  const t = getMessages(locale);
  if (games.length === 0) return null;
  const disabled = demo || !me?.player;
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
          const props = { locale, t, disabled };
          switch (game.view.kind) {
            case "quiz":
              return <QuizCard key={game.id} game={game as QuizGame} {...props} />;
            case "vote":
              return <VoteCard key={game.id} game={game as VoteGame} {...props} />;
            case "prediction":
              return <PredictionCard key={game.id} game={game as PredictionGame} {...props} />;
            case "clues":
              return <ClueCards key={game.id} game={game as CluesGame} {...props} />;
          }
        })}
      </div>
    </section>
  );
}
