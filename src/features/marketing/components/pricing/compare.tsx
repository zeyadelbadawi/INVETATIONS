import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../../messages";
import { egp, pricing, type PlanId } from "../../pricing";
import { localHref, whatsappHref } from "../../site";

const PLANS: PlanId[] = ["free", "essential", "premium"];

function priceOf(plan: PlanId): string {
  return plan === "free" ? "0" : egp(plan === "essential" ? pricing.essential : pricing.premium);
}

// Desktop: one table, plans as columns, the plan header sticks under the site
// header while the rows scroll. Phones: the same facts as one section per plan.
export function PlanCompare({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).pricingPage;
  const unit = marketingMessages(lang).prices.unit;
  return (
    <>
      <table className="mk-compare">
        <caption className="mo-sr">{t.caption}</caption>
        <thead>
          <tr className="mk-compare__plans">
            <th scope="col" className="mk-compare__corner">
              {t.feature}
            </th>
            {PLANS.map((plan) => (
              <th key={plan} scope="col" data-plan={plan}>
                <span className="mk-compare__name">{t.plans[plan].name}</span>
                <span className="mk-compare__price">
                  <span className="mk-price">{priceOf(plan)}</span> {unit}
                </span>
                <span className="mk-compare__line">{plan === "premium" ? t.recommendedLine : t.plans[plan].line}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.features.map((feature) => (
            <tr key={feature.label}>
              <th scope="row">{feature.label}</th>
              {PLANS.map((plan) => (
                <td key={plan} data-plan={plan}>
                  {feature.plans.includes(plan) ? <Check label={t.included} /> : <span className="mk-compare__no">{<span className="mo-sr">{t.notIncluded}</span>}</span>}
                </td>
              ))}
            </tr>
          ))}
          <tr className="mk-compare__actions">
            <td />
            {PLANS.map((plan) => (
              <td key={plan} data-plan={plan}>
                <Link href={localHref(lang, "/signup")} className={plan === "premium" ? "mk-btn" : "mk-btn mk-btn--quiet"} aria-label={`${t.choose}: ${t.plans[plan].name}`}>
                  {t.choose}
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div className="mk-plans">
        {PLANS.map((plan) => (
          <section key={plan} aria-labelledby={`plan-${plan}`} className="mk-plan" data-plan={plan}>
            <h2 id={`plan-${plan}`} className="mk-plan__name">
              {t.plans[plan].name}
            </h2>
            <p className="mk-plan__price">
              <span className="mk-price">{priceOf(plan)}</span> {unit} <span className="mk-plan__per">{t.perEvent}</span>
            </p>
            <p className="mk-plan__line">{plan === "premium" ? t.recommendedLine : t.plans[plan].line}</p>
            <ul className="mk-plan__list">
              {t.features
                .filter((feature) => feature.plans.includes(plan))
                .map((feature) => (
                  <li key={feature.label}>{feature.label}</li>
                ))}
            </ul>
            <Link href={localHref(lang, "/signup")} className={plan === "premium" ? "mk-btn" : "mk-btn mk-btn--quiet"} aria-label={`${t.choose}: ${t.plans[plan].name}`}>
              {t.choose}
            </Link>
          </section>
        ))}
      </div>
    </>
  );
}

function Check({ label }: { label: string }) {
  return (
    <span className="mk-compare__yes">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 10.5l3.5 3.5 7.5-8" />
      </svg>
      <span className="mo-sr">{label}</span>
    </span>
  );
}

export function Extras({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).pricingPage;
  const whatsapp = whatsappHref();
  return (
    <section aria-labelledby="extras-title" className="mk-extras">
      <h2 id="extras-title" className="mk-h3">
        {t.extrasTitle}
      </h2>
      <dl className="mk-extras__rows">
        <div className="mk-extras__row">
          <dt>{t.addOn.title}</dt>
          <dd className="mk-extras__body">{t.addOn.body}</dd>
          <dd className="mk-extras__price">
            <span className="mk-price mk-price--small">{t.addOn.price}</span> {t.addOn.unit}
          </dd>
        </div>
        <div className="mk-extras__row">
          <dt>{t.corporate.title}</dt>
          <dd className="mk-extras__body">
            {t.corporate.body}{" "}
            {whatsapp ? (
              <a href={whatsapp} rel="noopener noreferrer" target="_blank" className="mk-textlink">
                {t.corporate.cta}
              </a>
            ) : (
              <Link href={localHref(lang, "/signup")} className="mk-textlink">
                {t.corporate.ctaFallback}
              </Link>
            )}
          </dd>
          <dd className="mk-extras__price">{t.corporate.price}</dd>
        </div>
      </dl>
    </section>
  );
}

export function Billing({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).pricingPage;
  return (
    <div className="mk-billing">
      <section aria-labelledby="billing-title">
        <h2 id="billing-title" className="mk-h3">
          {t.billingTitle}
        </h2>
        <div className="mk-faq__list">
          {t.billing.map((item) => (
            <details key={item.q} className="mk-qa">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section aria-labelledby="soon-title">
        <h2 id="soon-title" className="mk-h3">
          {t.soon.title}
        </h2>
        <ul className="mk-soon">
          {t.soon.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
