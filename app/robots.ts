import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/src/data/site";

// Crawlers may index everything; /design is the internal styleguide (harmless but noise in
// search results) and /api serves JSON, not pages. Served at /robots.txt by Next.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/design"] },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
