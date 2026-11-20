import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { Pinned } from "@/features/motion/Scrub";
import { genderRevealBank } from "@/play/banks/gender-reveal";
import { weddingBank } from "@/play/banks/wedding";
import { marketingMessages } from "../../messages";
import { AnswerSet } from "./answer-set";
import { GamesTrack } from "./games-track";

function byId<T extends { id: string }>(items: T[], id: string): T {
  return items.find((item) => item.id === id) ?? items[0];
}

// Four games on a horizontal track that follows the reading direction. Each
// panel carries a real item from the question banks and its answer buttons as
// the invitation draws them. Under reduced motion the panels stack.
export function Games({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).games;
  const quiz = byId(weddingBank.quiz.items, "w-quiz-first-meet");
  const vote = byId(weddingBank.thisOrThat.items, "w-tot-late");
  const prediction = byId(weddingBank.predictions.items, "w-pred-first-tears");
  const clue = byId(genderRevealBank.clues.items, "g-clue-cravings");
  const predictionOptions = prediction.answer.type === "choice" ? prediction.answer.options.map((o) => o[lang]) : [];

  const panels = [
    {
      key: "quiz",
      copy: t.panels.quiz,
      question: quiz.prompt[lang],
      options: quiz.options.map((o) => o[lang]),
      layout: "grid" as const,
      note: t.fromBank,
    },
    {
      key: "vote",
      copy: t.panels.vote,
      question: vote.prompt[lang],
      options: [...t.couple],
      layout: "pair" as const,
      note: `${t.fromBank}. ${t.sampleNames}.`,
    },
    {
      key: "prediction",
      copy: t.panels.prediction,
      question: prediction.prompt[lang],
      options: predictionOptions,
      layout: "list" as const,
      note: t.fromBank,
    },
    {
      key: "clues",
      copy: t.panels.clues,
      question: clue.text[lang],
      options: [...t.teams],
      layout: "pair" as const,
      note: t.fromBank,
    },
  ];

  return (
    <section id="games" aria-labelledby="games-title" className="mk-games">
      <Pinned lengthVh={240} className="mk-games__pin" stageClassName="mk-games__stage">
        <div className="mk-wrap mk-games__head">
          <h2 id="games-title" className="mk-h2">
            {t.title}
          </h2>
          <p className="mk-games__lead">{t.lead}</p>
        </div>
        <GamesTrack count={panels.length}>
          {panels.map((panel, index) => (
            <article key={panel.key} className="mk-panel" data-panel={index} data-kind={panel.key} aria-labelledby={`game-${panel.key}`} style={{ "--i": index } as CSSProperties}>
              <div className="mk-panel__intro">
                <h3 id={`game-${panel.key}`} className="mk-panel__name">
                  {panel.copy.name}
                </h3>
                <p className="mk-panel__body">{panel.copy.body}</p>
              </div>
              <div className="mk-card" lang={lang}>
                <p id={`q-${panel.key}`} className="mk-card__question">
                  {panel.question}
                </p>
                <AnswerSet options={panel.options} labelledBy={`q-${panel.key}`} layout={panel.layout} />
                <p className="mk-card__note">{panel.note}</p>
              </div>
            </article>
          ))}
        </GamesTrack>
      </Pinned>
      <noscript>
        <style>{".mk-games__pin{height:auto!important}.mk-games__pin>.mo-stage{position:relative;height:auto}.mk-games__row{flex-direction:column;width:auto;transform:none}.mk-panel{width:auto}"}</style>
      </noscript>
    </section>
  );
}
