import type { CSSProperties, ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { Pinned } from "@/features/motion/Scrub";
import { Phone, type Shot } from "./phone";

// Without JavaScript `--p` stays at 1, which would show only the last step:
// lay the steps out as in the reduced-motion version instead.
const NO_JS_CSS = [
  ".mk-seq__pin{height:auto!important}",
  ".mk-seq__pin>.mo-stage{position:relative;height:auto;overflow:visible}",
  ".mk-seq__layout{display:flex!important;flex-direction:column;padding-block:4rem 6rem}",
  ".mk-seq__steps{display:flex!important;flex-direction:column;gap:4rem}",
  ".mk-seq__step{--in:1!important;--out:1!important;grid-area:auto!important}",
  "@media (min-width:768px){.mk-seq__step{grid-template-columns:minmax(0,34rem) auto!important;grid-template-rows:auto!important;column-gap:6rem;align-items:center!important}.mk-seq__step .mk-seq__text{grid-row:1!important}}",
].join("");

export type SequenceStep = { shot: Shot; alt: string; title?: string; body: string };

type Props = {
  lang: Locale;
  id?: string;
  /** Heading element, already rendered with its id. */
  heading: ReactNode;
  headingId: string;
  steps: SequenceStep[];
  lengthVh: number;
  /** Text after the steps, outside the pinned stage. */
  after?: ReactNode;
};

// One phone whose screen changes with scroll; the sentence beside it is swapped
// for each screen. Every step stays in the DOM in reading order (a list), so
// screen readers and the still layout get all of them. Under reduced motion,
// and without JavaScript, the steps are laid out one under the other.
export function PhoneSequence({ lang, id, heading, headingId, steps, lengthVh, after }: Props) {
  return (
    <section id={id} aria-labelledby={headingId} className="mk-seq">
      <Pinned lengthVh={lengthVh} className="mk-seq__pin" stageClassName="mk-seq__stage">
        <div className="mk-wrap mk-seq__layout">
          <div className="mk-seq__head">{heading}</div>
          <ol className="mk-seq__steps" style={{ "--n": steps.length } as CSSProperties}>
            {steps.map((step, index) => (
              <li
                key={index}
                className="mk-seq__step"
                style={{ "--i": index } as CSSProperties}
                data-first={index === 0 ? "" : undefined}
                data-last={index === steps.length - 1 ? "" : undefined}
              >
                <Phone shot={step.shot} lang={lang} alt={step.alt} className="mk-seq__phone" />
                <div className="mk-seq__text">
                  {step.title ? <h3 className="mk-seq__title">{step.title}</h3> : null}
                  <p className="mk-seq__body">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Pinned>
      <noscript>
        <style>{NO_JS_CSS}</style>
      </noscript>
      {after}
    </section>
  );
}
