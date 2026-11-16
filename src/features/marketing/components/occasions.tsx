import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { Phone, type Shot } from "./phone";

type Look = { section: string; muted: string; dot: string; shots: { shot: Shot; alt: keyof ReturnType<typeof marketingMessages>["alts"] }[] };

function looks(lang: Locale): Record<string, Look> {
  return {
    wedding: {
      section: "bg-paper text-ink",
      muted: "text-muted",
      dot: "var(--brand-primary)",
      shots: [
        { shot: "scoreboard-ar", alt: "scoreboard" },
        { shot: "details-ar", alt: "details" },
      ],
    },
    reveal: {
      section: "bg-ink text-paper",
      muted: "text-paper/70",
      dot: "var(--brand-highlight)",
      shots: [
        { shot: lang === "ar" ? "countdown-ar" : "reveal-en", alt: "countdown" },
        { shot: "reveal-result-ar", alt: "revealResult" },
      ],
    },
    corporate: {
      section: "bg-[color-mix(in_oklab,var(--brand-secondary)_12%,var(--brand-paper))] text-ink",
      muted: "text-muted",
      dot: "var(--brand-secondary)",
      shots: [{ shot: "corporate-en", alt: "corporate" }],
    },
  };
}

export function Occasions({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang);
  const look = looks(lang);
  return (
    <section id="occasions" aria-labelledby="occasions-title" className="scroll-mt-16">
      <div className="bg-paper px-4 pb-4 pt-20 sm:px-6 md:pt-28">
        <div className="mx-auto max-w-6xl">
          <h2 id="occasions-title" className="mk-display max-w-3xl text-[2.5rem] text-ink md:text-[3.75rem]">
            {t.occasions.title}
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">{t.occasions.lead}</p>
        </div>
      </div>
      {t.occasions.items.map((item, index) => {
        const l = look[item.key];
        const flip = index % 2 === 1;
        return (
          <article key={item.key} aria-labelledby={`occ-${item.key}`} className={`${l.section} px-4 py-16 sm:px-6 md:py-24`}>
            <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2 md:gap-16">
              <div className={flip ? "md:order-2" : undefined}>
                <p className={`flex items-center gap-2 text-base font-semibold ${l.muted}`}>
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: l.dot }} />
                  {item.name}
                </p>
                <h3 id={`occ-${item.key}`} className="mk-display mt-3 text-[2.375rem] md:text-[3.5rem]">
                  {item.signature}
                </h3>
                <p className={`mt-5 max-w-xl text-lg leading-relaxed ${l.muted}`}>{item.body}</p>
                <ul className="mt-7 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {item.points.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-base font-medium">
                      <span aria-hidden="true" className="mt-2 size-2 shrink-0 rotate-45" style={{ background: l.dot }} />
                      {point}
                    </li>
                  ))}
                </ul>
                <p className={`mt-7 border-s-2 ps-4 text-sm ${l.muted}`} style={{ borderColor: l.dot } as CSSProperties}>
                  {item.note}
                </p>
              </div>
              <div className={`flex justify-center ${flip ? "md:order-1" : ""}`}>
                <div className="relative flex w-full max-w-[26rem] items-start justify-center">
                  {l.shots.map((s, i) => (
                    <Phone
                      key={s.shot}
                      shot={s.shot}
                      alt={t.alts[s.alt]}
                      sizes="(min-width: 768px) 240px, 46vw"
                      className={
                        l.shots.length === 1
                          ? "w-[62%] max-w-[16rem]"
                          : i === 0
                            ? "z-[1] w-[52%] max-w-[15rem]"
                            : "-ms-[10%] mt-14 w-[46%] max-w-[13rem] rotate-[4deg]"
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
