import type { MetadataRoute } from "next";
import { siteOrigin } from "@/features/marketing/site";

// Only the marketing pages are for search engines. Invitations, link entry, the
// secret keeper, previews, the API, the dashboard and the back office are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/i/", "/l/", "/k", "/preview", "/api/", "/*/app", "/*/admin"],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
