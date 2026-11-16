import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { Phone } from "./phone";

export function Privacy({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang);
  return (
    <section aria-labelledby="privacy-title" className="bg-ink px-4 py-20 text-paper sm:px-6 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-14 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-16">
        <div>
          <h2 id="privacy-title" className="mk-display text-[2.5rem] md:text-[3.5rem]">
            {t.privacy.title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-paper/75">{t.privacy.lead}</p>
          <Phone shot="private-en" alt={t.privacy.shotAlt} className="mt-10 hidden w-[15rem] -rotate-3 md:block" sizes="240px" />
        </div>
        <ul className="grid content-start gap-x-10 gap-y-10 sm:grid-cols-2">
          {t.privacy.items.map((item) => (
            <li key={item.title} className="border-t border-paper/20 pt-5">
              <h3 className="text-xl font-semibold text-highlight">{item.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-paper/75">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
