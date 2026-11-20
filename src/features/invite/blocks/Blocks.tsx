// One presentational component per block type. Isomorphic: the public blocks are
// rendered on the server into the cached shell, the guest-only ones in the
// browser after the session check, and all of them in the editor preview.
import { pick, type Block, type BlockOf } from "@/content/schema";
import type { Locale } from "@/i18n/config";
import { getMessages } from "../messages";
import { Icon } from "../Icon";
import { dateParts, formatTime, mapHref, safeHref, initials } from "../lib/format";
import { eventStart, eventTitle, isEmptyBlock, lines } from "../lib/content";
import type { InviteEvent } from "../types";
import { Countdown } from "./Countdown";
import { CalendarButtons } from "./CalendarButtons";
import { ViewerTime } from "./ViewerTime";

export type BlockContext = {
  event: InviteEvent;
  locale: Locale;
  titleFields: string[];
  // Guest-only blocks known to the caller (preview, or after /me): used to find the start time.
  extraBlocks?: Block[];
  // Media id -> short-lived signed URL, from the guest API. Images without one
  // keep their frame empty.
  media?: Record<string, string>;
};

type Props<T extends Block["type"]> = { block: BlockOf<T>; ctx: BlockContext };

function Section({ block, title, hideTitle, children }: { block: Block; title: string; hideTitle?: boolean; children: React.ReactNode }) {
  const headingId = `b-${block.id}`;
  return (
    <section className={`inv-block inv-block--${block.type}`} aria-labelledby={headingId} data-block={block.type}>
      <h2 id={headingId} className={hideTitle ? "inv-sr" : "inv-h2"}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Details({ block, ctx }: Props<"details">) {
  const { event, locale } = ctx;
  const t = getMessages(locale);
  // One date source: the event start from Settings; a date left in this section is only a fallback.
  const startsAt = eventStart(event, [block, ...(ctx.extraBlocks ?? [])]);
  const parts = startsAt ? dateParts(startsAt, event.timezone, locale) : null;
  const venue = pick(block.venue, locale);
  const city = pick(block.city, locale);
  const title = eventTitle(event, ctx.titleFields, locale, locale === "ar" ? " و" : " & ");
  return (
    <Section block={block} title={t.blocks.details} hideTitle>
      {parts && startsAt ? (
        <div className="inv-date">
          <span className="inv-date__day inv-num">{parts.day}</span>
          <p className="inv-date__rest">
            <span className="inv-date__weekday">{parts.weekday}</span>
            <time dateTime={startsAt} className="inv-date__month">
              {parts.month} {parts.year}
            </time>
            <span className="inv-date__time">{parts.time}</span>
          </p>
        </div>
      ) : null}
      {startsAt ? <ViewerTime iso={startsAt} timeZone={event.timezone} locale={locale} /> : null}
      {venue || city ? (
        <p className="inv-venue">
          {/* A city on its own is the place: set it as one, not as a muted afterthought. */}
          <span className="inv-venue__name">{venue || city}</span>
          {venue && city ? <span className="inv-venue__city">{city}</span> : null}
        </p>
      ) : null}
      {block.doorsAt ? (
        <p className="inv-meta">
          <Icon name="clock" /> {t.blocks.doors} {formatTime(block.doorsAt, event.timezone, locale)}
        </p>
      ) : null}
      {startsAt ? (
        <CalendarButtons
          locale={locale}
          calendar={{
            uid: `${event.slug}@invitation`,
            title: title || t.blocks.details,
            description: "",
            location: [venue, city].filter(Boolean).join(", "),
            start: startsAt,
            end: event.endsAt,
            timeZone: event.timezone,
            url: `/i/${event.slug}/${locale}`,
          }}
        />
      ) : null}
    </Section>
  );
}

function CountdownBlock({ block, ctx }: Props<"countdown">) {
  const t = getMessages(ctx.locale);
  const target = eventStart(ctx.event, ctx.extraBlocks);
  if (!target || ctx.event.status === "cancelled" || ctx.event.status === "postponed") return null;
  return (
    <Section block={block} title={t.blocks.countdown} hideTitle>
      <Countdown target={target} locale={ctx.locale} />
    </Section>
  );
}

function Programme({ block, ctx }: Props<"programme">) {
  const { locale } = ctx;
  const t = getMessages(locale);
  const items = block.items.filter((item) => pick(item.title, locale));
  return (
    <Section block={block} title={pick(block.title, locale) || t.blocks.programme}>
      <ol className="inv-timeline">
        {items.map((item) => (
          <li key={item.id} className="inv-timeline__item">
            <span className="inv-timeline__time inv-num">{item.time}</span>
            <span className="inv-timeline__body">
              <span className="inv-timeline__title">{pick(item.title, locale)}</span>
              {pick(item.note, locale) ? <span className="inv-timeline__note">{pick(item.note, locale)}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function LocationBlock({ block, ctx }: Props<"location">) {
  const { locale } = ctx;
  const t = getMessages(locale);
  const map = mapHref(block.lat, block.lng);
  const label = pick(block.label, locale);
  const address = pick(block.address, locale);
  const parking = pick(block.parking, locale);
  return (
    <Section block={block} title={t.blocks.location}>
      {label ? <p className="inv-place">{label}</p> : null}
      {address ? <p className="inv-address">{address}</p> : null}
      {parking ? (
        <p className="inv-meta">
          <Icon name="car" />
          <span>
            <span className="inv-sr">{t.blocks.parking}: </span>
            {parking}
          </span>
        </p>
      ) : null}
      {map ? (
        <a className="inv-btn inv-btn--solid" href={map} target="_blank" rel="noopener noreferrer">
          <Icon name="pin" /> {t.blocks.openMap}
        </a>
      ) : null}
    </Section>
  );
}

function Story({ block, ctx }: Props<"story">) {
  const t = getMessages(ctx.locale);
  return (
    <Section block={block} title={pick(block.title, ctx.locale) || t.blocks.story}>
      <div className="inv-prose">
        {lines(pick(block.body, ctx.locale)).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </Section>
  );
}

function Families({ block, ctx }: Props<"families">) {
  const { locale } = ctx;
  const t = getMessages(locale);
  const sides = block.sides.filter((side) => pick(side.names, locale));
  return (
    <Section block={block} title={t.blocks.families} hideTitle>
      <div className="inv-families" data-count={sides.length}>
        {sides.map((side) => (
          <div key={side.id} className="inv-families__side">
            {pick(side.title, locale) ? <h3 className="inv-h3">{pick(side.title, locale)}</h3> : null}
            <ul className="inv-plainlist">
              {lines(pick(side.names, locale)).map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

// Images arrive as short-lived signed URLs with the guest-only blocks. Frames
// without one (preview, or not processed yet) keep their place so nothing jumps.
function Gallery({ block, ctx }: Props<"gallery">) {
  const t = getMessages(ctx.locale);
  const urls = block.images.map((id) => ctx.media?.[id] ?? null);
  const shown = urls.filter((url): url is string => url !== null);
  if (shown.length === 0) {
    return (
      <Section block={block} title={t.blocks.gallery}>
        <ul className="inv-gallery" aria-label={t.blocks.galleryEmpty}>
          {block.images.slice(0, 6).map((id) => (
            <li key={id} className="inv-gallery__cell" />
          ))}
        </ul>
        <p className="inv-hint">{t.blocks.galleryEmpty}</p>
      </Section>
    );
  }
  return (
    <Section block={block} title={t.blocks.gallery}>
      <ul className="inv-gallery" data-count={shown.length}>
        {shown.map((url, i) => (
          <li key={url} className="inv-gallery__cell">
            {/* A signed link from private storage: no optimiser, no referrer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="inv-gallery__img" src={url} alt={t.blocks.photo(i + 1)} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Quote({ block, ctx }: Props<"quote">) {
  const source = pick(block.source, ctx.locale);
  return (
    <section className="inv-block inv-block--quote" data-block="quote">
      <figure className="inv-quote">
        <blockquote>
          {lines(pick(block.body, ctx.locale)).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </blockquote>
        {source ? <figcaption>{source}</figcaption> : null}
      </figure>
    </section>
  );
}

function DressCode({ block, ctx }: Props<"dress_code">) {
  const t = getMessages(ctx.locale);
  const colors = block.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  return (
    <Section block={block} title={t.blocks.dressCode}>
      {pick(block.note, ctx.locale) ? <p className="inv-text">{pick(block.note, ctx.locale)}</p> : null}
      {colors.length > 0 ? (
        <ul className="inv-swatches" aria-label={t.blocks.dressColors}>
          {colors.map((color, i) => (
            <li key={`${color}-${i}`} className="inv-swatch" style={{ backgroundColor: color }}>
              <span className="inv-sr">{color}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function Notes({ block, ctx }: Props<"notes">) {
  const t = getMessages(ctx.locale);
  return (
    <Section block={block} title={pick(block.title, ctx.locale) || t.blocks.notes}>
      <ul className="inv-notes">
        {block.items
          .filter((item) => pick(item.body, ctx.locale))
          .map((item) => (
            <li key={item.id}>{pick(item.body, ctx.locale)}</li>
          ))}
      </ul>
    </Section>
  );
}

function Faq({ block, ctx }: Props<"faq">) {
  const t = getMessages(ctx.locale);
  return (
    <Section block={block} title={t.blocks.faq}>
      <div className="inv-faq">
        {block.items
          .filter((item) => pick(item.question, ctx.locale))
          .map((item) => (
            <details key={item.id} className="inv-faq__item">
              <summary>
                <span>{pick(item.question, ctx.locale)}</span>
                <Icon name="down" />
              </summary>
              <p>{pick(item.answer, ctx.locale)}</p>
            </details>
          ))}
      </div>
    </Section>
  );
}

function People({ block, ctx }: Props<"people">) {
  const t = getMessages(ctx.locale);
  return (
    <Section block={block} title={pick(block.title, ctx.locale) || t.blocks.people}>
      <ul className="inv-people">
        {block.items
          .filter((item) => pick(item.name, ctx.locale))
          .map((item) => {
            const name = pick(item.name, ctx.locale);
            const photo = item.photo ? ctx.media?.[item.photo] : undefined;
            return (
              <li key={item.id} className="inv-person">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="inv-person__photo" src={photo} alt={t.blocks.photoOf(name)} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                ) : (
                  <span className="inv-person__mark" aria-hidden="true">
                    {initials([name])[0]}
                  </span>
                )}
                <span className="inv-person__text">
                  <span className="inv-person__name">{name}</span>
                  {pick(item.role, ctx.locale) ? <span className="inv-person__role">{pick(item.role, ctx.locale)}</span> : null}
                </span>
              </li>
            );
          })}
      </ul>
    </Section>
  );
}

function Contact({ block, ctx }: Props<"contact">) {
  const t = getMessages(ctx.locale);
  const link = safeHref(block.link);
  const phone = block.phone && /^\+[1-9][0-9]{7,14}$/.test(block.phone) ? block.phone : null;
  return (
    <Section block={block} title={t.blocks.contact}>
      {pick(block.name, ctx.locale) ? <p className="inv-place">{pick(block.name, ctx.locale)}</p> : null}
      <div className="inv-actions">
        {phone ? (
          <a className="inv-btn inv-btn--solid" href={`tel:${phone}`}>
            <Icon name="phone" /> {t.blocks.call} <bdi dir="ltr">{phone}</bdi>
          </a>
        ) : null}
        {link ? (
          <a className="inv-btn" href={link} target="_blank" rel="noopener noreferrer">
            <Icon name="link" /> {t.blocks.openLink}
          </a>
        ) : null}
      </div>
    </Section>
  );
}

export function BlockView({ block, ctx }: { block: Block; ctx: BlockContext }) {
  if (isEmptyBlock(block, ctx.locale, ctx.event)) return null;
  switch (block.type) {
    case "details":
      return <Details block={block} ctx={ctx} />;
    case "countdown":
      return <CountdownBlock block={block} ctx={ctx} />;
    case "programme":
      return <Programme block={block} ctx={ctx} />;
    case "location":
      return <LocationBlock block={block} ctx={ctx} />;
    case "story":
      return <Story block={block} ctx={ctx} />;
    case "families":
      return <Families block={block} ctx={ctx} />;
    case "gallery":
      return <Gallery block={block} ctx={ctx} />;
    case "quote":
      return <Quote block={block} ctx={ctx} />;
    case "dress_code":
      return <DressCode block={block} ctx={ctx} />;
    case "notes":
      return <Notes block={block} ctx={ctx} />;
    case "faq":
      return <Faq block={block} ctx={ctx} />;
    case "people":
      return <People block={block} ctx={ctx} />;
    case "contact":
      return <Contact block={block} ctx={ctx} />;
  }
}
