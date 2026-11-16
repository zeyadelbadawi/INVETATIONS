import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";

const dots = ["var(--brand-secondary)", "var(--brand-primary)", "var(--brand-highlight)"];

export function Lifecycle({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang);
  return (
    <section aria-labelledby="life-title" className="bg-paper px-4 py-20 text-ink sm:px-6 md:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 id="life-title" className="mk-display max-w-3xl text-[2.5rem] md:text-[3.75rem]">
          {t.lifecycle.title}
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">{t.lifecycle.lead}</p>
        <ol className="mk-timeline mt-14 grid gap-10 md:grid-cols-3 md:gap-10">
          {t.lifecycle.stages.map((stage, i) => (
            <li key={stage.when} style={{ "--mk-dot": dots[i] } as CSSProperties}>
              <p className="mk-display text-[2.25rem] leading-none md:text-[2.75rem]" style={{ color: "var(--brand-ink)" }}>
                {stage.when}
              </p>
              <h3 className="mt-3 text-lg font-semibold">{stage.title}</h3>
              <ul className="mt-3 space-y-2 text-base leading-relaxed text-muted">
                {stage.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="mt-12 max-w-2xl text-sm leading-relaxed text-muted">{t.lifecycle.footnote}</p>
      </div>
    </section>
  );
}
