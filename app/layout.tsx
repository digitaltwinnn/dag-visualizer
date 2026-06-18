import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Absolute base for OG/canonical URLs: the production domain on Vercel, the per-deploy
// URL on previews, else localhost in dev. Avoids the "metadataBase not set" warning and
// makes the social-preview image resolve to an absolute URL.
const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

const title = "Constellation Hypergraph";
const description =
  "Interactive 3D visualizer of the Constellation Network: Global L0, Layer 1, metagraphs and live $DAG snapshots.";

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title,
  description,
  // Next auto-attaches the generated app/opengraph-image to both cards.
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary_large_image", title, description },
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
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
