import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { SITE_ORIGIN } from "@/src/data/site";
import "./globals.css";

// Absolute base for OG/canonical URLs: the production domain on Vercel, the per-deploy
// URL on previews, else localhost in dev. Avoids the "metadataBase not set" warning and
// makes the social-preview image resolve to an absolute URL.
const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

// SEO copy (2026-07-10, user-approved): the title carries the BRAND (= the domain, "DAG
// Visualizer") + the terms people actually search (Constellation Network, DAG); the
// description carries the long-tail keywords ($DAG, metagraphs, snapshots, node map).
const title = "DAG Visualizer — live 3D map of the Constellation Network";
const description =
  "Interactive 3D visualizer of the Constellation Network: explore the $DAG hypergraph, " +
  "metagraphs, the node world map, and live global snapshot settlement in real time.";

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title,
  description,
  alternates: { canonical: "/" },
  // Next auto-attaches the generated app/opengraph-image to both cards.
  openGraph: { title, description, type: "website", url: "/", siteName: "DAG Visualizer" },
  twitter: { card: "summary_large_image", title, description },
};

// Structured data: one WebApplication record so search engines understand what this is
// (a free, browser-based network visualizer) — rendered as a static JSON-LD script.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "DAG Visualizer",
  url: SITE_ORIGIN,
  description,
  applicationCategory: "Data visualization",
  operatingSystem: "Web browser",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  about: {
    "@type": "Thing",
    name: "Constellation Network ($DAG)",
    url: "https://constellationnetwork.io",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <script
          type="application/ld+json"
          // Static, build-time literal — nothing user-controlled flows in.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
