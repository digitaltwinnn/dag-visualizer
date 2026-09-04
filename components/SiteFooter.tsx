"use client";
// THE SITE FOOTER (user, 2026-08-18 — "navigation to About is difficult to find behind the logo").
// The brand mark in the command bar was the app's ONLY route to /about, and a wordmark is a weak
// affordance for "there is a page here". This row is the durable second route — and since the doc
// overlay landed (2026-09-04) it is ONE footer for every surface: the doc pages render inside the
// app, so the `overDoc` variant retired with the standalone pages.
//
// It is SITE chrome, not view chrome — one row, the same in every view, both depth poses and
// under the doc overlay (it is the overlay's chrome: its About/Design toggles live here) — so it
// mounts OUTSIDE SectionShell beside TopBar (CSS trap 2: a transformed ancestor would re-anchor
// its fixed box, and the shell also `inert`s whichever layer is away). Its band is the static
// `--footer-h` token, which everything above it adds to its own bottom inset exactly as the rails
// add `--topbar-extra` at the top; `--bottom-reserve` keeps its meaning as the lane's own band
// above the footer.
//
// On the PHONE the dock owns bottom:0, so the row rides directly ABOVE it (user, 2026-08-31 —
// "keep footer link visible in phone"). It is overlay chrome there, like the dock itself:
// `--footer-h` still zeroes on the phone boundary so no consumer reserves a band for it. While a
// DOC overlay is open the dock is stood down (DocGate), so the row drops to the safe-area bottom.
//
// About/Design are STORE TOGGLES now, not navigations — a navigation would reboot the engine the
// overlay deliberately keeps alive; the hrefs stay real so middle-click/new-tab work. The view
// links commit the same way (FooterViewLinks).
//
// ⚠️ NO DONATE LINK. The user asked for one and the project carries no donation destination — an
// invented address is a fabricated fact of the worst kind (rule 10). Add the entry here the moment
// a real one exists.
import NetLink from "@/components/NetLink";
import FooterViewLinks from "@/components/FooterViewLinks";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import type { DocPage } from "@/components/views";
import { cn } from "@/lib/utils";

const GITHUB = "https://github.com/digitaltwinnn/dag-visualizer";
const CONSTELLATION = "https://constellationnetwork.io";

// The GitHub BRAND mark, inline (2026-09-04): lucide dropped its brand icons, and the house
// rule is monochrome SVG on currentColor, never emoji — the same reasoning that keeps the ECG
// mark and identity dots bespoke. The octocat sets the external repo link apart from the
// internal doc links beside it (user: "make a visual distinction … gh icon").
function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden className="flex-none">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

// A doc-page toggle: a real link whose plain click flips the overlay in place (clicking the open
// page's own entry closes it — back to the scene).
function DocToggle({ page, href, children }: { page: DocPage; href: string; children: React.ReactNode }) {
  const doc = useStore((s) => s.docPage);
  const setDocPage = useStore((s) => s.setDocPage);
  return (
    <NetLink
      href={href}
      aria-current={doc === page ? "page" : undefined}
      className={cn("hover:text-foreground transition-colors", doc === page && "text-foreground")}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        setDocPage(doc === page ? null : page);
      }}
    >
      {children}
    </NetLink>
  );
}

