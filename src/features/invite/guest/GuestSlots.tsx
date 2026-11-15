"use client";

import { firstName } from "../lib/format";
import { getMessages } from "../messages";
import { BlockView } from "../blocks/Blocks";
import { Icon } from "../Icon";
import { guestBlock, useInvite } from "./GuestContext";

// The place of one guest-only block in the host's order. The shell knows only
// the id; the content arrives with /me.
export function GuestSlot({ id, first }: { id: string; first: boolean }) {
  const { status, me, expectGuest, event, locale, titleFields, refresh } = useInvite();
  const t = getMessages(locale);

  if (status === "ready") {
    const block = guestBlock(me, id);
    return block ? <BlockView block={block} ctx={{ event, locale, titleFields, extraBlocks: me?.guestBlocks }} /> : null;
  }
  if (status === "loading" && expectGuest) {
    return (
      <div className="inv-block inv-skeleton" aria-hidden="true">
        <span className="inv-skeleton__line inv-skeleton__line--title" />
        <span className="inv-skeleton__line" />
        <span className="inv-skeleton__line inv-skeleton__line--short" />
      </div>
    );
  }
  if (!first) return null;
  if (status === "error") {
    return (
      <div className="inv-block inv-locked" role="status">
        <p className="inv-text">{t.common.error}</p>
        <button type="button" className="inv-btn" onClick={refresh}>
          {t.common.retry}
        </button>
      </div>
    );
  }
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

// The greeting on the opening. The line keeps its height while empty, so the
// name arriving does not move anything.
export function GuestGreeting() {
  const { me, locale } = useInvite();
  const t = getMessages(locale);
  const name = me ? (me.invitation.kind === "personal" ? me.invitation.label : me.player ? firstName(me.player.name) : "") : "";
  return (
    <p className="inv-greeting" data-filled={name ? "true" : "false"} aria-live="polite" data-testid="greeting">
      {name ? t.hero.greeting(name) : " "}
    </p>
  );
}
