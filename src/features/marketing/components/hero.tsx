import Link from "next/link";
import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { localHref } from "../site";
import { Phone } from "./phone";

const delay = (ms: number) => ({ "--mk-delay": `${ms}ms` }) as CSSProperties;

export function Hero({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang);
  const [joined, points, reveal] = t.hero.chips;
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl items-center gap-4 px-4 pt-10 sm:px-6 md:grid-cols-[1.05fr_1fr] md:gap-8 md:pt-16">
        <div className="md:pb-24">
          <h1 id="hero-title" className="mk-display text-[3.25rem] text-paper sm:text-[4.25rem] lg:text-[5.5rem]">
            {t.hero.titleLines.map((line, i) => (
              <span key={line} className="mk-rise block" style={delay(80 + i * 70)}>
                {line}{" "}
              </span>
            ))}
          </h1>
          <p className="mk-rise mt-6 max-w-[34rem] text-lg leading-relaxed text-paper/80" style={delay(320)}>
            {t.hero.lead}
          </p>
          <div className="mk-rise mt-8 flex flex-wrap items-center gap-3" style={delay(400)}>
            <Link
              href={localHref(lang, "/signup")}
              className="inline-flex min-h-13 items-center justify-center rounded-full bg-primary px-7 text-[1.1875rem] font-bold text-on-primary transition-[filter] hover:brightness-110"
            >
              {t.hero.primary}
            </Link>
            <Link
              href={localHref(lang, "/how-it-works")}
              className="inline-flex min-h-13 items-center justify-center rounded-full border border-paper/30 px-6 text-base font-semibold text-paper transition-colors hover:border-paper/70"
            >
              {t.hero.secondary}
            </Link>
          </div>
          <p className="mk-rise mt-4 text-sm text-paper/65" style={delay(460)}>
            {t.hero.note}
          </p>
        </div>

        <figure className="relative -mx-4 sm:mx-0">
          <div className="mk-fan">
            <Phone shot="scoreboard-ar" alt={t.alts.scoreboard} className="mk-fan-card mk-deal" style={delay(520)} data-pos="start" />
            <Phone shot="countdown-ar" alt={t.alts.countdown} className="mk-fan-card mk-deal" style={delay(560)} data-pos="end" />
            <Phone
              shot={lang === "ar" ? "names-ar" : "names-en"}
              alt={t.alts.names}
              className="mk-fan-card mk-deal z-[1]"
              style={delay(440)}
              eager
            />
            <p className="mk-chip mk-pop start-3 top-[2rem] md:start-0 md:top-[2.5rem]" style={{ ...delay(1100), "--mk-dot": "var(--brand-secondary)" } as CSSProperties}>
              {joined}
            </p>
            <p className="mk-chip mk-pop end-3 top-[45%] md:end-0" style={{ ...delay(1500), "--mk-dot": "var(--brand-primary)" } as CSSProperties}>
              {points}
            </p>
            <p className="mk-chip mk-pop bottom-[3.5rem] start-6 md:bottom-[6rem] md:start-4" style={{ ...delay(1900), "--mk-dot": "var(--brand-highlight)" } as CSSProperties}>
              {reveal}
            </p>
          </div>
          <figcaption className="absolute end-4 top-0 text-xs text-paper/60 sm:end-0">
            {t.hero.caption}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
