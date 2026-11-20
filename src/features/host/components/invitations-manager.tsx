"use client";

import { useState, useTransition } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge, FormSection, Notice } from "@/components/ui/card";
import type { Locale } from "@/i18n/config";
import {
  addInvitationsAction,
  exportGuestsAction,
  regenerateInvitationAction,
  revokeInvitationAction,
} from "../actions/invitations";
import type { ActionResult } from "../lib/errors";
import type { InvitationRowInput } from "../lib/invitations";
import { fmt } from "../lib/text";
import { errorText, hostMessages } from "../messages";
import { AddInvitationForm, BulkInvitationForm, type TeamOption } from "./invitation-forms";

export type InvitationView = {
  id: string;
  label: string;
  kind: "personal" | "group" | "open";
  side: string | null;
  seats: number;
  // Shown as stored for the owner, masked for staff.
  phone: string | null;
  opened: boolean;
  revoked: boolean;
};

type Props = {
  lang: Locale;
  eventId: string;
  slug: string;
  origin: string;
  invitations: InvitationView[];
  teams: TeamOption[];
  used: number;
  maxGuests: number | null;
  personalLinks: boolean;
  hasPlan: boolean;
  canExport: boolean;
};

// A link the host can send right now. Codes exist only in this page's memory:
// the server keeps a hash, so after a reload the host makes a new link instead.
type FreshLink = { code: string; phone: string | null; label: string };

