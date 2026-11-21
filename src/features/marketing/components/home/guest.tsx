import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../../messages";
import type { Shot } from "../phone";
import { PhoneSequence } from "../phone-sequence";
import { Photo } from "../photo";
import { Scrub } from "@/features/motion/Scrub";

// What the guest gets: one phone, five real screens in the order a guest meets
// them (opening, reply, team, playing, the score). After the pin, the same
// invitation in a guest's hand at the table: one photograph and one line.
export function GuestSequence({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).guest;
  return (
    <>
      <PhoneSequence
        lang={lang}
        id="guests"
        headingId="guest-title"
        heading={
          <h2 id="guest-title" className="mk-h2">
            {t.title}
          </h2>
        }
        steps={t.steps.map((step) => ({ ...step, shot: step.shot as Shot }))}
        lengthVh={200}
      />
      <Scrub as="figure" range="through" className="mk-moment">
        <div className="mk-moment__photo">
          <Photo name="grandmother-phone" alt={t.momentAlt} sizes="(min-width: 768px) 64vw, 100vw" />
        </div>
        <figcaption className="mk-moment__line">{t.moment}</figcaption>
      </Scrub>
    </>
  );
}
