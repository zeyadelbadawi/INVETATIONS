import type { ReactNode } from "react";
import { dirOf, type Locale } from "@/i18n/config";
import { Star } from "../Icon";
import { inviteFontClass } from "../fonts";
import "../invite.css";

// Shared frame of the two small platform pages: link entry and secret keeper.
export function Gate({ locale, busy = false, children }: { locale: Locale; busy?: boolean; children: ReactNode }) {
  return (
    <div className={`inv inv--brand ${inviteFontClass}`} lang={locale} dir={dirOf(locale)} data-scheme="light">
      <main className="inv-gate">
        <div className="inv-gate__card">
          <span className="inv-gate__mark" data-busy={busy ? "true" : "false"}>
            <Star size={28} />
          </span>
          {children}
        </div>
      </main>
    </div>
  );
}
