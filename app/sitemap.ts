import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/src/data/site";
import { ROUTED_VIEWS } from "@/components/views";

// The root, the three routed views (app/[view] — real URLs since 2026-09-04) and the crawlable
// /about prose page. /design is styleguide-internal and disallowed in robots. Served at
// /sitemap.xml by Next.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_ORIGIN,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    ...ROUTED_VIEWS.map((v) => ({
      url: `${SITE_ORIGIN}/${v.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    {
      url: `${SITE_ORIGIN}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
  ];
}
