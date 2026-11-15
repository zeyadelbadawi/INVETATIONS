"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { latinDigits } from "@/features/host/lib/text";
import { errorText, hostMessages } from "@/features/host/messages";
import { approveOrderAction } from "../actions";
import { adminMessages } from "../messages";

export function ApproveForm({ lang, orderId }: { lang: Locale; orderId: string }) {
  const t = adminMessages(lang);
  const host = hostMessages(lang);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const amountNumber = Number(latinDigits(amount));
  const ready = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{3,63}$/.test(reference.trim()) && amount.trim() !== "" && Number.isInteger(amountNumber) && amountNumber >= 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await approveOrderAction(orderId, reference.trim(), amountNumber);
      setMessage(result.ok ? { tone: "success", text: t.approved } : { tone: "danger", text: errorText(host, result.error, result.detail) });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.reference} htmlFor={`ref-${orderId}`}>
          <Input id={`ref-${orderId}`} dir="ltr" value={reference} maxLength={64} autoComplete="off" onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label={t.amountSeen} htmlFor={`amount-${orderId}`} hint={t.amountHint}>
          <Input
            id={`amount-${orderId}`}
            dir="ltr"
            inputMode="numeric"
            value={amount}
            maxLength={8}
            autoComplete="off"
            aria-describedby={`amount-${orderId}-hint`}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!ready || pending} aria-busy={pending}>
          {pending ? t.approving : t.approve}
        </Button>
        <div aria-live="polite" className="min-w-0 flex-1">
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        </div>
      </div>
    </form>
  );
}
