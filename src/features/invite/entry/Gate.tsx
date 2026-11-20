import type { ReactNode } from "react";
import { dirOf, type Locale } from "@/i18n/config";
import { inviteFontClass } from "../fonts";
import "../invite.css";

// Shared frame of the two small platform pages: link entry and secret keeper.
export function Gate({ locale, busy = false, children }: { locale: Locale; busy?: boolean; children: ReactNode }) {
  return (
    <div className={`inv inv--brand ${inviteFontClass}`} lang={locale} dir={dirOf(locale)} data-scheme="light">
      <main className="inv-gate">
        <div className="inv-gate__card">
          {/* A hairline that runs while the link is being checked. */}
          <span className="inv-gate__mark" data-busy={busy ? "true" : "false"} aria-hidden="true" />
          {children}
        </div>
      </main>
    </div>
  );
}
