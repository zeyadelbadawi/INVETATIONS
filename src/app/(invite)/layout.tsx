import type { Metadata } from "next";
import { uiFont } from "@/app/fonts";
import "@/app/globals.css";

// Root layout for guest-facing pages (/i, /l, /k, /preview). It reads nothing
// per request, so every page under it can be a cached shell. The document
// language follows the URL; a constant inline script sets it before paint, and
// each page also wraps its content in an element with the right lang and dir.
const LANG_SCRIPT =
  '(function(){try{var m=location.pathname.match(/\\/(ar|en)(\\/|$)/);var l=m?m[1]:"ar";var d=document.documentElement;d.lang=l;d.dir=l==="ar"?"rtl":"ltr"}catch(e){}})()';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${uiFont.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-surface text-fg">{children}</body>
    </html>
  );
}
