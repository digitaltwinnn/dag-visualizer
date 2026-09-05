import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { ROUTED_VIEWS, viewTitle } from "@/components/views";

// The routed 3D views (2026-09-04): /hypergraph, /geography, /snapshots — the same AppShell as
// `/`, differing only in metadata. The routes exist so analytics see per-view traffic, links
// deep-link into a view, and a shared URL carries a view-specific title/description; which view
// actually shows is store state (RouteSync seeds it from the pathname on mount). In-app switches
// move between these URLs by shallow pushState, never navigation — the engine must survive.
//
// Static by construction: the three params are generated at build and anything else 404s, so a
// pushState URL and a hard navigation can never disagree about what exists.
export const dynamicParams = false;

export function generateStaticParams() {
  return ROUTED_VIEWS.map((v) => ({ view: v.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ view: string }> }): Promise<Metadata> {
  const { view } = await params;
  const def = ROUTED_VIEWS.find((v) => v.slug === view)!;
  const title = viewTitle(def.name);
  return {
    title,
    description: def.desc,
    alternates: { canonical: `/${def.slug}` },
    openGraph: { title, description: def.desc, type: "website", url: `/${def.slug}`, siteName: "DAG Visualizer" },
    twitter: { card: "summary_large_image", title, description: def.desc },
  };
}

export default function ViewPage() {
  return <AppShell />;
}
