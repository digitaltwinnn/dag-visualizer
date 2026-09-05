import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

// /about — the crawlable prose home (components/docs/AboutDoc.tsx has the content and its
// history). Since 2026-09-04 the route renders the full AppShell with the About document open
// as the DocLayer overlay: the reader gets the live scene behind the prose, in-app navigation
// never reboots the engine, and the prose still server-renders into this route's HTML for
// crawlers (which don't run WebGL and simply read the text).
export const metadata: Metadata = {
  title: "About — DAG Visualizer",
  description:
    "What DAG Visualizer is: a free, browser-based 3D visualizer of the Constellation Network. " +
    "The $DAG hypergraph, its metagraphs, the node world map, and live snapshot anchoring. " +
    "An unofficial community project.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return <AppShell doc="about" />;
}
