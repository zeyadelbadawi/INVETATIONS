"use client";

import { useId, useState } from "react";
import { firstName } from "../lib/format";
import { getMessages } from "../messages";
import { BlockView } from "../blocks/Blocks";
import { Icon } from "../Icon";
import { guestBlock, useInvite } from "./GuestContext";

function Skeleton() {
  return (
    <div className="inv-block inv-skeleton" aria-hidden="true">
      <span className="inv-skeleton__line inv-skeleton__line--title" />
      <span className="inv-skeleton__line" />
      <span className="inv-skeleton__line inv-skeleton__line--short" />
    </div>
  );
}

function RetryCard() {
  const { locale, refresh } = useInvite();
  const t = getMessages(locale);
  return (
    <div className="inv-block inv-locked" role="status">
      <p className="inv-text">{t.common.error}</p>
      <button type="button" className="inv-btn" onClick={refresh}>
        {t.common.retry}
      </button>
    </div>
  );
}

// In place of the "open your link" card on a passcode event: visitors with only
// the public link unlock the guest-only details here (security V3).
export function PasscodeForm() {
  const { locale, unlock } = useInvite();
  const t = getMessages(locale);
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const passcode = value.trim();
    if (passcode === "") return setError(t.passcode.empty);
    setBusy(true);
    setError(null);
    const result = await unlock(passcode);
    setBusy(false);
    if (result === "ok") return;
    setLocked(result === "locked");
    setError(result === "wrong" ? t.passcode.wrong : result === "locked" ? t.passcode.locked : result === "slow" ? t.passcode.slow : t.common.error);
  }

  return (
    <aside className="inv-block inv-locked inv-passcode" data-testid="passcode-card" aria-labelledby={`${inputId}-title`}>
      <span className="inv-locked__icon" aria-hidden="true">
        <Icon name="lock" size={20} />
      </span>
      <h2 id={`${inputId}-title`} className="inv-h3">
        {t.passcode.title}
      </h2>
      <p className="inv-text">{t.passcode.body}</p>
      <form className="inv-form" onSubmit={submit} noValidate>
        <label className="inv-field" htmlFor={inputId}>
          <span className="inv-field__label">{t.passcode.label}</span>
          <input
            id={inputId}
            className="inv-input"
            name="passcode"
            type="password"
            dir="ltr"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              if (!locked) setError(null);
            }}
          />
        </label>
        <p id={errorId} className="inv-error" role="alert" data-testid="passcode-error">
          {error ?? ""}
        </p>
        <div className="inv-actions">
          <button type="submit" className="inv-btn inv-btn--solid" disabled={busy} aria-busy={busy}>
            {busy ? t.passcode.checking : t.passcode.submit}
          </button>
        </div>
      </form>
    </aside>
  );
}

// The place of one guest-only block in the host's order. The shell knows only
// the id; the content arrives with /me (or /details after the passcode).
export function GuestSlot({ id, first }: { id: string; first: boolean }) {
  const { status, details, expectGuest, event, locale, titleFields } = useInvite();
  const t = getMessages(locale);

  if (details) {
    const block = guestBlock(details, id);
    return block ? <BlockView block={block} ctx={{ event, locale, titleFields, extraBlocks: details.guestBlocks, media: details.media }} /> : null;
  }
  if (status === "ready") return null;
  if (status === "loading" && expectGuest) return <Skeleton />;
  if (!first) return null;
  if (status === "error") return <RetryCard />;
  if (event.hasPasscode && status === "anon") return <PasscodeForm />;
  return (
    <aside className="inv-block inv-locked" data-testid="locked-card">
      <span className="inv-locked__icon" aria-hidden="true">
        <Icon name="lock" size={20} />
      </span>
      <h2 className="inv-h3">{t.locked.title}</h2>
      <p className="inv-text">{t.locked.body}</p>
    </aside>
  );
}

// A passcode event's whole body: the cached shell carries no blocks at all, so
// they come from the guest API once a session or the passcode unlocks them.
export function GatedBody() {
  const { status, details, expectGuest, event, locale, titleFields } = useInvite();
  const content = details?.content;
  if (content) {
    const byId = new Map(content.blocks.map((block) => [block.id, block]));
    const ctx = { event, locale, titleFields, extraBlocks: content.blocks, media: details.media };
    return (
      <>
        {content.order.map((id) => {
          const block = byId.get(id);
          return block ? <BlockView key={id} block={block} ctx={ctx} /> : null;
        })}
      </>
    );
  }
  if (status === "ready" || details) return null;
  if (status === "loading") return expectGuest ? <Skeleton /> : null;
  if (status === "error") return <RetryCard />;
  return <PasscodeForm />;
}

// The greeting on the opening. The line keeps its height while empty, so the
// name arriving does not move anything.
export function GuestGreeting() {
  const { me, locale } = useInvite();
  const t = getMessages(locale);
  const name = me ? (me.invitation.kind === "personal" ? me.invitation.label : me.player ? firstName(me.player.name) : "") : "";
  return (
    <p className="inv-greeting" data-filled={name ? "true" : "false"} aria-live="polite" data-testid="greeting">
      {name ? t.hero.greeting(name) : " "}
    </p>
  );
}
