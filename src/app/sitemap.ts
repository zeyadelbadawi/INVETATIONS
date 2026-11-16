import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { marketingPaths, siteOrigin } from "@/features/marketing/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return marketingPaths.flatMap((path) =>
    locales.map((lang) => ({
      url: `${origin}/${lang}${path}`,
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : 0.7,
      alternates: { languages: Object.fromEntries(locales.map((l) => [l, `${origin}/${l}${path}`])) },
    })),
  );
}
