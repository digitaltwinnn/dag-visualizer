import { cn } from "@/lib/utils";
import NetLink from "@/components/NetLink";
import ThemeToggle from "@/components/topbar/ThemeToggle";
import ThemeController from "@/components/ThemeController";
import { BrandMark } from "@/components/brand";
import { ROUTED_VIEWS } from "@/components/views";
import { VIEW_ICONS } from "@/components/icons";

// THE DOC PAGES' SHARED HEADER (2026-09-04, user: "there is no consistency or common elements at
// all") — /about and /design used to each hand-roll (or skip) their own bar. This is the command
// bar's own material and grammar carried onto the documents: the same glass recipe TopBar wears,
// the brand cluster on the left, the VIEW SWITCH in the same position — as real links into the
// routed views (/hypergraph, /geography, /snapshots), since on a document a view is a place to
// go, not a state to set — and the theme control on the right. Arriving here now reads as the
// same instrument with a document loaded, and every route out is one click.
//
// It is a HEADER, not an instrument: the brand mark is the static BrandMark (no feed, no beat),
// there is no filter, no RAW, no network switch (a document is the same on every network — only
// ?net= rides the links via NetLink so the accent survives the round trip). The links are plain
// anchors (NetLink), not next/link: entering the visualizer boots the WebGL engine on a fresh
// document, and these pages have no client router state to preserve.
//
// ThemeToggle needs the store pair ThemeController owns, so the controller mounts here too —
// which retires the doc pages' store-free-at-runtime purity, deliberately: a theme control is
// chrome, not an instrument, and it works without a feed. The pages still import no ENGINE.
export default function SiteHeader() {
  return (
    // FIXED and full-span, exactly the command bar's box (user, 2026-09-04 — "topbar should
    // always span the view"): top-[14px] + the shared --bar-margin insets, so the bar is the
    // same width on `/`, /about and /design regardless of each document's own prose measure.
    // The doc pages pad their columns clear of it (it is out of flow now).
    <header className="fixed top-[14px] inset-x-[var(--bar-margin)] z-40">
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-3.5 pointer-events-auto",
          "border border-border rounded-lg backdrop-blur-md",
          "[background:var(--topbar-glass)]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_30px_rgba(0,0,0,0.35)]",
        )}
      >
        <NetLink
          href="/"
          title="Open the visualizer"
          className={cn(
            "flex items-center gap-3 no-underline rounded-btn -mx-1 px-1 py-0.5",
            "pointer-coarse:min-h-11",
            "hover:bg-wash-soft transition-colors duration-150 motion-reduce:transition-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          )}
        >
          <BrandMark />
          <span className="font-semibold tracking-[-0.01em] text-title whitespace-nowrap select-none max-[480px]:hidden">
            <span className="text-foreground">DAG</span>{" "}
            <span className="text-muted-foreground">Visualizer</span>
          </span>
        </NetLink>
        <span className="flex-1" />
        {/* The view switch, as navigation: same icons, same order, same resting grammar as the
            command bar's radiogroup — but links, because from a document a view is a destination.
            Labels drop on narrow widths exactly as the bar's do; the icons alone still carry the
            three marks (each keeps its title + accessible name). */}
        <nav aria-label="Visualizer views" className="flex items-center gap-0.5">
          {ROUTED_VIEWS.map((v) => {
            const Icon = VIEW_ICONS[v.id];
            return (
              <NetLink
                key={v.id}
                href={`/${v.slug}`}
                title={`Open the visualizer — ${v.name}`}
                className={cn(
                  "flex items-center gap-1.5 h-9 py-1.5 px-2.5 rounded-btn no-underline",
                  "text-muted-foreground hover:text-foreground hover:bg-wash-soft",
                  "transition-colors duration-150 motion-reduce:transition-none",
                  "pointer-coarse:min-h-11 pointer-coarse:min-w-11 max-[640px]:justify-center",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
                )}
              >
                <Icon aria-hidden className="size-4 flex-none" />
                <span className="text-label max-[640px]:sr-only">{v.name}</span>
              </NetLink>
            );
          })}
        </nav>
        <span className="w-px self-stretch bg-border my-1" />
        <ThemeToggle />
      </div>
      <ThemeController />
    </header>
  );
}
