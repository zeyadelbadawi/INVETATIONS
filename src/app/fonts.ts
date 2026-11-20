import { Alexandria, IBM_Plex_Sans_Arabic } from "next/font/google";

// One family covers Arabic and Latin for the platform's own surfaces.
// Invitation templates bring their own font pairs.
export const uiFont = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-ui",
});

// Display face of the public site: one variable family for Arabic and Latin,
// so both languages carry the same voice (redesign plan §4).
export const siteDisplayFont = Alexandria({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-display-site",
});
