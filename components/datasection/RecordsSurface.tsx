"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { useStore } from "@/src/store/store";
import { useBreakpoint } from "@/components/useBreakpoint";
import AnchorLogTable from "@/components/datasection/AnchorLogTable";
import { ChannelStatePanel } from "@/components/datasection/ChannelStatePanel";
import NodeRosterTable from "@/components/datasection/NodeRosterTable";

// THE RAW LAYER'S RECORDS REGISTER (spec 2026-08-01) — the per-view raw-data table: ledger =
// the anchor log, hyper/geo = the node roster (location-first in geo). The flat placeholder
// views have no dataset yet: the same honest preview language as Blueprint, never a fabricated
// table.
//
// It is ONE of the layer's two surfaces since 2026-09-18 — `DataSection` is the dispatch that
// picks between this and the History view's document by `VIEW_POLICIES[mode].rawSurface`. The
// mode compares below are a RECORDS-internal question (which table this view's records are), not
// the surface decision, which is why they live down here and the dispatch carries none.
export default function RecordsSurface() {
  const mode = useStore((s) => s.mode);
  // PHONE: THE LIST AND THE SNAPSHOT ARE TWO PAGES (user, 2026-10-02 — `docs/superpowers/design/
  // 2026-10-02-raw-phone`, option B). Stacked in one panel the log showed seven rows of hundreds
  // and the payload was read through a 250px window, each with a scroll of its own. A row tap
  // opens the snapshot's page; "‹ Snapshots" returns to the list where it was. Presentation
  // state only — the SELECTION is the store's, as on every other tier — and it resets to the
  // list whenever the layer closes or the selection is cleared.
  const phone = useBreakpoint() === "phone";
  const [page, setPage] = useState<"list" | "detail">("list");
  const section = useStore((s) => s.section);
  const hasSel = useStore((s) => s.metaSnap != null);
  useEffect(() => {
    if (section !== "data" || !hasSel) setPage("list");
  }, [section, hasSel]);
  const onDetail = phone && page === "detail";
  return (
    // The ×-gutter is now NARROW-ONLY (user, 2026-08-14 — the pane left a dead strip on the
    // right): its recorded reason is the <1100px sideways scroll, where the sticky header slid
    // under the close mark (2026-08-02) — at desktop the tables fit and nothing runs beneath
    // the ×, so both pads match and the pane takes the width.
    // …and the ×-gutter narrows again on PHONE (2026-09-02): its 40px bought clearance for a
    // sticky header sliding sideways under the close mark, and the phone tables no longer scroll
    // sideways at all (the log and the roster both stand their measure columns down) — and BOTH
    // pads drop to 16px there: measured, the anchor log's four surviving columns need 324px and
    // the 24px pads left them 309 (DOR's ordinals are 10 digits; nothing else left to stand
    // down). The × overlaps only the toolbar row's free right end. Both arms below name the same
    // 700/1099 the shell's tiers use.
    // …and THE ROSTER KEEPS THE GUTTER AT EVERY WIDTH (user, 2026-10-03: "the x button in the raw
    // page gets in the way of the table"). "Nothing runs beneath the ×" was true of the LOG, whose
    // × stands in the detail pane's own head corner; the roster is one table across the whole
    // pane, so at desktop its header row ran under the close mark — and under a 44px target on a
    // wide touch screen. The mark gets its own column there, level with the header row.
    <div
      className={
        "h-full flex flex-col pl-6 max-[700px]:pr-3 max-[700px]:pl-3 py-3 max-[700px]:pt-2 " +
        (mode === "ledger" ? "pr-6 max-[1099px]:pr-10" : "pr-10")
      }
    >
      {mode === "ledger" ? (
        // MASTER–DETAIL (item 9, 2026-08-06): the anchor log is the index on the left; the right
        // pane renders the SELECTED metagraph snapshot's contents (the deep read + the JSON tree),
        // or its own quiet hint while nothing is selected. The pane is always present so the log
        // never reflows on selection.
        // PHONE (<700px, the shell's own tier): the split STACKS (user report 2026-08-13 — the
        // desktop shape gave the log ~1.5 columns and the pane ~170px, wrapping every fact row).
        // Log above, pane below at a fixed share with its own scroll; the divider rotates with
        // the axis (border-l → border-t).
        <div className="h-full flex gap-5 min-h-0 max-[700px]:flex-col max-[700px]:gap-3">
          <div className={"flex-1 min-w-0 min-h-0 flex flex-col" + (onDetail ? " max-[700px]:!hidden" : "")}>
            <AnchorLogTable onOpen={phone ? () => setPage("detail") : undefined} />
          </div>
          <div
            className={
              // 36% → 42% (user, 2026-10-18: "the list section can have less horizontal space …
              // that could give the details panel a bit more room"): the log's four columns fit
              // comfortably in the rest, the pane's JSON and signer tables were the cramped side.
              "w-[42%] max-w-[600px] flex-none min-w-0 flex flex-col border-l border-border/50 pl-5 " +
              // Phone: the pane is its own PAGE (see above) — the whole panel while open, absent
              // while the list is up.
              (phone && !onDetail ? "max-[700px]:hidden " : "") +
              "max-[700px]:w-auto max-[700px]:max-w-none max-[700px]:flex-1 max-[700px]:min-h-0 max-[700px]:border-l-0 max-[700px]:pl-0"
            }
          >
            {onDetail && (
              // THE PAGE'S HEAD ROW: the way back on the left and a × on the right, BOTH returning
              // to the list (user, 2026-10-18: the layer's × here closed the whole raw page while
              // it read as this pane's close). The layer's own × hides while this page is up
              // (`data-raw-detail`, SectionShell), so the one × on screen does what it looks like.
              <div data-raw-detail className="flex-none flex items-center">
                <button
                  type="button"
                  onClick={() => setPage("list")}
                  className="inline-flex items-center gap-1 h-11 -ml-1 pr-3 text-body text-primary-ink cursor-pointer bg-transparent border-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
                >
                  <ChevronLeft aria-hidden className="size-4" />
                  Snapshots
                </button>
                <button
                  type="button"
                  onClick={() => setPage("list")}
                  aria-label="Back to the snapshot list"
                  className="ml-auto -mr-2 inline-flex size-11 items-center justify-center rounded-xs cursor-pointer bg-transparent border-0 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
                >
                  <X aria-hidden className="size-[18px]" />
                </button>
              </div>
            )}
            {/* THE PANE IS ONE SCROLLING DOCUMENT ON EVERY TIER (user, 2026-10-18: "I want to
                have a scroll on the whole panel, so tabs always fully visible without their own
                scroll and height/sub-height etc only appears when scrolled to the bottom"). It was
                the phone's shape alone since 2026-10-08 ("the x button overlaps the scrollbar" —
                the head row stays put, the document scrolls under it), while desktop handed the
                lane's leftover height to one inner scroller with the foot pinned beneath it. Now
                every tier scrolls here: the tabs' box and the JSON well take their natural height
                (ChannelStatePanel's arms), and the foot is the document's last block. */}
            <div
              className={
                "block flex-1 min-h-0 " +
                // pr-2: the value column's right edge sat against the scrollbar (user, 2026-09-02).
                "pr-2 " +
                // DOWN only: 2px of a full-bleed plate's overhang drew a horizontal scrollbar along
                // its bottom (2026-10-07, the raw phone pass).
                "overflow-y-auto overflow-x-hidden slim-scroll"
              }
            >
              <ChannelStatePanel />
            </div>
          </div>
        </div>
      ) : mode === "hyper" || mode === "geo" ? (
        <NodeRosterTable mode={mode} />
      ) : (
        <p className="m-auto text-label text-muted-foreground uppercase tracking-caps">preview, in development</p>
      )}
    </div>
  );
}
