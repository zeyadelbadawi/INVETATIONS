import { IBM_Plex_Sans_Arabic } from "next/font/google";

// One family covers Arabic and Latin for the platform's own surfaces.
// Invitation templates bring their own font pairs.
export const uiFont = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-ui",
});
