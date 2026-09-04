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
import FooterViewLinks from "@/components/FooterViewLinks";
import { metagraphById } from "@/src/data/network";
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

// `overDoc` (2026-09-04): the same chrome row on the doc pages (/about, /design), so the site
// band is identical everywhere. There it rides a scrolling document instead of the canvas: no
// phone-dock offset (no dock exists), no zeroed `--footer-h` (that zero exists so app consumers
// reserve no band — a document reserves its own bottom padding instead), just the safe-area
// inset on notched phones. The doc pages pad their content bottom clear of it.
export default function SiteFooter({ overDoc = false }: { overDoc?: boolean }) {
  // The DAG core's one-home config: the official site URL and the $DAG brand mark the
  // Constellation link below wears (same record the dossier avatar reads).
  const dag = metagraphById("dag");
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
        overDoc
          ? "h-[var(--footer-phone-h)] max-[700px]:bottom-[env(safe-area-inset-bottom)]"
          : // The +min(10px, --bottom-reserve) TUCK (user, 2026-09-04): the vitals band's rounded
            // bottom corners left notches of bare scene where they met this strip's square top.
            // The strip now reaches ~10px up BEHIND the band (later in the DOM at the same z, so
            // the band paints over it) and its veil fills the corner curves — seamless join. The
            // min() ties the tuck to the band actually reserving the lane: raw pose, rails-hidden
            // and phone all zero --bottom-reserve, and a taller veil with no band above it would
            // just be a mystery band. The nav pads the same amount so the links stay centred in
            // the visible row.
            "h-[calc(var(--footer-h)+min(10px,var(--bottom-reserve,0px)))] max-[700px]:bottom-[var(--phone-dock-h)] max-[700px]:h-[var(--footer-phone-h)]",
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
          !overDoc && "pt-[min(10px,var(--bottom-reserve,0px))] max-[700px]:pt-0",
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
        {/* THE ROW IS THREE GROUPS, DIVIDED (user, 2026-09-04): app navigation, the off-scene
            doc pages, then the external world. Hairline dividers (the command bar's own device)
            separate the groups; the mid-dot separates within one. The view links appear
            EVERYWHERE (FooterViewLinks — store-driven in-app so the engine survives, plain
            anchors on docs); Home is doc-only, because inside the app "Home" and the default
            view would be two names for the same click. Phone drops the view group in both
            worlds — the header's icons and the app's own bar carry the views there. */}
        {overDoc ? (
          <>
            <NetLink href="/" className="hover:text-foreground transition-colors">
              Home
            </NetLink>
            <FooterViewLinks overDoc />
            <span aria-hidden className="w-px self-stretch bg-border mx-0.5" />
          </>
        ) : (
          <FooterViewLinks overDoc={false} />
        )}
        <NetLink href="/about" className="hover:text-foreground transition-colors">
          About
        </NetLink>
        <span aria-hidden className="opacity-40">·</span>
        <NetLink href="/design" className="hover:text-foreground transition-colors">
          Design
        </NetLink>
        <span aria-hidden className="w-px self-stretch bg-border mx-0.5" />
        {/* OUR side of the external world: the repo. "Source code", not "GitHub" (user,
            2026-09-04 — the usual OSS-footer form): the octocat glyph already says where, the
            words say what it is. The glyph is also the row's one brand mark for OUR things. */}
        <a
          href={GITHUB}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <GithubMark />
          Source code
        </a>
        {/* A hairline BETWEEN the repo and the official site (user, 2026-09-04): one is this
            project's, the other is the network's — the divider is the affiliation boundary the
            /about disclosure states in words. The link wears the official $DAG mark from the
            app's own catalog config (metagraphById("dag") — the same one-home record the
            dossier avatar and this href's siteUrl read), identifying, not claiming. */}
        <span aria-hidden className="w-px self-stretch bg-border mx-0.5" />
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
