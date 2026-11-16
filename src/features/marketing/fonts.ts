import { Aref_Ruqaa, Gloock } from "next/font/google";

// Display faces of the marketing site: the same ruq'ah hand and high-contrast
// serif the launch invitations use, so the site and the product read as one.
// Body text stays on the platform UI family from the root layout.
const ruqaa = Aref_Ruqaa({
  subsets: ["arabic", "latin"],
  weight: ["700"],
  display: "swap",
  variable: "--font-mk-ruqaa",
});

const serif = Gloock({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-mk-serif",
});

export const marketingFontClass = `${ruqaa.variable} ${serif.variable}`;
