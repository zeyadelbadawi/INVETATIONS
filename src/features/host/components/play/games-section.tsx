"use client";

import { useState } from "react";
import { changeGameState, seedGames, settle } from "@/features/control/actions";
import { Button } from "@/components/ui/button";
import { Badge, Card, Notice, SectionHeading } from "@/components/ui/card";
import type { Locale } from "@/i18n/config";
import { asEditConfig, gameTitle, truthInputs } from "../../lib/play";
import type { GameView } from "../../lib/play-data";
import { fmt } from "../../lib/text";
import { hostMessages } from "../../messages";
import { ActNotice } from "./act-notice";
import { GameEditor } from "./game-editor";
import { TruthForm } from "./truth-form";
import { issuesOf, useAct } from "./use-act";

type Props = {
  lang: Locale;
  eventId: string;
  games: GameView[];
  entitled: boolean;
  // Correct answers and settling are the owner's alone.
  isOwner: boolean;
  timezone: string;
};

export function GamesSection({ lang, eventId, games, entitled, isOwner, timezone }: Props) {
  const t = hostMessages(lang);
  const g = t.play.games;
  const { act, pending, message } = useAct(lang);
  const [editing, setEditing] = useState<string | null>(null);
  const [settling, setSettling] = useState<string | null>(null);

  if (!entitled) {
    return (
      <Card>
        <SectionHeading title={g.title} />
        <Notice>{g.upgrade}</Notice>
      </Card>
    );
  }

  const report = (result: unknown) => {
    const issues = issuesOf(result);
    return issues ? ({ tone: "danger", text: g.issues, issues } as const) : null;
  };

  if (games.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <ActNotice message={message} />
        <Card className="flex flex-col items-start gap-3">
          <h2 className="text-lg font-semibold">{g.emptyTitle}</h2>
          <p className="text-muted">{g.emptyBody}</p>
          <Button disabled={pending} aria-busy={pending} onClick={() => act(() => seedGames(eventId))}>
            {pending ? g.adding : g.addStarter}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ActNotice message={message} />
      <ul className="flex flex-col gap-4">
        {games.map((game) => {
          const config = asEditConfig(game.config);
          const title = gameTitle(game.config, lang, g.kinds[game.kind]);
          const inputs = config ? truthInputs(game.kind, config) : [];
          const settled = game.state === "settled";
          const quizBlocked = isOwner && game.kind === "quiz" && !game.hasTruth;
          const isEditing = editing === game.id;
          return (
            <li key={game.id}>
              <Card className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold [overflow-wrap:anywhere]">{title}</h3>
                    <p className="text-sm text-muted">
                      {g.kinds[game.kind]} · {fmt(g.answers, { n: game.answers })}
                    </p>
                  </div>
                  <Badge tone={game.state === "open" ? "success" : game.state === "hidden" ? "info" : "highlight"}>{g.states[game.state]}</Badge>
                </div>

                {settled ? (
                  <p className="text-sm text-muted">{g.ruleSettled}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      {game.state !== "open" ? (
                        <Button size="md" disabled={pending || quizBlocked} onClick={() => act(() => changeGameState(eventId, game.id, "open"), report)}>
                          {g.open}
                          <span className="sr-only"> — {title}</span>
                        </Button>
                      ) : (
                        <Button size="md" disabled={pending} onClick={() => act(() => changeGameState(eventId, game.id, "closed"), report)}>
                          {g.close}
                          <span className="sr-only"> — {title}</span>
                        </Button>
                      )}
                      {game.state !== "hidden" ? (
                        <Button variant="secondary" size="md" disabled={pending} onClick={() => act(() => changeGameState(eventId, game.id, "hidden"), report)}>
                          {g.hide}
                          <span className="sr-only"> — {title}</span>
                        </Button>
                      ) : null}
                      {config ? (
                        <Button
                          variant="secondary"
                          size="md"
                          aria-expanded={isEditing}
                          disabled={game.answers > 0}
                          onClick={() => setEditing(isEditing ? null : game.id)}
                        >
                          {isEditing ? g.editClose : g.edit}
                          <span className="sr-only"> — {title}</span>
                        </Button>
                      ) : null}
                    </div>
                    {game.kind === "quiz" && !game.hasTruth ? <p className="text-sm text-muted">{g.ruleQuiz}</p> : null}
                    {game.answers > 0 ? <p className="text-sm text-muted">{g.editLocked}</p> : null}
                  </div>
                )}

                {isEditing && config && !settled && game.answers === 0 ? (
                  <GameEditor
                    // Remounted when the stored game changes, so the form shows what was saved.
                    key={JSON.stringify(game.config)}
                    lang={lang}
                    eventId={eventId}
                    gameId={game.id}
                    kind={game.kind}
                    initial={config}
                    timezone={timezone}
                    pending={pending}
                    act={act}
                  />
                ) : null}

                {!settled && inputs.length > 0 ? (
                  isOwner ? (
                    <TruthForm
                      key={JSON.stringify(game.config)}
                      lang={lang}
                      eventId={eventId}
                      gameId={game.id}
                      kind={game.kind}
                      inputs={inputs}
                      hasTruth={game.hasTruth}
                      pending={pending}
                      act={act}
                    />
                  ) : (
                    <p className="text-sm text-muted">{g.ownerOnly}</p>
                  )
                ) : null}

                {!settled && isOwner && game.kind !== "clues" ? (
                  settling === game.id ? (
                    <div role="alertdialog" aria-label={g.settle} className="flex flex-wrap items-center gap-2">
                      <p className="w-full text-sm">{g.settleConfirm}</p>
                      <Button
                        variant="destructive"
                        size="md"
                        disabled={pending}
                        onClick={() => {
                          setSettling(null);
                          act(
                            () => settle(eventId, game.id),
                            (result) => report(result) ?? { tone: "success", text: fmt(g.settled, { n: "awarded" in result ? result.awarded : 0 }) },
                          );
                        }}
                      >
                        {g.settle}
                      </Button>
                      <Button variant="secondary" size="md" onClick={() => setSettling(null)}>
                        {t.common.keep}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 border-t border-line pt-3">
                      <div>
                        <Button variant="secondary" size="md" disabled={pending || game.state === "open"} onClick={() => setSettling(game.id)}>
                          {g.settle}
                          <span className="sr-only"> — {title}</span>
                        </Button>
                      </div>
                      {game.state === "open" ? <p className="text-sm text-muted">{g.ruleSettle}</p> : null}
                    </div>
                  )
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
