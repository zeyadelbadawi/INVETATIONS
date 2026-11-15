"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Notice, SectionHeading } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { cancelEventAction, postponeEventAction, publishEventAction } from "../actions/events";
import { createOrderAction, submitReferenceAction } from "../actions/orders";
import type { ActionResult } from "../lib/errors";
import { fmt } from "../lib/text";
import { errorText, hostMessages } from "../messages";

export type PlanView = {
  id: string;
  name: string;
  priceEgp: number;
  maxGuests: number | null;
  features: ("personal_links" | "games" | "share_cards" | "voice" | "photos" | "reveal")[];
};

type Props = {
  lang: Locale;
  eventId: string;
  status: string;
  version: number;
  address: string;
  plans: PlanView[];
  paidPlanId: string | null;
  pending: { planId: string; amountEgp: number; references: string[] } | null;
  missing: string[];
};

export function PublishPanel({ lang, eventId, status, version, address, plans, paidPlanId, pending, missing }: Props) {
  const t = hostMessages(lang);
  const p = t.publish;
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [reference, setReference] = useState("");
  const [asking, setAsking] = useState<"postpone" | "cancel" | null>(null);
  const [busy, startTransition] = useTransition();

  const paidPlan = plans.find((plan) => plan.id === paidPlanId) ?? null;
  const canPublish = paidPlanId !== null && missing.length === 0 && (status === "draft" || status === "published");
  const referenceOk = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{3,63}$/.test(reference.trim());

  function act<T extends object>(action: () => Promise<ActionResult<T>>, done?: (result: { ok: true } & T) => string | null) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage({ tone: "danger", text: errorText(t, result.error, result.detail) });
        return;
      }
      const text = done?.(result) ?? null;
      if (text) setMessage({ tone: "success", text });
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div aria-live="polite">{message ? <Notice tone={message.tone}>{message.text}</Notice> : null}</div>

      <Card>
        <SectionHeading title={p.stepPlan} />
        {paidPlan ? (
          <Notice tone="success">
            {p.paid} {fmt(p.planChosen, { plan: paidPlan.name })}
          </Notice>
        ) : paidPlanId ? (
          <Notice tone="success">{p.paid}</Notice>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => {
              const selected = pending?.planId === plan.id;
              return (
                <li key={plan.id} className={`flex flex-col gap-3 rounded-2xl border p-4 ${selected ? "border-secondary ring-2 ring-secondary/30" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    {selected ? <Badge tone="success">{p.chosen}</Badge> : null}
                  </div>
                  <p className="text-2xl font-bold">{fmt(p.price, { amount: plan.priceEgp })}</p>
                  <ul className="flex flex-1 list-disc flex-col gap-1 ps-5 text-sm text-muted">
                    <li>{plan.maxGuests === null ? p.features.guestsUnlimited : fmt(p.features.guests, { n: plan.maxGuests })}</li>
                    <li>{p.features.groupLinks}</li>
                    {plan.features.map((feature) => (
                      <li key={feature}>{p.features[feature]}</li>
                    ))}
                  </ul>
                  <Button
                    variant={selected ? "secondary" : "primary"}
                    disabled={busy || selected}
                    onClick={() => act(() => createOrderAction(eventId, plan.id))}
                  >
                    {fmt(p.choose, { plan: plan.name })}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {pending && !paidPlanId ? (
        <Card>
          <SectionHeading title={p.stepPay} />
          <h3 className="text-xl font-semibold">{fmt(p.payTitle, { amount: pending.amountEgp })}</h3>
          <p className="mt-2">{p.payInstructions}</p>
          <p className="mt-2 text-sm text-muted">{p.payNote}</p>
          {pending.references.length > 0 ? (
            <Notice tone="success" className="mt-4">
              {/* Isolation marks keep the Latin reference readable inside Arabic text. */}
              {fmt(p.referenceSent, { reference: `⁨${pending.references[pending.references.length - 1]}⁩` })}
            </Notice>
          ) : null}
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!referenceOk || busy) return;
              act(
                () => submitReferenceAction(eventId, reference.trim()),
                () => {
                  setReference("");
                  return null;
                },
              );
            }}
          >
            <Field label={p.reference} htmlFor="transfer-reference" hint={p.referenceHint}>
              <Input
                id="transfer-reference"
                dir="ltr"
                value={reference}
                maxLength={64}
                autoComplete="off"
                aria-describedby="transfer-reference-hint"
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <div>
              <Button type="submit" disabled={!referenceOk || busy} aria-busy={busy}>
                {p.submitReference}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <SectionHeading title={p.stepPublish} />
        <h3 className="text-sm font-medium text-muted">{p.checklistTitle}</h3>
        <ul className="mt-2 flex flex-col gap-1">
          <li className={missing.length > 0 ? "text-danger" : ""}>
            {missing.length > 0 ? fmt(p.missing, { fields: missing.join(lang === "ar" ? "، " : ", ") }) : p.ready}
          </li>
          {paidPlanId ? null : <li className="text-danger">{p.needPlan}</li>}
          {status === "postponed" ? <li>{p.postponedNote}</li> : null}
          {status === "cancelled" ? <li>{p.cancelledNote}</li> : null}
          {status === "ended" ? <li>{p.endedNote}</li> : null}
        </ul>
        <div className="mt-4">
          <Button
            disabled={!canPublish || busy}
            aria-busy={busy}
            onClick={() => act(() => publishEventAction(eventId), (result) => fmt(p.published, { n: result.version }))}
          >
            {busy ? p.publishing : version > 0 ? p.republish : p.publish}
          </Button>
        </div>
        {version > 0 ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm font-medium text-muted">{p.liveAt}</p>
            <p dir="ltr" className="mt-1 break-all font-medium text-start">
              {address}
            </p>
            <p className="mt-1 text-sm text-muted">{p.liveNote}</p>
          </div>
        ) : null}
      </Card>

      {status === "published" || status === "postponed" ? (
        <Card>
          <SectionHeading title={p.lifecycleTitle} />
          {asking ? (
            <div role="alertdialog" aria-label={asking === "postpone" ? p.postpone : p.cancelEvent} className="flex flex-wrap items-center gap-2">
              <p className="w-full">{asking === "postpone" ? p.postponeConfirm : p.cancelConfirm}</p>
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() => {
                  const which = asking;
                  setAsking(null);
                  act(() => (which === "postpone" ? postponeEventAction(eventId) : cancelEventAction(eventId)));
                }}
              >
                {t.common.confirm}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setAsking(null)}>
                {t.common.keep}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {status === "published" ? (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => setAsking("postpone")}>
                  {p.postpone}
                </Button>
              ) : null}
              <Button variant="danger" size="sm" disabled={busy} onClick={() => setAsking("cancel")}>
                {p.cancelEvent}
              </Button>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
