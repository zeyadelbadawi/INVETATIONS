"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { choiceClass, Input, Select, Textarea } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { parseGuestLines } from "../lib/bulk";
import type { InvitationRowInput } from "../lib/invitations";
import { latinDigits, normalisePhone, plural } from "../lib/text";
import { hostMessages } from "../messages";

type Kind = "personal" | "group";
export type TeamOption = { id: string; name: string };

type Props = {
  lang: Locale;
  teams: TeamOption[];
  personalLinks: boolean;
  pending: boolean;
  // Resolves to true when the rows were added, so the form can clear itself.
  onAdd: (rows: InvitationRowInput[]) => Promise<boolean>;
};

function KindPicker({ lang, value, onChange, personalLinks, name }: { lang: Locale; value: Kind; onChange: (kind: Kind) => void; personalLinks: boolean; name: string }) {
  const t = hostMessages(lang).invitations;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{t.kind}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["personal", "group"] as const).map((kind) => {
          const locked = kind === "personal" && !personalLinks;
          return (
            <label
              key={kind}
              className={choiceClass}
            >
              <input
                type="radio"
                name={name}
                className="mt-0.5 size-5 shrink-0 accent-fg"
                checked={value === kind}
                disabled={locked}
                onChange={() => onChange(kind)}
              />
              <span>
                <span className="block font-medium">{t.kinds[kind]}</span>
                <span className="block text-sm text-muted">{locked ? t.personalLocked : t.kindHints[kind]}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function AddInvitationForm({ lang, teams, personalLinks, pending, onAdd }: Props) {
  const t = hostMessages(lang);
  const i = t.invitations;
  const [kind, setKind] = useState<Kind>(personalLinks ? "personal" : "group");
  const [label, setLabel] = useState("");
  const [size, setSize] = useState(personalLinks ? "2" : "10");
  const [phone, setPhone] = useState("");
  const [side, setSide] = useState("");

  const max = kind === "personal" ? 50 : 2000;
  const sizeNumber = Number(latinDigits(size));
  const sizeBad = !Number.isInteger(sizeNumber) || sizeNumber < 1 || sizeNumber > max;
  const phoneBad = phone.trim() !== "" && normalisePhone(phone) === null;
  const ready = label.trim() !== "" && !sizeBad && !phoneBad;
  // Said next to the button, so a greyed-out button is never a mystery.
  const why = label.trim() === "" ? i.needLabel : sizeBad ? i.needSize : phoneBad ? i.needPhone : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;
    const added = await onAdd([{ label, kind, size: sizeNumber, phone: phone.trim() === "" ? null : phone, sideTeamId: side || null }]);
    if (added) {
      setLabel("");
      setPhone("");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
        <KindPicker lang={lang} value={kind} onChange={setKind} personalLinks={personalLinks} name="add-kind" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={i.label} htmlFor="inv-label">
            <Input id="inv-label" value={label} maxLength={120} required placeholder={i.labelPlaceholder} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label={kind === "personal" ? i.pax : i.maxPlayers} htmlFor="inv-size" error={sizeBad ? t.editor.invalidNumber : null}>
            <Input
              id="inv-size"
              inputMode="numeric"
              dir="ltr"
              value={size}
              maxLength={4}
              aria-invalid={sizeBad}
              aria-describedby={sizeBad ? "inv-size-error" : undefined}
              onChange={(e) => setSize(e.target.value)}
            />
          </Field>
          <Field label={i.phone} htmlFor="inv-phone" hint={i.phoneHint} error={phoneBad ? t.editor.invalidPhone : null} badge={t.common.optional}>
            <Input
              id="inv-phone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              value={phone}
              maxLength={24}
              aria-invalid={phoneBad}
              aria-describedby={phoneBad ? "inv-phone-error" : "inv-phone-hint"}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          {teams.length > 0 ? (
            <Field label={i.side} htmlFor="inv-side" badge={t.common.optional}>
              <Select id="inv-side" value={side} onChange={(e) => setSide(e.target.value)}>
                <option value="">{i.sideNone}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" disabled={!ready || pending} aria-busy={pending} aria-describedby={why ? "inv-add-why" : undefined}>
            {i.addOne}
          </Button>
          {why ? (
            <p id="inv-add-why" className="text-sm text-muted">
              {why}
            </p>
          ) : null}
        </div>
    </form>
  );
}

export function BulkInvitationForm({ lang, personalLinks, pending, onAdd }: Omit<Props, "teams">) {
  const t = hostMessages(lang);
  const i = t.invitations;
  const [kind, setKind] = useState<Kind>(personalLinks ? "personal" : "group");
  const [text, setText] = useState("");
  // Parsed here, in the browser; the server validates every row again and applies the plan's limits.
  const parsed = parseGuestLines(text, kind === "personal" ? 50 : 2000);
  const tooMany = parsed.rows.length > 500;
  const ready = parsed.rows.length > 0 && parsed.badLines.length === 0 && !tooMany;
  const why = parsed.badLines.length > 0 ? i.bulkNeedFix : tooMany ? null : parsed.rows.length === 0 ? i.bulkNeedText : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;
    const added = await onAdd(parsed.rows.map((row) => ({ ...row, kind })));
    if (added) setText("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
        <KindPicker lang={lang} value={kind} onChange={setKind} personalLinks={personalLinks} name="bulk-kind" />
        <div>
          <label htmlFor="bulk-text" className="sr-only">
            {i.bulkTitle}
          </label>
          <Textarea
            id="bulk-text"
            rows={6}
            dir="auto"
            value={text}
            placeholder={i.bulkPlaceholder}
            aria-describedby="bulk-status"
            aria-invalid={parsed.badLines.length > 0 || tooMany}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div id="bulk-status" aria-live="polite" className="text-sm">
          {parsed.rows.length > 0 ? <p className="text-muted">{plural(lang, parsed.rows.length, i.bulkReady)}</p> : null}
          {parsed.badLines.length > 0 ? (
            <p className="text-danger">
              {plural(lang, parsed.badLines.length, i.bulkSkipped, {
                lines: parsed.badLines.slice(0, 8).join(lang === "ar" ? "، " : ", ") + (parsed.badLines.length > 8 ? "…" : ""),
              })}
            </p>
          ) : null}
          {tooMany ? <p className="text-danger">{i.bulkTooMany}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" variant="secondary" disabled={!ready || pending} aria-busy={pending} aria-describedby={why ? "bulk-why" : undefined}>
            {parsed.rows.length === 0 ? i.bulkAddNone : plural(lang, parsed.rows.length, i.bulkAdd)}
          </Button>
          {why ? (
            <p id="bulk-why" className="text-sm text-muted">
              {why}
            </p>
          ) : null}
        </div>
    </form>
  );
}
