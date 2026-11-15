"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { abortReveal, beginReveal, createKeeperLink } from "@/features/control/actions";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Notice, SectionHeading } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { formatCountdown, leadUntil } from "../../lib/play";
import type { LiveView, RevealStatus } from "../../lib/play-data";
import { fmt } from "../../lib/text";
import { hostMessages } from "../../messages";
import { ActNotice } from "./act-notice";
import { useAct } from "./use-act";

type Props = {
  lang: Locale;
  eventId: string;
  slug: string;
  origin: string;
  timezone: string;
  entitled: boolean;
  published: boolean;
  isOwner: boolean;
  status: RevealStatus | null;
  live: LiveView;
};

const LEADS = [1, 2, 5, 10] as const;

export function RevealSection({ lang, eventId, slug, origin, timezone, entitled, published, isOwner, status, live }: Props) {
  const t = hostMessages(lang);
  const r = t.play.reveal;
  const router = useRouter();
  const { act, pending, message, setMessage } = useAct(lang);
  // The keeper code exists only here, once: the server keeps a hash.
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState<"reissue" | "start" | "cancel" | null>(null);
  const [lead, setLead] = useState<number | "time">(1);
  const [time, setTime] = useState("");
  // Null until the page is running in the browser, so server and browser render the same thing first.
  const [now, setNow] = useState<number | null>(null);
  const poked = useRef(0);

  const counting = live.phase === "countdown" && live.revealAt !== null;
  const target = counting ? Date.parse(live.revealAt!) : null;

  useEffect(() => {
    if (target === null) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      // At zero the database releases the answer the next time the public live
      // endpoint is read. Guests poll it constantly; this makes sure it also
      // happens when the host is the only one watching.
      if (current >= target && current - poked.current > 3000) {
        poked.current = current;
        fetch(`/api/live/${slug}`, { cache: "no-store" })
          .catch(() => undefined)
          .finally(() => router.refresh());
      }
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [target, slug, router]);

  if (!entitled || !published || !isOwner) {
    return (
      <Card>
        <SectionHeading title={r.title} />
        <Notice>{!entitled ? r.upgrade : !published ? r.notPublished : r.ownerOnly}</Notice>
      </Card>
    );
  }

  const sealed = status?.sealedAt != null;
  const started = live.phase !== "idle" || status?.revealAt != null || status?.revealedAt != null;
  const revealed = live.phase === "revealed";
  const link = code ? `${origin}/k#${code}` : null;
  const clock = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { timeStyle: "short", timeZone: timezone });

  function issue() {
    setAsking(null);
    act(
      () => createKeeperLink(eventId),
      (result) => {
        if ("error" in result) return { tone: "danger", text: r.errors[result.error] };
        setCode(result.code);
        setCopied(false);
        return null;
      },
    );
  }

  function start() {
    setAsking(null);
    const seconds = lead === "time" ? leadUntil(time, new Date()) : lead * 60;
    if (seconds === null) return setMessage({ tone: "danger", text: r.timeTooSoon });
    act(
      () => beginReveal(eventId, seconds),
      (result) => ("error" in result ? { tone: "danger", text: r.errors[result.error] } : null),
    );
  }

  function cancel() {
    setAsking(null);
    act(
      () => abortReveal(eventId),
      (ok) => (ok ? null : { tone: "danger", text: r.tooLate }),
    );
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setMessage({ tone: "danger", text: t.play.failed });
    }
  }

  if (revealed) {
    return (
      <Card className="flex flex-col gap-3 text-center">
        <p className="text-sm font-medium text-muted">{r.revealedTitle}</p>
        {/* Public at this point: the same value every guest's page now shows. */}
        <p className="text-4xl font-bold text-primary">{(live.answer ?? []).map((a) => r.answers[a]).join(lang === "ar" ? " و" : " & ")}</p>
        <Notice>{r.settleReminder}</Notice>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ActNotice message={message} />

      <Card className="flex flex-col gap-3">
        <SectionHeading title={r.step1} lead={r.keeperLead} />
        <p className="font-medium" role="status">
          {!status?.exists
            ? r.noLink
            : sealed
              ? `${fmt(r.sealed, { time: clock.format(new Date(status.sealedAt!)) })}${status.sealCount > 1 ? ` (${fmt(r.sealChanges, { n: status.sealCount - 1 })})` : ""}`
              : r.notSealed}
        </p>
        {link ? (
          <div className="rounded-xl border border-highlight bg-highlight/15 p-3">
            <p className="mb-2 text-sm font-medium">{r.linkOnce}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${r.whatsappMessage} ${link}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass("primary", "sm")}
              >
                {r.whatsapp}
              </a>
              <Button variant="secondary" size="sm" onClick={copy}>
                <span aria-live="polite">{copied ? r.copied : r.copy}</span>
              </Button>
            </div>
          </div>
        ) : null}
        {asking === "reissue" ? (
          <div role="alertdialog" aria-label={r.reissue} className="flex flex-wrap items-center gap-2">
            <p className="w-full text-sm">{r.reissueConfirm}</p>
            <Button variant="danger" size="sm" disabled={pending} onClick={issue}>
              {t.common.confirm}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAsking(null)}>
              {t.common.keep}
            </Button>
          </div>
        ) : (
          <div>
            <Button
              variant={status?.exists ? "secondary" : "primary"}
              size="sm"
              disabled={pending || started}
              onClick={() => (status?.exists ? setAsking("reissue") : issue())}
            >
              {status?.exists ? r.reissue : r.createLink}
            </Button>
          </div>
        )}
      </Card>

      {counting ? (
        <Card className="flex flex-col items-center gap-3 text-center">
          <SectionHeading title={r.step3} />
          <p className="text-sm text-muted">{r.countdownTo}</p>
          <p role="timer" aria-live="off" dir="ltr" className="text-5xl font-bold tabular-nums">
            {now === null || target === null ? "··:··" : now >= target ? r.releasing : formatCountdown(target - now)}
          </p>
          {asking === "cancel" ? (
            <div role="alertdialog" aria-label={r.cancel} className="flex flex-wrap items-center justify-center gap-2">
              <p className="w-full text-sm">{r.cancelConfirm}</p>
              <Button variant="danger" size="sm" disabled={pending} onClick={cancel}>
                {t.common.confirm}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setAsking(null)}>
                {t.common.keep}
              </Button>
            </div>
          ) : (
            <Button variant="danger" size="sm" disabled={pending || (now !== null && target !== null && now >= target)} onClick={() => setAsking("cancel")}>
              {r.cancel}
            </Button>
          )}
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <SectionHeading title={r.step2} lead={sealed ? undefined : r.needSeal} />
          <fieldset disabled={!sealed} className="flex flex-col gap-3 disabled:opacity-60">
            <legend className="mb-2 text-sm font-medium">{r.leadLabel}</legend>
            <div className="flex flex-wrap gap-2">
              {LEADS.map((minutes) => (
                <label key={minutes} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 has-[:checked]:border-secondary">
                  <input type="radio" name="lead" className="size-5 accent-secondary" checked={lead === minutes} onChange={() => setLead(minutes)} />
                  {fmt(r.minutes, { n: minutes })}
                </label>
              ))}
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 has-[:checked]:border-secondary">
                <input type="radio" name="lead" className="size-5 accent-secondary" checked={lead === "time"} onChange={() => setLead("time")} />
                {r.atTime}
              </label>
            </div>
            {lead === "time" ? (
              <Field label={r.timeLabel} htmlFor="reveal-time">
                <Input id="reveal-time" type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
            ) : null}
          </fieldset>
          {asking === "start" ? (
            <div role="alertdialog" aria-label={r.start} className="flex flex-col gap-3 rounded-xl border border-danger/40 bg-danger/5 p-3">
              <p className="font-medium">{r.startConfirm}</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending} onClick={start}>
                  {t.common.confirm}
                </Button>
                <Button variant="secondary" onClick={() => setAsking(null)}>
                  {t.common.keep}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button disabled={pending || !sealed || (lead === "time" && time === "")} onClick={() => setAsking("start")}>
                {r.start}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
