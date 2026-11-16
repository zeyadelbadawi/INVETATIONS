import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { Phone, type Shot } from "./phone";
import { WhoDemo } from "./who-demo";

const marks = [
  "var(--brand-primary)",
  "var(--brand-secondary)",
  "var(--brand-highlight)",
  "var(--brand-primary)",
  "var(--brand-secondary)",
  "var(--brand-highlight)",
];

const shelf: { shot: Shot; alt: "quiz" | "vote" | "wall" }[] = [
  { shot: "quiz-ar", alt: "quiz" },
  { shot: "vote-ar", alt: "vote" },
  { shot: "wall-ar", alt: "wall" },
];

export function Play({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang);
  return (
    <section
      aria-labelledby="play-title"
      className="bg-[var(--mk-paper-deep)] px-4 py-20 text-ink sm:px-6 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
          <div>
            <h2 id="play-title" className="mk-display text-[2.5rem] md:text-[3.5rem]">
              {t.play.title}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">{t.play.lead}</p>
            <div className="mt-10">
              <WhoDemo labels={t.play.demo} />
            </div>
          </div>
          <ul className="grid content-start gap-x-10 gap-y-9 sm:grid-cols-2 md:pt-4">
            {t.play.items.map((item, i) => (
              <li key={item.title} style={{ "--mk-dot": marks[i] } as CSSProperties}>
                <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-[var(--mk-dot)]" />
                <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
        <ul className="mk-shelf -mx-4 mt-16 flex gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 md:justify-center md:gap-10 md:overflow-visible">
          {shelf.map((s, i) => (
            <li key={s.shot} className="w-[58%] max-w-[15rem] shrink-0 sm:w-[13rem]">
              <Phone shot={s.shot} alt={t.alts[s.alt]} sizes="(min-width: 640px) 208px, 58vw" />
              <p className="mt-3 text-center text-sm font-semibold text-muted">{t.play.shots[i]}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
