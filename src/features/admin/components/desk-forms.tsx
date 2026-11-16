"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import {
  createClaimAction,
  createEventOnBehalfAction,
  createGrantAction,
  markOrderUnpaidAction,
  revokeGrantAction,
  takedownAction,
} from "../actions";
import { hostMessages } from "@/features/host/messages";
import { adminMessages } from "../messages";
import { useAdminAction, type Feedback } from "./use-admin-action";

// Kept in step with GRANTABLE_CAPABILITIES (lib/grants.ts); the server refuses anything else.
const CAPABILITIES = ["view", "edit_content", "manage_invitations", "manage_play", "moderate"] as const;

function Say({ feedback }: { feedback: Feedback }) {
  return <div aria-live="polite">{feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}</div>;
}

function OnceLink({ lang, url }: { lang: Locale; url: string }) {
  const t = adminMessages(lang).claims;
  const [copied, setCopied] = useState(false);
  return (
    <Notice tone="success">
      <p className="mb-2">{t.linkOnce}</p>
      <code dir="ltr" className="block break-all rounded-lg bg-surface px-3 py-2 font-mono text-sm text-fg">
        {url}
      </code>
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() => {
          navigator.clipboard?.writeText(url).then(
            () => setCopied(true),
            () => undefined,
          );
        }}
      >
        {copied ? t.copied : t.copy}
      </Button>
    </Notice>
  );
}

export type StaffOption = { id: string; label: string };

export function GrantForm({ lang, eventId, staff }: { lang: Locale; eventId: string; staff: StaffOption[] }) {
  const t = adminMessages(lang).grants;
  const { act, pending, feedback } = useAdminAction(lang);
  const [staffId, setStaffId] = useState("");
  const [caps, setCaps] = useState<string[]>(["view", "edit_content"]);
  const [days, setDays] = useState("14");
  const dayCount = Number(days);
  const ready = staffId !== "" && caps.length > 0 && Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 30;

  if (staff.length === 0) return <p className="text-sm text-muted">{t.noStaff}</p>;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || pending) return;
        act(() => createGrantAction(eventId, staffId, caps, dayCount), () => t.created);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.staff} htmlFor="grant-staff">
          <Select id="grant-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">{t.choose}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.days} htmlFor="grant-days">
          <Input id="grant-days" dir="ltr" inputMode="numeric" maxLength={2} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{t.capabilities}</legend>
        <div className="grid sm:grid-cols-2">
          {CAPABILITIES.map((cap) => (
            <Checkbox
              key={cap}
              label={t.caps[cap] ?? cap}
              checked={cap === "view" || caps.includes(cap)}
              disabled={cap === "view"}
              onChange={(e) => setCaps((prev) => (e.target.checked ? [...new Set([...prev, cap])] : prev.filter((c) => c !== cap)))}
            />
          ))}
        </div>
      </fieldset>
      <div>
        <Button type="submit" disabled={!ready || pending} aria-busy={pending}>
          {pending ? t.creating : t.create}
        </Button>
      </div>
      <Say feedback={feedback} />
    </form>
  );
}

export function RevokeGrantButton({ lang, grantId }: { lang: Locale; grantId: string }) {
  const t = adminMessages(lang).grants;
  const { act, pending, feedback } = useAdminAction(lang);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button variant="danger" size="sm" disabled={pending} onClick={() => act(() => revokeGrantAction(grantId), () => t.revoked)}>
          {t.revoke}
        </Button>
      </div>
      <Say feedback={feedback} />
    </div>
  );
}

export function ClaimLinkForm({ lang, eventId }: { lang: Locale; eventId: string }) {
  const t = adminMessages(lang).claims;
  const { act, pending, feedback } = useAdminAction(lang);
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !email.includes("@")) return;
        setUrl(null);
        act(
          () => createClaimAction(eventId, email.trim(), lang),
          (result) => {
            setUrl(result.claimUrl);
            return null;
          },
        );
      }}
    >
      <Field label={t.email} htmlFor="claim-email">
        <Input id="claim-email" type="email" dir="ltr" autoComplete="off" maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <div>
        <Button type="submit" disabled={pending || !email.includes("@")} aria-busy={pending}>
          {t.create}
        </Button>
      </div>
      <Say feedback={feedback} />
      {url ? <OnceLink lang={lang} url={url} /> : null}
    </form>
  );
}

