// THE SITE FOOTER (user, 2026-08-18 — "navigation to About is difficult to find behind the logo").
// The brand mark in the command bar was the app's ONLY route to /about, and a wordmark is a weak
// affordance for "there is a page here". This is the second route, and the one the project's own
// off-instrument pages live behind.
//
// It is SITE chrome, not view chrome — one row, the same in every view and both depth poses — so it
// mounts OUTSIDE SectionShell beside TopBar (CSS trap 2: a transformed ancestor would re-anchor its
// fixed box, and the shell also `inert`s whichever layer is away). Its band is the static
// `--footer-h` token, which everything above it adds to its own bottom inset exactly as the rails
// add `--topbar-extra` at the top; `--bottom-reserve` keeps its meaning as the lane's own band above
// the footer.
//
// Hidden on the PHONE, where the 56px dock owns the bottom edge and the brand→/about route is
// unchanged. The token zeroes on the same boundary, so nothing keeps reserving the space.
//
// The links are plain anchors, not next/link: /about and /design are ordinary documents, and a
// client-side route change would tear down and rebuild the WebGL engine (the same reason TopBar's
// brand link is an <a>).
//
// ⚠️ NO DONATE LINK. The user asked for one and the project carries no donation destination — an
// invented address is a fabricated fact of the worst kind (rule 10). Add the entry here the moment
// a real one exists.
const GITHUB = "https://github.com/digitaltwinnn/dag-visualizer";

export default function SiteFooter() {
  return (
    // pointer-events-none on the band, auto on the links: the strip spans the full width over the
    // canvas, and an orbit drag started along the bottom edge must still reach the scene.
    <footer
      id="sitefoot"
      className="fixed inset-x-0 bottom-0 z-10 h-[var(--footer-h)] flex items-center justify-center pointer-events-none max-[699px]:hidden"
    >
      <nav className="flex items-center gap-2 text-micro text-muted-foreground/70 [&_a]:pointer-events-auto">
        <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
          GitHub
        </a>
        <span aria-hidden className="opacity-40">·</span>
        <a href="/about" className="hover:text-foreground transition-colors">
          About
        </a>
        <span aria-hidden className="opacity-40">·</span>
        <a href="/design" className="hover:text-foreground transition-colors">
          Design
        </a>
        <span aria-hidden className="opacity-40">·</span>
        {/* The disclaimer is a STATEMENT, not navigation — it reads at rest and links to the
            section that states it in full. Same words as /about#unofficial leads with. */}
        <a href="/about#unofficial" className="hover:text-foreground transition-colors">
          Unofficial community project
        </a>
      </nav>
    </footer>
  );
}
