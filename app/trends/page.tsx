import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

// /trends — three months of the network, measured daily (components/docs/TrendsDoc.tsx has the
// content; the data is /api/trends' 90d window). Renders the full AppShell with the Trends
// document open as the DocLayer overlay, like /about and /design. Robots-disallowed for now:
// the page's substance is client-fetched charts, so there is nothing for a crawler here — flip
// this if the doc ever grows server-rendered prose worth indexing.
export const metadata: Metadata = {
  title: "Trends — DAG Visualizer",
  robots: { index: false, follow: false },
  alternates: { canonical: undefined },
};

export default function TrendsPage() {
  return <AppShell doc="trends" />;
}
