import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/src/data/site";

// The root + the crawlable /about prose page (the views are store state, not routes;
// /design is styleguide-internal and disallowed in robots). Served at /sitemap.xml by Next.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_ORIGIN,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_ORIGIN}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
