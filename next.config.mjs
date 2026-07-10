// Security headers (2026-07-10): added after the production domain — two weeks old at the
// time — was sent to Zscaler Browser Isolation on a corporate network. The isolation itself
// is a newly-registered-domain policy (it ages out; re-categorization requested via
// sitereview.zscaler.com), but reputation scanners also factor the security-header posture
// into their risk scores, and these are good hygiene regardless.
//
// The CSP is deliberately MODERATE, shaped by what the app actually does client-side:
//  - script/style 'unsafe-inline': the Next.js App Router runtime bootstraps with inline
//    scripts (no nonce plumbing here), and styles are inlined by the design system.
//  - img https:  — the dossier Avatar loads metagraph logos from their own (arbitrary) sites.
//  - connect https: — NetworkData polls the Constellation block explorer + raw-L0 hosts and
//    the client geo resolver calls ipwho.is; all HTTPS, but the host set isn't closed.
//  - worker blob:  — three.js may spawn blob workers (KTX/loader paths).
//  - frame-ancestors 'none' (+ legacy X-Frame-Options DENY): nothing embeds this app.
// Dev additions: 'unsafe-eval' (react-refresh), ws: (HMR), http: (the ip-api dev-only geo path).
const dev = process.env.NODE_ENV !== "production";
// Preview deployments inject the Vercel feedback toolbar from vercel.live — allow it there
// only (production + dev stay closed); the toolbar-thread workflow depends on it.
const preview = process.env.VERCEL_ENV === "preview";
const vercelLive = preview ? " https://vercel.live" : "";

const csp = [
  "default-src 'self'",
  // va.vercel-scripts.com: the @vercel/analytics + speed-insights loaders (dev pulls debug
  // builds from that CDN; production serves them same-origin under /_vercel/ — allowlisted
  // in both so a loader-path change never silently breaks telemetry).
  `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${vercelLive}${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https:${preview ? " wss://vercel.live" : ""}${dev ? " ws: http:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // vercel.live frames the preview toolbar UI; production keeps frames fully closed.
  `frame-src 'self'${vercelLive}`,
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
