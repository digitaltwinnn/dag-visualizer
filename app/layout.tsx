import type { Metadata, Viewport } from "next";
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

// The browser-chrome pass (2026-09-03, the phone review's real-device items):
//  · themeColor — the address bar / task-switcher chrome takes the app ground per scheme
//    (the oklch tokens' own hex mirrors, from globals.css's inline notes) instead of default
//    white over a black instrument.
//  · viewportFit cover — without it env(safe-area-inset-*) is 0 on notched iPhones and the
//    home indicator overlays the dock; WITH it the page extends under the notch, so the dock's
//    own height token carries the bottom inset (globals.css --phone-dock-h).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05060e" },
    { media: "(prefers-color-scheme: light)", color: "#ebedf3" },
  ],
};

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
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Stamp the network on <html> BEFORE anything paints, so the [data-net] accent
            override applies from the first frame. Inline because a layout cannot read
            searchParams and middleware would make every page dynamic; the regex mirrors
            src/net/parse.ts's validator (an inline script cannot import). CSP already
            allows 'unsafe-inline' (next.config.mjs). suppressHydrationWarning on <html>
            covers the pre-hydration dataset write. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){var m=/[?&]net=(integrationnet|testnet)(?:&|$)/.exec(location.search);if(m)document.documentElement.dataset.net=m[1];})();',
          }}
        />
        {/* Theme stamp — the data-net script's twin: pin data-theme BEFORE first paint iff an
            explicit choice is stored. Absence = System = no attribute (color-scheme: light dark
            lets the browser resolve). Mirrors src/theme/resolve.ts's two-value check. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("dagviz:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();',
          }}
        />
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
