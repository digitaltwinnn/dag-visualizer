import type { MetadataRoute } from "next";

// THE WEB APP MANIFEST (2026-09-03, the phone review's install item) — the cheap PWA tier: what
// it buys is the HOME-SCREEN INSTALL as an app rather than a bookmark. The app is designed as a
// long-lived fullscreen instrument (the desktop idiom is a persistent open tab); on a phone that
// idiom is `display: standalone` — opened from the home screen it gets the whole viewport, no
// address bar or browser toolbars around the scene. Deliberately NOTHING heavier: no service
// worker, no offline cache, no push — a live instrument over a live feed has nothing honest to
// show offline (rule 10), and a cached stale scene would be a fabricated one.
//
// Icons: the launcher pair (192/512, the brand mark's own rounded square) plus a MASKABLE 512 —
// Android crops installs to a circle/squircle, so that one holds the trace in the central safe
// zone on a full-bleed ground (generated from app/icon.svg by the same sharp pipeline the icon
// validity test runs; app/appIcons.test.ts asserts all of them decode). iOS ignores manifest
// icons and takes app/apple-icon.png instead — full-bleed square, since iOS rounds the corners
// itself. Colours mirror the viewport export in layout.tsx: the dark ground, matching the boot
// scene the splash hands over to.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DAG Visualizer",
    short_name: "DAG Visualizer",
    description: "Live 3D map of the Constellation Network — its metagraphs, nodes and snapshots.",
    start_url: "/",
    display: "standalone",
    background_color: "#05060e",
    theme_color: "#05060e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
