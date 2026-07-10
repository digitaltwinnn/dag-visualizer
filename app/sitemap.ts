import type { MetadataRoute } from "next";

// The root + the crawlable /about prose page (the views are store state, not routes;
// /design is styleguide-internal and disallowed in robots). Served at /sitemap.xml by Next.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://dagvisualizer.io",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://dagvisualizer.io/about",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
