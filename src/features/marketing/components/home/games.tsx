import type { CSSProperties, ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { Pinned } from "@/features/motion/Scrub";
import { genderRevealBank } from "@/play/banks/gender-reveal";
import { weddingBank } from "@/play/banks/wedding";
import { marketingMessages } from "../../messages";
import { AnswerSet, GuessSlider } from "./answer-set";
import { GamesTrack } from "./games-track";

function byId<T extends { id: string }>(items: T[], id: string): T {
  return items.find((item) => item.id === id) ?? items[0];
}

// Sample data for the panels: which quiz answer the couple gave, how the room
// split on the vote, and the starting guess on the slider. Labelled as samples
// in the section lead.
const QUIZ_COUPLE_ANSWER = 2;
const VOTE_SPLIT = [58, 42] as const;
const GUESS_START = 20;
const CLUE_IDS = ["g-clue-cravings", "g-clue-heartbeat", "g-clue-ring"];

// Four games on a horizontal track that follows the reading direction. Each
// panel is drawn for what the game asks: a timed quiz whose answer shows when
// the clock runs out, a two-way vote with the room's split, a guess on a scale,
// and clues that arrive one by one. The track dwells on every panel before it
// moves on (marketing.css). Under reduced motion the panels stack.
export function Games({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).games;
  const quiz = byId(weddingBank.quiz.items, "w-quiz-first-meet");
  const vote = byId(weddingBank.thisOrThat.items, "w-tot-late");
  const guess = byId(weddingBank.predictions.items, "w-pred-zaffa-delay");
  const clues = CLUE_IDS.map((id) => byId(genderRevealBank.clues.items, id));
  const range = guess.answer.type === "number" ? guess.answer : { min: 0, max: 180, unit: { ar: "دقيقة", en: "min" } };

  return (
    <section id="games" aria-labelledby="games-title" className="mk-games">
      <Pinned lengthVh={200} className="mk-games__pin" stageClassName="mk-games__stage">
        <div className="mk-wrap mk-games__head">
          <h2 id="games-title" className="mk-h2">
            {t.title}
          </h2>
          <p className="mk-games__lead">{t.lead}</p>
        </div>
        <GamesTrack count={4}>
          <Panel index={0} kind="quiz" name={t.panels.quiz.name} body={t.panels.quiz.body}>
            <div className="mk-quiz" lang={lang}>
              <span className="mk-quiz__clock" aria-hidden="true" />
              <p id="q-quiz" className="mk-quiz__question">
                {quiz.prompt[lang]}
              </p>
              <AnswerSet options={quiz.options.map((o) => o[lang])} labelledBy="q-quiz" kind="quiz" marked={QUIZ_COUPLE_ANSWER} markedLabel={t.coupleAnswer} />
            </div>
          </Panel>

          <Panel index={1} kind="vote" name={t.panels.vote.name} body={t.panels.vote.body}>
            <div className="mk-vote" lang={lang}>
              <p id="q-vote" className="mk-vote__question">
                {vote.prompt[lang]}
              </p>
              <AnswerSet options={[...t.couple]} labelledBy="q-vote" kind="vote" />
              <figure className="mk-split">
                <div className="mk-split__bar" aria-hidden="true">
                  <span className="mk-split__part" data-side="start" style={{ "--share": VOTE_SPLIT[0] / 100 } as CSSProperties} />
                  <span className="mk-split__part" data-side="end" style={{ "--share": VOTE_SPLIT[1] / 100 } as CSSProperties} />
                </div>
                <figcaption className="mk-split__caption">
                  <span>
                    {t.couple[0]} <b>{VOTE_SPLIT[0]}%</b>
                  </span>
                  <span className="mk-split__label">{t.splitLabel}</span>
                  <span>
                    {t.couple[1]} <b>{VOTE_SPLIT[1]}%</b>
                  </span>
                </figcaption>
              </figure>
            </div>
          </Panel>

          <Panel index={2} kind="guess" name={t.panels.prediction.name} body={t.panels.prediction.body}>
            <div className="mk-guess" lang={lang}>
              <p id="q-guess" className="mk-guess__question">
                {guess.prompt[lang]}
              </p>
              <GuessSlider labelledBy="q-guess" label={t.sliderLabel} min={range.min} max={range.max} start={GUESS_START} unit={range.unit[lang]} />
            </div>
          </Panel>

          <Panel index={3} kind="clues" name={t.panels.clues.name} body={t.panels.clues.body}>
            <div className="mk-clues" lang={lang}>
              <ol className="mk-clues__list">
                {clues.map((clue, index) => (
                  <li key={clue.id} className="mk-clues__line" style={{ "--c": index } as CSSProperties}>
                    {clue.text[lang]}
                  </li>
                ))}
              </ol>
              <p id="q-clues" className="mk-clues__prompt">
                {t.switchPrompt}
              </p>
              <AnswerSet options={[...t.teams]} labelledBy="q-clues" kind="teams" />
            </div>
          </Panel>
        </GamesTrack>
      </Pinned>
      <noscript>
        <style>{".mk-games__pin{height:auto!important}.mk-games__pin>.mo-stage{position:relative;height:auto}.mk-games__row{flex-direction:column;width:auto;transform:none}.mk-panel{width:auto;opacity:1!important}"}</style>
      </noscript>
    </section>
  );
}

function Panel({ index, kind, name, body, children }: { index: number; kind: string; name: string; body: string; children: ReactNode }) {
  return (
    <article className="mk-panel" data-panel={index} data-kind={kind} aria-labelledby={`game-${kind}`} style={{ "--i": index } as CSSProperties}>
      <div className="mk-panel__intro">
        <h3 id={`game-${kind}`} className="mk-panel__name">
          {name}
        </h3>
        <p className="mk-panel__body">{body}</p>
      </div>
      {children}
    </article>
  );
}
