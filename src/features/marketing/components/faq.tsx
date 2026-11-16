import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";

export function Faq({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang);
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 bg-[var(--mk-paper-deep)] px-4 py-20 text-ink sm:px-6 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-16">
        <h2 id="faq-title" className="mk-display text-[2.5rem] md:text-[3.5rem]">
          {t.faq.title}
        </h2>
        <div className="border-t border-line">
          {t.faq.items.map((item) => (
            <details key={item.q} className="mk-faq group border-b border-line">
              <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-4 py-4 text-lg font-semibold">
                {item.q}
                <span aria-hidden="true" className="mk-plus inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-xl leading-none">
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-6 text-base leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