export default function SiteFooter() {
  // The DAG core's one-home config: the official site URL and the $DAG brand mark the
  // Constellation link below wears (same record the dossier avatar reads).
  const dag = metagraphById("dag");
  const doc = useStore((s) => s.docPage);
  return (
    // pointer-events-none on the band, auto on the links: an orbit drag started along the bottom
    // edge must still reach the scene. FULL-WIDTH STRIP since 2026-09-04 (user: the centred
    // lozenge read as "a tiny element at the centre" under the full-span vitals band): the row
    // spans the same --bar-margin insets as the two bars, its veil (--footer-glass) is the whole
    // strip's ground, and in the app it sits flush under the vitals band as that instrument's
    // underline — the lit plate above, the flat veil below, told apart by the transparency
    // difference the two glass tokens already carry. No border, no radius: a veil, not a card.
    <footer
      id="sitefoot"
      className={cn(
        "fixed inset-x-[var(--bar-margin)] bottom-0 z-10 flex items-stretch pointer-events-none",
        // The +min(10px, --bottom-reserve) TUCK (user, 2026-09-04): the vitals band's rounded
        // bottom corners left notches of bare scene where they met this strip's square top.
        // The strip reaches ~10px up BEHIND the band (later in the DOM at the same z, so the
        // band paints over it) and its veil fills the corner curves — seamless join. The min()
        // ties the tuck to the band actually reserving the lane: raw pose, rails-hidden, phone
        // and the doc overlay (DocGate unmounts BottomStream, whose cleanup zeroes the reserve)
        // all fold it away.
        "h-[calc(var(--footer-h)+min(10px,var(--bottom-reserve,0px)))]",
        // Phone: above the dock normally; at the safe-area bottom while a doc overlay has the
        // dock stood down.
        doc == null
          ? "max-[700px]:bottom-[var(--phone-dock-h)] max-[700px]:h-[var(--footer-phone-h)]"
          : "max-[700px]:bottom-[env(safe-area-inset-bottom)] max-[700px]:h-[var(--footer-phone-h)]",
      )}
    >
      {/* Readability history, still load-bearing: no text-shadow halo (user, 2026-08-30 — the
          vitals band now stands between the scene and this line), ink at full muted-foreground,
          and a real GROUND under the words. That ground was a link-sized lozenge from 2026-09-01
          until 2026-09-04, when the row went full-width under the full-span vitals band (user:
          the centred pill read as a stray element; the strip is now the band's underline). The
          plate stays `--footer-glass` — a flat low-alpha veil, deliberately NOT the band's lit
          `--topbar-glass` (too dominant white in light mode), and that fill difference is what
          separates the two rows now that they touch. */}
      <nav
        className={cn(
          "flex-1 flex items-center justify-center gap-2 text-micro text-muted-foreground [&_a]:pointer-events-auto bg-[var(--footer-glass)] backdrop-blur-sm",
          "max-[700px]:[&_a]:pt-[26px] max-[700px]:[&_a]:-mt-[26px] max-[700px]:[&_a]:pb-1.5 max-[700px]:[&_a]:-mb-1.5 max-[700px]:[&_a]:px-1.5 max-[700px]:[&_a]:-mx-1.5",
          "pt-[min(10px,var(--bottom-reserve,0px))] max-[700px]:pt-0",
        )}
      >
        {/* ⚠️ On phone every anchor wears padding CANCELLED by an equal negative margin (the
            utility pairs above): the row keeps its 22px visual height while each link's HIT BOX
            grows to ~43px — measured 11px tall before, a quarter of the 44px touch floor, and on
            phone this row rides above the dock as live chrome, not decoration. The expansion is
            ASYMMETRIC on purpose: upward 26px into inert canvas, downward only to the dock's own
            top edge — measured, a symmetric pad reached 14px INTO the dock and this nav's
            stacking order let the links win those taps off the dock's buttons (the z the dock
            carries lives inside the shell's own stacking context, so it never competes here).
            Desktop is untouched: a pointer needs no floor. */}
        {/* THE ROW IS THREE GROUPS, ONE SEPARATOR (user, 2026-09-04, two rounds): app
            navigation, the off-scene doc pages, then the external world. Group hairlines were
            tried and pulled the same day — with the tuck they ran the strip's full height and
            "cut the whole section in half" — so the mid-dot is the row's ONE separator species,
            and what sets the external group apart is its brand marks, not a divider. Home
            retired with the standalone pages: closing the doc is what every view link and the
            brand already do. Phone drops the view group (the header's… the BAR's own switch
            carries the views there). */}
        <FooterViewLinks />
        <DocToggle page="about" href="/about">
          About
        </DocToggle>
        <span aria-hidden className="opacity-40">·</span>
        <DocToggle page="design" href="/design">
          Design
        </DocToggle>
        <span aria-hidden className="opacity-40">·</span>
        <a
          href={GITHUB}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <GithubMark />
          Source code
        </a>
        <span aria-hidden className="opacity-40">·</span>
        {/* The repo and the official site stay clearly TWO things — one is this project's, the
            other is the network's (the affiliation boundary /about states in words) — told apart
            by each link's own brand mark (the one-separator rule above). The Constellation link
            wears the official $DAG mark from the app's own catalog config (metagraphById("dag")
            — the same one-home record the dossier avatar and this href's siteUrl read),
            identifying, not claiming. */}
        <a
          href={dag?.siteUrl ?? CONSTELLATION}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {dag?.iconUrl && (
            // A 12px brand dot: plain <img>, round like every brand icon (the dossier avatar's
            // own rule) — Radix Avatar's load machinery is a client concern this static row
            // doesn't need.
            <img src={dag.iconUrl} alt="" width={12} height={12} className="rounded-full flex-none" />
          )}
          Constellation
        </a>
        {/* The "Unofficial community project" entry is GONE (user, 2026-09-04): styled like its
            nav neighbours it read as a fourth destination, which is inconsistent for a statement
            — and the disclosure it pointed at is /about's own job (#unofficial), one click away
            behind the About link. Don't re-add it as a link; if it ever returns it returns as
            plain non-link text. */}
      </nav>
    </footer>
  );
}