export function InvitationsManager(props: Props) {
  const { lang, eventId, slug, origin, invitations, teams, used, maxGuests, personalLinks, hasPlan, canExport } = props;
  const t = hostMessages(lang);
  const i = t.invitations;
  const [fresh, setFresh] = useState<Record<string, FreshLink>>({});
  const [confirming, setConfirming] = useState<{ id: string; what: "revoke" | "regenerate" } | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The code rides in the fragment, which browsers never send to a server (security rule 2).
  const linkFor = (code: string) => `${origin}/l/${slug}#${code}`;
  const fail = (result: Extract<ActionResult, { ok: false }>) =>
    setMessage({ tone: "danger", text: errorText(t, result.error, result.detail) });

  function add(rows: InvitationRowInput[]): Promise<boolean> {
    setMessage(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await addInvitationsAction(eventId, rows);
        if (!result.ok) {
          fail(result);
          resolve(false);
          return;
        }
        setFresh((current) => ({
          ...current,
          ...Object.fromEntries(result.created.map((c) => [c.id, { code: c.code, phone: c.phone, label: c.label }])),
        }));
        setMessage({ tone: "success", text: fmt(i.created, { n: result.created.length }) });
        resolve(true);
      });
    });
  }

  function regenerate(id: string) {
    setConfirming(null);
    setMessage(null);
    startTransition(async () => {
      const result = await regenerateInvitationAction(eventId, id);
      if (!result.ok) return fail(result);
      const { created } = result;
      setFresh((current) => ({ ...current, [created.id]: { code: created.code, phone: created.phone, label: created.label } }));
    });
  }

  function revoke(id: string) {
    setConfirming(null);
    setMessage(null);
    startTransition(async () => {
      const result = await revokeInvitationAction(eventId, id);
      if (!result.ok) return fail(result);
      setFresh((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
    });
  }

  async function copy(id: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(id);
      setTimeout(() => setCopied((current) => (current === id ? null : current)), 2500);
    } catch {
      setMessage({ tone: "danger", text: t.errors.unknown });
    }
  }

  function exportCsv() {
    setMessage(null);
    startTransition(async () => {
      const result = await exportGuestsAction(eventId, lang);
      if (!result.ok) return fail(result);
      const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slug}-guests.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  const share = maxGuests === null ? null : Math.min(1, used / Math.max(1, maxGuests));

  return (
    <div className="flex w-full max-w-5xl flex-col gap-10">
      <div className="flex flex-col gap-3">
        <p className="max-w-prose text-muted">{i.lead}</p>
        <div className="max-w-md">
          <p className="font-medium tabular-nums">
            {maxGuests === null ? fmt(i.seatsUnlimited, { used }) : fmt(i.seats, { used, max: maxGuests })}
          </p>
          {share !== null ? (
            // The share of the plan's seats already given out; the sentence above carries the numbers.
            <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div className={`h-full ${share >= 1 ? "bg-danger" : "bg-primary"}`} style={{ width: `${share * 100}%` }} />
            </div>
          ) : null}
          {!hasPlan && maxGuests !== null ? <p className="mt-2 text-sm text-muted">{fmt(i.draftNote, { max: maxGuests })}</p> : null}
        </div>
      </div>

      <div aria-live="polite" className="empty:-mb-10">
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      </div>

      <FormSection id="inv-add" title={i.addTitle}>
        <AddInvitationForm lang={lang} teams={teams} personalLinks={personalLinks} pending={pending} onAdd={add} />
      </FormSection>

      <FormSection id="inv-bulk" title={i.bulkTitle} lead={i.bulkLead}>
        <BulkInvitationForm lang={lang} personalLinks={personalLinks} pending={pending} onAdd={add} />
      </FormSection>

      <FormSection
        id="inv-list"
        title={
          <>
            {i.listTitle} <span className="font-normal text-muted tabular-nums">({invitations.length})</span>
          </>
        }
        lead={i.regenerateHint}
        aside={
          canExport && invitations.length > 0 ? (
            <Button variant="secondary" size="sm" disabled={pending} onClick={exportCsv}>
              {i.export}
            </Button>
          ) : null
        }
        bare
      >
        {invitations.length === 0 ? (
          <p className="p-6 text-muted">{i.empty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {invitations.map((inv) => {
              const link = fresh[inv.id] && !inv.revoked ? fresh[inv.id] : null;
              const url = link ? linkFor(link.code) : null;
              const asking = confirming?.id === inv.id ? confirming.what : null;
              return (
                <li key={inv.id} className={`flex flex-col gap-3 px-4 py-4 sm:px-5 ${url ? "bg-primary/[0.07]" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <h3 className={`font-semibold [overflow-wrap:anywhere] ${inv.revoked ? "text-muted line-through" : ""}`}>{inv.label}</h3>
                      <p className="text-sm text-muted tabular-nums">
                        {i.kinds[inv.kind]}
                        {inv.kind === "open" ? null : <> · {fmt(i.seatsOf, { n: inv.seats })}</>}
                        {inv.side ? <> · {inv.side}</> : null}
                        {inv.phone ? (
                          <>
                            {" · "}
                            <bdi dir="ltr">{inv.phone}</bdi>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {inv.revoked ? (
                      <Badge tone="danger">{i.revoked}</Badge>
                    ) : (
                      <Badge tone={inv.opened ? "success" : "info"}>{inv.opened ? i.opened : i.notOpened}</Badge>
                    )}
                  </div>

                  {url && link ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium">{i.linkReady}</p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`https://wa.me/${(link.phone ?? "").replace(/^\+/, "")}?text=${encodeURIComponent(`${fmt(i.whatsappMessage, { name: link.label })} ${url}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonClass("primary", "sm")}
                        >
                          {i.whatsapp}
                        </a>
                        <Button variant="secondary" size="sm" onClick={() => copy(inv.id, url)}>
                          <span aria-live="polite">{copied === inv.id ? i.copied : i.copy}</span>
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {inv.revoked ? null : asking ? (
                    <div role="alertdialog" aria-label={asking === "revoke" ? i.revokeConfirm : i.regenerateConfirm} className="flex flex-wrap items-center gap-2">
                      <p className="w-full text-sm font-medium">{asking === "revoke" ? i.revokeConfirm : i.regenerateConfirm}</p>
                      <Button
                        variant={asking === "revoke" ? "destructive" : "primary"}
                        size="sm"
                        disabled={pending}
                        onClick={() => (asking === "revoke" ? revoke(inv.id) : regenerate(inv.id))}
                      >
                        {t.common.confirm}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setConfirming(null)}>
                        {t.common.keep}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" disabled={pending} onClick={() => setConfirming({ id: inv.id, what: "regenerate" })}>
                        {link ? i.regenerate : i.regenerateToSend}
                        <span className="sr-only">: {inv.label}</span>
                      </Button>
                      {inv.kind === "open" ? null : (
                        <Button variant="dangerText" size="sm" disabled={pending} onClick={() => setConfirming({ id: inv.id, what: "revoke" })}>
                          {i.revoke}
                          <span className="sr-only">: {inv.label}</span>
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </FormSection>
    </div>
  );
}
