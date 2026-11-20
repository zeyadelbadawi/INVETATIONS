"use client";

import { useState } from "react";
import { approvePlayer, changePlayerName, kickPlayer } from "@/features/control/actions";
import { Button } from "@/components/ui/button";
import { Badge, Card, Notice, SectionHeading } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import type { PlayerView } from "../../lib/play-data";
import { fmt } from "../../lib/text";
import { hostMessages } from "../../messages";
import { ActNotice } from "./act-notice";
import { useAct } from "./use-act";

type Props = { lang: Locale; eventId: string; players: PlayerView[]; teams: { id: string; name: string }[] };

export function PlayersSection({ lang, eventId, players, teams }: Props) {
  const t = hostMessages(lang);
  const p = t.play.players;
  const { act, pending, message } = useAct(lang);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const waiting = players.filter((player) => !player.approved);
  const groups = [
    ...teams.map((team) => ({ key: team.id, name: team.name, members: players.filter((player) => player.teamId === team.id) })),
    { key: "none", name: p.noTeam, members: players.filter((player) => !player.teamId || !teams.some((team) => team.id === player.teamId)) },
  ].filter((group) => group.members.length > 0);

  const failedIfFalse = (ok: boolean) => (ok ? null : ({ tone: "danger", text: t.play.failed } as const));

  function row(player: PlayerView) {
    const isRenaming = renaming?.id === player.id;
    const isRemoving = removing === player.id;
    return (
      <li key={player.id} className="flex flex-col gap-2 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold [overflow-wrap:anywhere]">{player.name}</p>
            {player.invitation ? <p className="text-sm text-muted [overflow-wrap:anywhere]">{fmt(p.via, { label: player.invitation })}</p> : null}
          </div>
          <Badge tone={player.approved ? "info" : "highlight"}>{player.approved ? p.approvedBadge : p.waitingBadge}</Badge>
        </div>

        {isRenaming ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (renaming.name.trim().length < 2) return;
              const { id, name } = renaming;
              setRenaming(null);
              act(() => changePlayerName(eventId, id, name.trim()), failedIfFalse);
            }}
          >
            <div className="min-w-40 flex-1">
              <label htmlFor={`rename-${player.id}`} className="mb-1 block text-sm font-medium">
                {p.newName}
              </label>
              <Input
                id={`rename-${player.id}`}
                value={renaming.name}
                maxLength={40}
                autoFocus
                aria-invalid={renaming.name.trim().length < 2}
                onChange={(e) => setRenaming({ id: player.id, name: e.target.value })}
              />
            </div>
            <Button type="submit" size="md" disabled={pending || renaming.name.trim().length < 2}>
              {p.saveName}
            </Button>
            <Button variant="secondary" size="md" onClick={() => setRenaming(null)}>
              {t.common.cancel}
            </Button>
          </form>
        ) : isRemoving ? (
          <div role="alertdialog" aria-label={p.remove} className="flex flex-wrap items-center gap-2">
            <p className="w-full text-sm">{fmt(p.removeConfirm, { name: player.name })}</p>
            <Button
              variant="destructive"
              size="md"
              disabled={pending}
              onClick={() => {
                setRemoving(null);
                act(() => kickPlayer(eventId, player.id), failedIfFalse);
              }}
            >
              {t.common.confirm}
            </Button>
            <Button variant="secondary" size="md" onClick={() => setRemoving(null)}>
              {t.common.keep}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={player.approved ? "secondary" : "primary"}
              size="md"
              disabled={pending}
              onClick={() => act(() => approvePlayer(eventId, player.id, !player.approved), failedIfFalse)}
            >
              {player.approved ? p.unapprove : p.approve}
              <span className="sr-only"> — {player.name}</span>
            </Button>
            <Button variant="secondary" size="md" disabled={pending} onClick={() => setRenaming({ id: player.id, name: player.name })}>
              {p.rename}
              <span className="sr-only"> — {player.name}</span>
            </Button>
            <Button variant="dangerText" size="md" disabled={pending} onClick={() => setRemoving(player.id)}>
              {p.remove}
              <span className="sr-only"> — {player.name}</span>
            </Button>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ActNotice message={message} />
      {waiting.length > 0 ? (
        <Card className="border-fg/25">
          <SectionHeading title={fmt(p.waiting, { n: waiting.length })} />
          <ul className="flex flex-col divide-y divide-line">{waiting.map(row)}</ul>
        </Card>
      ) : null}
      <Card>
        <SectionHeading title={p.title} lead={fmt(p.count, { n: players.length })} />
        {players.length === 0 ? (
          <Notice>{p.empty}</Notice>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.name}>
                <h3 className="text-sm font-semibold text-muted">
                  {group.name} · {group.members.length}
                </h3>
                <ul className="flex flex-col divide-y divide-line">{group.members.map(row)}</ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
