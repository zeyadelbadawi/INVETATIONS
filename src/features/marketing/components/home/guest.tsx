import type { Locale } from "@/i18n/config";
import { marketingMessages } from "../../messages";
import type { Shot } from "../phone";
import { PhoneSequence } from "../phone-sequence";

// What the guest gets: one phone, five real screens in the order a guest meets
// them (opening, reply, team, playing, the score).
export function GuestSequence({ lang }: { lang: Locale }) {
  const t = marketingMessages(lang).guest;
  return (
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
  );
}
