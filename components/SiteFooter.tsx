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
// On the PHONE the dock owns bottom:0, so the row rides directly ABOVE it (user, 2026-08-31 —
// "keep footer link visible in phone": with the wordmark unlinked and the strip's about link
// removed, this row had become the app's ONLY route to /about, and hiding it left phone with
// none). It is overlay chrome there, like the dock itself: `--footer-h` still zeroes on the
// phone boundary so no consumer reserves a band for it — the row takes its 26px height
// explicitly, and an open sheet (higher z) covers it exactly as it covers the scene.
//
// The links are plain anchors, not next/link: /about and /design are ordinary documents, and a
// client-side route change would tear down and rebuild the WebGL engine (the same reason TopBar's
// brand link is an <a>).
//
// ⚠️ NO DONATE LINK. The user asked for one and the project carries no donation destination — an
// invented address is a fabricated fact of the worst kind (rule 10). Add the entry here the moment
// a real one exists.
import NetLink from "@/components/NetLink";
import { cn } from "@/lib/utils";

const GITHUB = "https://github.com/digitaltwinnn/dag-visualizer";

// `overDoc` (2026-09-04): the same chrome row on the doc pages (/about, /design), so the site
// band is identical everywhere. There it rides a scrolling document instead of the canvas: no
// phone-dock offset (no dock exists), no zeroed `--footer-h` (that zero exists so app consumers
// reserve no band — a document reserves its own bottom padding instead), just the safe-area
// inset on notched phones. The doc pages pad their content bottom clear of it.
export default function SiteFooter({ overDoc = false }: { overDoc?: boolean }) {
  return (
    // pointer-events-none on the band, auto on the links: the strip spans the full width over the
    // canvas, and an orbit drag started along the bottom edge must still reach the scene.
    <footer
      id="sitefoot"
      className={cn(
        "fixed inset-x-0 bottom-0 z-10 flex items-center justify-center pointer-events-none",
        overDoc
          ? "h-[var(--footer-phone-h)] max-[700px]:bottom-[env(safe-area-inset-bottom)]"
          : "h-[var(--footer-h)] max-[700px]:bottom-[var(--phone-dock-h)] max-[700px]:h-[var(--footer-phone-h)]",
      )}
    >
      {/* The halo text-shadow is GONE (user, 2026-08-30: "it has some shadow which for text is
          not great") — it existed for bloom sweeping the bottom edge, but the vitals band now
          stands between the scene and this line in every 3D view, so the wash-out it answered
          no longer reaches here. Readability comes from real ink instead: full muted-foreground,
          up from the /70 tint.
          …AND FROM A GROUND, since 2026-09-01 (user: "background of text — should it be
          transparent or a subtle fill to keep it readable on the scene?"). A LOZENGE sized to the
          links, never a full-width scrim: the failure is LOCAL — the line only washes out where a
          bright scene element passes under it (the ledger's lit floor, a bloomed node), a few
          hundred pixels of a very wide row — and a scrim spanning the viewport would turn quiet
          site chrome into a second command bar directly under the vitals band. The plate is the
          `--footer-glass`, a flat low-alpha veil rather than the band's lit `--topbar-glass`
          surface (user, 2026-09-01 — that one was "too dominant white" in light mode; see the
          token's own note). NO BORDER: a border would make this a card, and it is not an
          instrument. */}
      <nav className="flex items-center gap-2 text-micro text-muted-foreground [&_a]:pointer-events-auto rounded-full px-2.5 py-0.5 bg-[var(--footer-glass)] backdrop-blur-sm max-[700px]:[&_a]:pt-[26px] max-[700px]:[&_a]:-mt-[26px] max-[700px]:[&_a]:pb-1.5 max-[700px]:[&_a]:-mb-1.5 max-[700px]:[&_a]:px-1.5 max-[700px]:[&_a]:-mx-1.5">
        {/* ⚠️ On phone every anchor wears padding CANCELLED by an equal negative margin (the
            utility pairs above): the row keeps its 22px visual height while each link's HIT BOX
            grows to ~43px — measured 11px tall before, a quarter of the 44px touch floor, and on
            phone this row rides above the dock as live chrome, not decoration. The expansion is
            ASYMMETRIC on purpose: upward 26px into inert canvas, downward only to the dock's own
            top edge — measured, a symmetric pad reached 14px INTO the dock and this nav's
            stacking order let the links win those taps off the dock's buttons (the z the dock
            carries lives inside the shell's own stacking context, so it never competes here).
            Desktop is untouched: a pointer needs no floor. */}
        <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
          GitHub
        </a>
        <span aria-hidden className="opacity-40">·</span>
        <NetLink href="/about" className="hover:text-foreground transition-colors">
          About
        </NetLink>
        <span aria-hidden className="opacity-40">·</span>
        <NetLink href="/design" className="hover:text-foreground transition-colors">
          Design
        </NetLink>
        <span aria-hidden className="opacity-40">·</span>
        {/* The disclaimer is a STATEMENT, not navigation — it reads at rest and links to the
            section that states it in full. Same words as /about#unofficial leads with. */}
        <NetLink href="/about#unofficial" className="hover:text-foreground transition-colors">
          Unofficial community project
        </NetLink>
      </nav>
    </footer>
  );
}
