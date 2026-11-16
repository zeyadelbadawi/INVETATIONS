import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { localHref } from "../site";

export function MakeIt({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang);
  const { self, done } = t.makeIt;
  return (
    <section aria-labelledby="make-title" className="bg-paper px-4 py-20 text-ink sm:px-6 md:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 id="make-title" className="mk-display max-w-3xl text-[2.5rem] md:text-[3.5rem]">
          {t.makeIt.title}
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <article aria-labelledby="make-self" className="flex flex-col rounded-[1.75rem] border border-line bg-raised p-7 md:p-10">
            <h3 id="make-self" className="mk-display text-[2.25rem] md:text-[2.75rem]">
              {self.title}
            </h3>
            <p className="mt-4 text-base leading-relaxed text-muted">{self.body}</p>
            <ul className="mt-6 space-y-3">
              {self.points.map((point) => (
                <li key={point} className="flex items-start gap-3 font-medium">
                  <span aria-hidden="true" className="mt-2 size-2 shrink-0 rotate-45 bg-secondary" />
                  {point}
                </li>
              ))}
            </ul>
            <Link
              href={localHref(lang, "/signup")}
              className="mt-8 inline-flex min-h-12 items-center self-start rounded-full bg-ink px-6 text-base font-semibold text-paper transition-opacity hover:opacity-90"
            >
              {self.cta}
            </Link>
          </article>
          <article aria-labelledby="make-done" className="flex flex-col rounded-[1.75rem] bg-highlight p-7 text-ink md:p-10">
            <h3 id="make-done" className="mk-display text-[2.25rem] md:text-[2.75rem]">
              {done.title}
            </h3>
            <p className="mt-4 text-base leading-relaxed">{done.body}</p>
            <p className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span dir="ltr" className="mk-num text-[3rem]">{t.pricingPage.addOn.price}</span>
              <span className="text-base font-semibold">{t.pricingPage.addOn.unit}</span>
            </p>
            <Link
              href={localHref(lang, "/pricing")}
              className="mt-8 inline-flex min-h-12 items-center self-start rounded-full border-2 border-ink px-6 text-base font-semibold transition-colors hover:bg-ink hover:text-highlight"
            >
              {done.cta}
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
