import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../messages";
import { egp, pricing, type PlanId } from "../pricing";
import { localHref, whatsappHref } from "../site";

type Tone = "plain" | "raised" | "featured";

const tones: Record<Tone, { card: string; muted: string; mark: string; cta: string }> = {
  plain: {
    card: "border border-line bg-transparent text-ink",
    muted: "text-muted",
    mark: "bg-muted",
    cta: "border-2 border-ink text-ink hover:bg-ink hover:text-paper",
  },
  raised: {
    card: "border border-line bg-raised text-ink",
    muted: "text-muted",
    mark: "bg-secondary",
    cta: "border-2 border-ink text-ink hover:bg-ink hover:text-paper",
  },
  featured: {
    card: "bg-ink text-paper shadow-[0_40px_80px_-40px_var(--brand-ink)]",
    muted: "text-paper/75",
    mark: "bg-highlight",
    cta: "bg-primary text-on-primary text-[1.1875rem] font-bold hover:brightness-110",
  },
};

export function Plans({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).pricingPage;
  const unit = marketingMessages(lang).teaser.from;
  const plans: { id: PlanId; tone: Tone; price: string; lead?: string }[] = [
    { id: "free", tone: "plain", price: t.plans.free.price },
    { id: "essential", tone: "raised", price: egp(pricing.essential) },
    { id: "premium", tone: "featured", price: egp(pricing.premium), lead: t.plans.premium.lead },
  ];
  return (
    <ul className="grid items-stretch gap-5 lg:grid-cols-[0.85fr_1fr_1.15fr]">
      {plans.map((plan) => {
        const copy = t.plans[plan.id];
        const tone = tones[plan.tone];
        return (
          <li key={plan.id} className={`flex flex-col rounded-[1.75rem] p-7 md:p-9 ${tone.card}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold">{copy.name}</h2>
              {plan.tone === "featured" ? (
                <span className="rounded-full bg-highlight px-3 py-1 text-sm font-semibold text-ink">{t.popular}</span>
              ) : null}
            </div>
            <p className={`mt-1 text-base ${tone.muted}`}>{copy.line}</p>
            <p className="mt-6 flex items-baseline gap-2">
              <span className="mk-num text-[4.5rem]">{plan.price}</span>
              <span className="text-lg font-semibold">{unit}</span>
            </p>
            <p className={`text-sm ${tone.muted}`}>{t.perEvent}</p>
            {plan.lead ? <p className="mt-7 text-base font-semibold">{plan.lead}</p> : null}
            <ul className={`${plan.lead ? "mt-3" : "mt-7"} space-y-3`}>
              {copy.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-base">
                  <span aria-hidden="true" className={`mt-2 size-2 shrink-0 rotate-45 ${tone.mark}`} />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-9">
              <Link
                href={localHref(lang, "/signup")}
                className={`flex min-h-13 items-center justify-center rounded-full px-6 text-base font-semibold transition-[background-color,color,filter] ${tone.cta}`}
              >
                {t.choose}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Extras({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).pricingPage;
  const whatsapp = whatsappHref();
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section aria-labelledby="addon-title" className="rounded-[1.75rem] bg-highlight p-7 text-ink md:p-9">
        <h2 id="addon-title" className="mk-display text-[2.25rem]">
          {t.addOn.title}
        </h2>
        <p className="mt-4 flex flex-wrap items-baseline gap-x-3">
          <span dir="ltr" className="mk-num text-[3.5rem]">{t.addOn.price}</span>
          <span className="text-base font-semibold">{t.addOn.unit}</span>
        </p>
        <p className="mt-4 text-base leading-relaxed">{t.addOn.body}</p>
      </section>
      <section
        aria-labelledby="corp-title"
        className="rounded-[1.75rem] bg-[color-mix(in_oklab,var(--brand-secondary)_14%,var(--brand-paper))] p-7 text-ink md:p-9"
      >
        <h2 id="corp-title" className="mk-display text-[2.25rem]">
          {t.corporate.title}
        </h2>
        <p className="mt-4 text-2xl font-semibold">{t.corporate.price}</p>
        <p className="mt-4 text-base leading-relaxed text-muted">{t.corporate.body}</p>
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 inline-flex min-h-12 items-center rounded-full bg-ink px-6 text-base font-semibold text-paper hover:opacity-90"
          >
            {t.corporate.cta}
          </a>
        ) : (
          <Link
            href={localHref(lang, "/signup")}
            className="mt-7 inline-flex min-h-12 items-center rounded-full bg-ink px-6 text-base font-semibold text-paper hover:opacity-90"
          >
            {t.corporate.ctaFallback}
          </Link>
        )}
      </section>
    </div>
  );
}

export function PaymentAndSoon({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).pricingPage;
  return (
    <div className="grid gap-12 border-t border-line pt-14 md:grid-cols-2 md:gap-16">
      <section aria-labelledby="pay-title">
        <h2 id="pay-title" className="text-2xl font-semibold">
          {t.payment.title}
        </h2>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">{t.payment.body}</p>
      </section>
      <section aria-labelledby="soon-title">
        <h2 id="soon-title" className="text-2xl font-semibold">
          {t.soon.title}
        </h2>
        <p className="mt-3 text-base text-muted">{t.soon.lead}</p>
        <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {t.soon.items.map((item) => (
            <li key={item} className="flex items-start gap-3 text-base text-muted">
              <span aria-hidden="true" className="mt-2.5 h-px w-3 shrink-0 bg-muted" />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
