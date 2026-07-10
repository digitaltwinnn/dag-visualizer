// The canonical production origin — ONE constant for every absolute self-reference
// (robots, sitemap, JSON-LD). Page metadata still derives its base from the Vercel env
// (layout.tsx) so previews resolve their own asset URLs; these three are meant to point
// at PRODUCTION regardless of where they render.
export const SITE_ORIGIN = "https://dagvisualizer.io";
