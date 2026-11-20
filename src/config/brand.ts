// Placeholder brand. The real name, logo and palette replace this file and the
// --brand-* tokens in src/app/globals.css; nothing else references them directly.
export const brand = {
  name: { ar: "لَمّة", en: "Lamma" },
  tagline: {
    ar: "دعوتك، بشكل ما حدش شافه قبل كده",
    en: "Invitations people actually play with",
  },
  // International format without "+" or spaces (e.g. "201001234567"); empty hides the WhatsApp buttons.
  supportWhatsApp: "201069942554",
  // Where hosts send manual transfers, shown on the Publish page with a copy
  // button. Empty values are hidden; with both empty the page says how we will
  // get in touch instead. Filled in by the owner.
  payments: {
    // InstaPay address or account, e.g. "lamma@instapay".
    instapay: "01069942554",
    // Mobile wallet number (Vodafone Cash, etc.), e.g. "01001234567".
    wallet: "01069942554",
    // The name the sender sees on InstaPay / the wallet before confirming, so they know it is us.
    holder: "Ziad Gehad Mohamed",
  },
  social: { instagram: "", facebook: "", tiktok: "" },
} as const;