export type TemplateOption = { id: string; kind: "wedding" | "gender_reveal" | "corporate"; name: string };

export function OnBehalfForm({ lang, templates, kinds }: { lang: Locale; templates: TemplateOption[]; kinds: Record<string, string> }) {
  const t = adminMessages(lang).events;
  const { act, pending, feedback } = useAdminAction(lang);
  const [kind, setKind] = useState<TemplateOption["kind"]>("wedding");
  const options = templates.filter((tpl) => tpl.kind === kind);
  const [templateId, setTemplateId] = useState(options[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [locale, setLocale] = useState<Locale>(lang);
  const [created, setCreated] = useState<{ eventId: string; claimUrl: string } | null>(null);
  const ready = templateId !== "" && name.trim().length > 0 && email.includes("@");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || pending) return;
        setCreated(null);
        act(
          () => createEventOnBehalfAction({ kind, templateId, name, locale, email: email.trim(), lang }),
          (result) => {
            setCreated({ eventId: result.eventId, claimUrl: result.claimUrl });
            return t.created2;
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.customerEmail} htmlFor="obo-email">
          <Input id="obo-email" type="email" dir="ltr" autoComplete="off" maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t.eventName} htmlFor="obo-name">
          <Input id="obo-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.kind} htmlFor="obo-kind">
          <Select
            id="obo-kind"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as TemplateOption["kind"];
              setKind(next);
              setTemplateId(templates.find((tpl) => tpl.kind === next)?.id ?? "");
            }}
          >
            {(["wedding", "gender_reveal", "corporate"] as const).map((k) => (
              <option key={k} value={k}>
                {kinds[k] ?? k}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.template} htmlFor="obo-template">
          <Select id="obo-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {options.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.language} htmlFor="obo-locale">
          <Select id="obo-locale" value={locale} onChange={(e) => setLocale(e.target.value === "en" ? "en" : "ar")}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </Select>
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={!ready || pending} aria-busy={pending}>
          {pending ? t.creating : t.create}
        </Button>
      </div>
      <Say feedback={feedback} />
      {created ? (
        <>
          <OnceLink lang={lang} url={created.claimUrl} />
          <Link href={`/${lang}/admin/events/${created.eventId}` as Route} className="inline-flex min-h-11 items-center font-medium text-secondary">
            {t.openEvent}
          </Link>
        </>
      ) : null}
    </form>
  );
}

export function UnpaidButtons({ lang, orderId }: { lang: Locale; orderId: string }) {
  const t = adminMessages(lang).events;
  const keep = hostMessages(lang).common.keep;
  const { act, pending, feedback } = useAdminAction(lang);
  const [asking, setAsking] = useState<"refunded" | "disputed" | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {asking ? (
        <div role="alertdialog" aria-label={asking === "refunded" ? t.refund : t.dispute} className="flex flex-wrap items-center gap-2">
          <p className="w-full text-sm">{t.refundConfirm}</p>
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() => {
              const status = asking;
              setAsking(null);
              act(() => markOrderUnpaidAction(orderId, status), () => t.refunded);
            }}
          >
            {asking === "refunded" ? t.refund : t.dispute}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAsking(null)}>
            {keep}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => setAsking("refunded")}>
            {t.refund}
          </Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => setAsking("disputed")}>
            {t.dispute}
          </Button>
        </div>
      )}
      <Say feedback={feedback} />
    </div>
  );
}

export function TakedownButton({ lang, postId }: { lang: Locale; postId: string }) {
  const t = adminMessages(lang).reports;
  const { act, pending, feedback } = useAdminAction(lang);
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <Notice tone="success">{t.takenDown}</Notice>;
  return (
    <div className="flex flex-col gap-2">
      {asking ? (
        <div role="alertdialog" aria-label={t.takedown} className="flex flex-wrap items-center gap-2">
          <p className="w-full text-sm">{t.confirm}</p>
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() => {
              setAsking(false);
              act(
                () => takedownAction(postId),
                () => {
                  setDone(true);
                  return null;
                },
              );
            }}
          >
            {t.takedown}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAsking(false)}>
            {hostMessages(lang).common.keep}
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="danger" size="sm" disabled={pending} onClick={() => setAsking(true)}>
            {t.takedown}
          </Button>
        </div>
      )}
      <Say feedback={feedback} />
    </div>
  );
}
