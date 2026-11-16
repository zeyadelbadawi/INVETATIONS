import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { egp, pricing } from "../pricing";
import { localHref } from "../site";

export function PricingTeaser({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang);
  const plans = [
    { name: t.teaser.essential, line: t.teaser.essentialLine, price: pricing.essential },
    { name: t.teaser.premium, line: t.teaser.premiumLine, price: pricing.premium },
  ];
  return (
    <section aria-labelledby="teaser-title" className="bg-paper px-4 pb-20 text-ink sm:px-6 md:pb-28">
      <div className="mx-auto max-w-6xl border-t border-line pt-16 md:pt-20">
        <div className="grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
          <div>
            <h2 id="teaser-title" className="mk-display text-[2.25rem] md:text-[3rem]">
              {t.teaser.title}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">{t.teaser.lead}</p>
            <Link
              href={localHref(lang, "/pricing")}
              className="mt-8 inline-flex min-h-12 items-center rounded-full border-2 border-ink px-6 text-base font-semibold transition-colors hover:bg-ink hover:text-paper"
            >
              {t.teaser.compare}
            </Link>
          </div>
          <dl className="grid gap-8 sm:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.name} className="border-s-2 border-primary ps-5">
                <dt className="text-lg font-semibold">{plan.name}</dt>
                <dd className="mt-2">
                  <span className="mk-num text-[4rem] md:text-[5rem]">{egp(plan.price)}</span>{" "}
                  <span className="text-base font-semibold text-muted">{t.teaser.from}</span>
                </dd>
                <dd className="mt-2 text-base leading-relaxed text-muted">{plan.line}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
