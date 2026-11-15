import { Aref_Ruqaa, Gloock } from "next/font/google";

// The "classic" font pair of the launch templates. Arabic display is a ruq'ah
// hand (the script of Egyptian shop signs and wedding cards); Latin display and
// every large numeral use a warm high-contrast serif. Body text stays on the
// platform's UI family, which covers both scripts.
export const displayAr = Aref_Ruqaa({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-display-ar",
});

export const displayEn = Gloock({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-display-en",
  preload: false,
});

export const inviteFontClass = `${displayAr.variable} ${displayEn.variable}`;
