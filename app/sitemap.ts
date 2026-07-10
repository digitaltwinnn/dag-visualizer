import type { MetadataRoute } from "next";

// One-page app: the root is the only indexable URL (the views are store state, not routes;
// /design is styleguide-internal and disallowed in robots). Served at /sitemap.xml by Next.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://dagvisualizer.io",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
