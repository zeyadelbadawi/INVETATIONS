// Where "report this page" goes (security rule 21). Until the staff queue has a
// public form, this is a mail link when an address is configured, otherwise the
// marketing site's contact anchor.
export function reportHref(slug: string, locale: "ar" | "en", subject: string): string {
  const email = process.env.NEXT_PUBLIC_REPORT_EMAIL;
  if (email && /^[^\s@]+@[^\s@]+$/.test(email)) return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
  return `/${locale}?report=${encodeURIComponent(slug)}#contact`;
}
