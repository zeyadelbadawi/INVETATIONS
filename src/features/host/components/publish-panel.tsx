"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge, FormSection, Notice } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { cancelEventAction, postponeEventAction, publishEventAction } from "../actions/events";
import { cardCheckoutAvailableAction, createOrderAction, orderStatusAction, startCardCheckoutAction, submitReferenceAction } from "../actions/orders";
import type { ActionResult } from "../lib/errors";
import { fmt } from "../lib/text";
import { errorText, hostMessages } from "../messages";
import { paymentMessages } from "../messages-payments";

const POLL_MS = 3000;
const POLL_TRIES = 40;

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
  const pm = paymentMessages(lang);
  const router = useRouter();
  const [cardAvailable, setCardAvailable] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [confirming, setConfirming] = useState<"waiting" | "late" | "done" | null>(null);
  const hasPending = pending !== null && paidPlanId === null;

  // The card button exists only while the gateway flag is on (server-side).
  useEffect(() => {
    if (!hasPending) return;
    let live = true;
    cardCheckoutAvailableAction().then(
      (available) => live && setCardAvailable(available),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [hasPending]);

  // Back from the gateway: the return address grants nothing. Only the
  // webhook settles; this just waits for it and then reloads the page data.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") !== "card") return;
    params.delete("payment");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    if (paidPlanId !== null) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    queueMicrotask(() => live && setConfirming("waiting"));
    const tick = async () => {
      tries += 1;
      const result = await orderStatusAction(eventId).catch(() => null);
      if (!live) return;
      if (result?.ok && result.paid) {
        setConfirming("done");
        router.refresh();
        return;
      }
      if (tries >= POLL_TRIES) {
        setConfirming("late");
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
    // Runs once per visit; paidPlanId only decides whether to start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  function payByCard() {
    if (busy || redirecting) return;
    setMessage(null);
    startTransition(async () => {
      const result = await startCardCheckoutAction(eventId, lang);
      if (!result.ok) {
        setMessage({ tone: "danger", text: pm.errors[result.error] });
        return;
      }
      setRedirecting(true);
      window.location.assign(result.url);
    });
  }

  const paidPlan = plans.find((plan) => plan.id === paidPlanId) ?? null;
  const canPublish = paidPlanId !== null && missing.length === 0 && (status === "draft" || status === "published");
  const [copied, setCopied] = useState(false);
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage({ tone: "danger", text: t.errors.unknown });
    }
  }
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

  const check = (ok: boolean) => (
    <span aria-hidden="true" className={`mt-0.5 flex size-5 shrink-0 items-center justify-center ${ok ? "text-accent-ink" : "text-danger"}`}>
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={ok ? "m3.5 8.5 3 3 6-7" : "M4.5 4.5l7 7M11.5 4.5l-7 7"} />
      </svg>
    </span>
  );

  return (
    <div className="flex w-full max-w-5xl flex-col gap-10">
      <div aria-live="polite" className="flex flex-col gap-3 empty:-mb-10">
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        {confirming === "waiting" ? <Notice>{pm.confirming}</Notice> : null}
        {confirming === "late" ? <Notice>{pm.stillWaiting}</Notice> : null}
        {confirming === "done" || (confirming && paidPlanId) ? <Notice tone="success">{pm.confirmed}</Notice> : null}
      </div>

      <FormSection
        id="publish-plan"
        title={p.stepPlan}
        aside={paidPlanId ? <Badge tone="success">{p.paid}</Badge> : null}
        bare={!paidPlanId}
      >
        {paidPlan ? (
          <p className="flex items-start gap-2 font-medium">
            {check(true)}
            {fmt(p.planChosen, { plan: paidPlan.name })}
          </p>
        ) : paidPlanId ? (
          <p className="flex items-start gap-2 font-medium">
            {check(true)}
            {p.paid}
          </p>
        ) : (
          <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
            {plans.map((plan) => {
              const selected = pending?.planId === plan.id;
              return (
                <li key={plan.id} className={`flex flex-col gap-4 p-5 sm:p-6 sm:[&+&]:border-s sm:[&+&]:border-line ${selected ? "bg-primary/[0.08]" : ""}`}>
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {selected ? <Badge tone="success">{p.chosen}</Badge> : null}
                    </div>
                    <p className="mt-1 font-display text-3xl font-bold tabular-nums">{fmt(p.price, { amount: plan.priceEgp })}</p>
                  </div>
                  <ul className="flex flex-1 flex-col gap-1.5 text-sm">
                    <li className="flex gap-2">
                      {check(true)}
                      {plan.maxGuests === null ? p.features.guestsUnlimited : fmt(p.features.guests, { n: plan.maxGuests })}
                    </li>
                    <li className="flex gap-2">
                      {check(true)}
                      {p.features.groupLinks}
                    </li>
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        {check(true)}
                        {p.features[feature]}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="secondary"
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
      </FormSection>

      {pending && !paidPlanId ? (
        <FormSection id="publish-pay" title={p.stepPay}>
          {cardAvailable ? (
            <div className="mb-6 flex flex-col gap-3 border-b border-line pb-6">
              <h3 className="text-lg font-semibold">{pm.cardTitle}</h3>
              <p className="text-sm text-muted">{pm.cardLead}</p>
              <div>
                <Button disabled={busy || redirecting} aria-busy={redirecting} onClick={payByCard}>
                  {redirecting ? pm.cardRedirecting : fmt(pm.cardButton, { amount: pending.amountEgp })}
                </Button>
              </div>
              <p className="text-sm font-medium text-muted">{pm.orTransfer}</p>
            </div>
          ) : null}
          <h3 className="text-lg font-semibold tabular-nums">{fmt(p.payTitle, { amount: pending.amountEgp })}</h3>
          <p className="mt-2 max-w-prose">{p.payInstructions}</p>
          <p className="mt-2 max-w-prose text-sm text-muted">{p.payNote}</p>
          {pending.references.length > 0 ? (
            <Notice tone="success" className="mt-4">
              {/* Isolation marks keep the Latin reference readable inside Arabic text. */}
              {fmt(p.referenceSent, { reference: `⁨${pending.references[pending.references.length - 1]}⁩` })}
            </Notice>
          ) : null}
          <form
            className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
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
            <div className="min-w-0 flex-1 sm:max-w-sm">
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
            </div>
            <div className="sm:mb-7">
              <Button type="submit" disabled={!referenceOk || busy} aria-busy={busy}>
                {p.submitReference}
              </Button>
            </div>
          </form>
        </FormSection>
      ) : null}

      <FormSection id="publish-go" title={p.stepPublish}>
        <h3 className="text-sm font-medium text-muted">{p.checklistTitle}</h3>
        <ul className="mt-2 flex flex-col gap-2">
          <li className="flex items-start gap-2">
            {check(missing.length === 0)}
            <span className={missing.length > 0 ? "text-danger" : ""}>
              {missing.length > 0 ? fmt(p.missing, { fields: missing.join(lang === "ar" ? "، " : ", ") }) : p.ready}
            </span>
          </li>
          <li className="flex items-start gap-2">
            {check(paidPlanId !== null)}
            <span className={paidPlanId ? "" : "text-danger"}>{paidPlanId ? p.paid : p.needPlan}</span>
          </li>
          {status === "postponed" ? <li className="ps-7">{p.postponedNote}</li> : null}
          {status === "cancelled" ? <li className="ps-7">{p.cancelledNote}</li> : null}
          {status === "ended" ? <li className="ps-7">{p.endedNote}</li> : null}
        </ul>
        <div className="mt-6">
          <Button
            size="lg"
            disabled={!canPublish || busy}
            aria-busy={busy}
            onClick={() => act(() => publishEventAction(eventId), (result) => fmt(p.published, { n: result.version }))}
          >
            {busy ? p.publishing : version > 0 ? p.republish : p.publish}
          </Button>
        </div>
        {version > 0 ? (
          <div className="mt-6 border-t border-line pt-5">
            <p className="text-sm font-medium text-muted">{p.liveAt}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <a
                href={address}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="break-all font-medium text-accent-ink underline underline-offset-4 hover:text-fg"
              >
                {address}
              </a>
              <Button variant="secondary" size="sm" onClick={copyAddress}>
                <span aria-live="polite">{copied ? t.invitations.copied : t.invitations.copy}</span>
              </Button>
            </div>
            <p className="mt-2 text-sm text-muted">{p.liveNote}</p>
          </div>
        ) : null}
      </FormSection>

      {status === "published" || status === "postponed" ? (
        <FormSection id="publish-lifecycle" title={p.lifecycleTitle}>
          {asking ? (
            <div role="alertdialog" aria-label={asking === "postpone" ? p.postpone : p.cancelEvent} className="flex flex-wrap items-center gap-2">
              <p className="w-full font-medium">{asking === "postpone" ? p.postponeConfirm : p.cancelConfirm}</p>
              <Button
                variant={asking === "cancel" ? "destructive" : "primary"}
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
        </FormSection>
      ) : null}
    </div>
  );
}
