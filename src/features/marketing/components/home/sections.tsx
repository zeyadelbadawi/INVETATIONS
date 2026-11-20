import Link from "next/link";
import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../../messages";
import { egp, pricing } from "../../pricing";
import { Scrub } from "@/features/motion/Scrub";
import { sceneStill } from "../../scenes";
import { localHref } from "../../site";
import { LayeredPhone } from "../phone";
import { StillFrame } from "../still-frame";

// The sections after the scenes. Each carries its own scroll idea, read from
// one `--p` per section (src/features/motion): the three stages of the event
// light up in turn, the private part of the invitation uncovers beside the
// statement, the two ways to make it close in from both sides, and the price
// table draws its rules. The questions and the finale stay still.

export function Lifecycle({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).lifecycle;
  return (
    <section aria-labelledby="lifecycle-title" className="mk-section mk-lifecycle">
      <div className="mk-wrap">
        <h2 id="lifecycle-title" className="mk-h2 mk-measure">
          {t.title}
        </h2>
        <Scrub range="through" className="mk-lifecycle__cols" style={{ "--n": t.stages.length } as CSSProperties}>
          {t.stages.map((stage, index) => (
            <div key={stage.when} className="mk-stage" style={{ "--i": index } as CSSProperties}>
              <h3 className="mk-stage__when">{stage.when}</h3>
              <ul className="mk-stage__items">
                {stage.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </Scrub>
      </div>
    </section>
  );
}

export function Privacy({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).privacy;
  return (
    <section aria-labelledby="privacy-title" className="mk-section mk-privacy">
      <Scrub range="enter" span={0.85} className="mk-wrap mk-privacy__grid">
        <div className="mk-privacy__copy">
          <h2 id="privacy-title" className="mk-statement">
            {t.title}
          </h2>
          <p className="mk-privacy__body">{t.body}</p>
        </div>
        {/* The shared-link view underneath; the personal-link view uncovers over it from the top. */}
        <LayeredPhone
          under={`/marketing/private-public-${lang}.webp`}
          over={`/marketing/private-guest-${lang}.webp`}
          alt={t.shotAlt}
          className="mk-privacy__phone"
          overClassName="mk-privacy__guest"
        />
      </Scrub>
    </section>
  );
}

export function MakeIt({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).makeIt;
  return (
    <section aria-labelledby="make-title" className="mk-section mk-make">
      <div className="mk-wrap">
        <h2 id="make-title" className="mk-h2">
          {t.title}
        </h2>
        <Scrub range="enter" span={0.8} className="mk-make__grid">
          <div className="mk-make__block" data-side="start">
            <h3 className="mk-h3">{t.self.title}</h3>
            <p className="mk-make__body">{t.self.body}</p>
            <Link href={localHref(lang, "/signup")} className="mk-btn">
              {t.self.cta}
            </Link>
          </div>
          <div className="mk-make__block" data-side="end">
            <h3 className="mk-h3">{t.done.title}</h3>
            <p className="mk-make__body">{t.done.body}</p>
            <p className="mk-make__price">{t.done.price}</p>
            <Link href={localHref(lang, "/pricing")} className="mk-btn mk-btn--quiet">
              {t.done.cta}
            </Link>
          </div>
        </Scrub>
      </div>
    </section>
  );
}

export function Prices({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).prices;
  const rows = [
    { id: "free", price: "0", ...t.rows.free },
    { id: "essential", price: egp(pricing.essential), ...t.rows.essential },
    { id: "premium", price: egp(pricing.premium), ...t.rows.premium },
  ];
  return (
    <section id="prices" aria-labelledby="prices-title" className="mk-section mk-prices">
      <div className="mk-wrap">
        <h2 id="prices-title" className="mk-h2">
          {t.title}
        </h2>
        <p className="mk-lead mk-measure">{t.lead}</p>
        <Scrub as="div" range="enter" span={0.9} className="mk-ptable__wrap">
        <table className="mk-ptable">
          <caption className="mo-sr">{t.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{t.plan}</th>
              <th scope="col">{t.what}</th>
              <th scope="col" className="mk-ptable__num">
                {t.price}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <PriceRow key={row.id} index={index} row={row} unit={t.unit} recommended={row.id === "premium" ? { title: t.recommended, line: t.difference } : null} />
            ))}
          </tbody>
        </table>
        </Scrub>
        <Link href={localHref(lang, "/pricing")} className="mk-textlink">
          {t.more}
        </Link>
      </div>
    </section>
  );
}

function PriceRow({ index, row, unit, recommended }: { index: number; row: { id: string; name: string; line: string; price: string }; unit: string; recommended: { title: string; line: string } | null }) {
  return (
    <>
      {recommended ? (
        <tr className="mk-ptable__flag" style={{ "--r": index - 0.5 } as CSSProperties}>
          <th scope="rowgroup" colSpan={3}>
            <span className="mk-ptable__flag-title">{recommended.title}</span>
            <span className="mk-ptable__flag-line">{recommended.line}</span>
          </th>
        </tr>
      ) : null}
      <tr data-plan={row.id} data-recommended={recommended ? "" : undefined} style={{ "--r": index } as CSSProperties}>
        <th scope="row" className="mk-ptable__name">
          {row.name}
        </th>
        <td className="mk-ptable__line">{row.line}</td>
        <td className="mk-ptable__num">
          <span className="mk-price">{row.price}</span> <span className="mk-ptable__unit">{unit}</span>
        </td>
      </tr>
    </>
  );
}

export function Faq({ lang, title }: { lang: Locale; title?: string }) {
  const t = marketingMessages(lang).faq;
  return (
    <section id="faq" aria-labelledby="faq-title" className="mk-section mk-faq">
      <div className="mk-wrap mk-faq__grid">
        <h2 id="faq-title" className="mk-h2">
          {title ?? t.title}
        </h2>
        <div className="mk-faq__list">
          {t.items.map((item) => (
            <details key={item.q} className="mk-qa">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Finale({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).finale;
  return (
    <StillFrame
      still={sceneStill("wedding.doors")}
      alt={t.alt}
      className="mk-finale"
      aria-labelledby="finale-title"
      overlay={
        <div className="mk-doorway">
          <div className="mk-doorway__scrim" aria-hidden="true" />
          <h2 id="finale-title" className="mk-doorway__title">
            {t.title}
          </h2>
        </div>
      }
    >
      <div className="mk-doors__action">
        <Link href={localHref(lang, "/signup")} className="mk-btn mk-btn--large">
          {t.cta}
        </Link>
      </div>
    </StillFrame>
  );
}
