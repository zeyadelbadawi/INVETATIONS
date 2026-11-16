import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { localHref } from "../site";

export function FinalCta({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang);
  return (
    <section aria-labelledby="final-title" className="bg-primary px-4 py-20 text-ink sm:px-6 md:py-28">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 id="final-title" className="mk-display max-w-3xl text-[2.75rem] md:text-[4.25rem]">
            {t.final.title}
          </h2>
          <p className="mt-5 text-lg font-semibold">{t.final.lead}</p>
        </div>
        <Link
          href={localHref(lang, "/signup")}
          className="inline-flex min-h-14 shrink-0 items-center rounded-full bg-ink px-8 text-lg font-bold text-paper transition-opacity hover:opacity-90"
        >
          {t.final.cta}
        </Link>
      </div>
    </section>
  );
}
