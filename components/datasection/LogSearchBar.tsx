"use client";

import { Loader2 } from "lucide-react";

import DateRange from "@/components/datasection/DateRange";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayNetwork } from "@/src/data/unlisted";
import { cn } from "@/lib/utils";

// THE ANCHOR LOG'S SEARCH BAR — three named criteria and ONE button (user, 2026-09-01).
//
// ⚠️ THE FIELDS ARE ALL PRESENT; THE BUTTON IS THE ONLY ACTION. Two earlier cuts got that split
// wrong in opposite directions — a submit beside every field ("don't add a button next to each
// field, I want a search button"), then a "search by" chooser that HID two criteria so one button
// could be unambiguous ("no 'search by'"). What a reader wants to see is everything they can search
// by, with one thing to press.
//
// ⚠️ A METAGRAPH SNAPSHOT ORDINAL IS MEANINGLESS WITHOUT ITS NETWORK, so that criterion is ONE
// composite field: the chain and the number, joined. Ordinals are per-chain — DOR's 27,813,700 and
// DED's are unrelated snapshots of unrelated ledgers — and the log's "all" lens is a window over
// every network at once, so there is nothing to infer from (user: "in all there are multiple
// networks, so it's needed"). Under a committed filter the picker is PRESELECTED with it ("in a
// filter you can preselect it no?"), which answers the common case without a click.
//
// The other two need no network: GLOBAL SNAPSHOT addresses the one chain everyone shares, and a
// DATE is a timestamp.
//
// ⚠️ THE LABEL CARRIES THE MEANING, NOT A PLACEHOLDER. The row this replaces put its hints inside
// the boxes, where they read as a first row of data ("the hint looks ugly"); here each field is
// named beside it, and the global-snapshot box holds no hint at all, per the user.
export default function LogSearchBar({
  networks,
  metaId,
  setMetaId,
  metaLocked,
  seeking,
  snapshot,
  tick,
  from,
  to,
  onSnapshot,
  onTick,
  onFrom,
  onTo,
  onSubmit,
  onClose,
}: {
  /** The chains that can be searched, in the order the explorer lists them. */
  networks: { id: string; label: string }[];
  metaId: string | null;
  setMetaId: (id: string) => void;
  /** True while a network is committed: the table IS that chain, so the picker states it rather
   *  than offering a choice this surface could not run (see AnchorLogTable's `searchNet`). */
  metaLocked: boolean;
  seeking: boolean;
  snapshot: string;
  tick: string;
  from: string;
  to: string;
  onSnapshot: (v: string) => void;
  onTick: (v: string) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onSubmit: () => void;
  /** Escape folds the bar away — the same key that dismisses every other transient surface here. */
  onClose: () => void;
}) {
  // ⚠️ TOUCH RAISES EVERY CONTROL IN THE BAR TOGETHER (user, 2026-09-02: "the search snapshot
  // field height is too small"). 24px was tuned for a pointer; on a coarse pointer all five
  // controls — three fields, the calendar trigger, the button — take 40px through the same
  // pointer-coarse idiom the top bar uses, so the row can never mix heights again (the exact
  // mistake the 2026-09-01 "standardize" round fixed once at h-6).
  const field =
    "min-w-0 h-6 pointer-coarse:h-10 px-1.5 py-0 bg-[var(--panel-plate)] border border-border/50 rounded-xs " +
    "font-mono text-body tabular-nums text-foreground " +
    "hover:border-border focus:border-transparent " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] transition-colors";
  // ⚠️ AND PHONE ALIGNS THE CRITERIA AS LABELLED ROWS (same user note: "the search fields need
  // some alignment"). Free-wrapped, the three labels' different widths gave every field a
  // different left edge — a ragged form. Each criterion goes full-width, the label takes one
  // fixed column and the field fills the rest, so the fields share one edge the way Fact values
  // share theirs. Desktop keeps the one-line flow untouched.
  const label = "flex-none text-micro uppercase tracking-caps text-muted-foreground max-[700px]:w-24";

  // What the one button would actually do — so it can refuse a press it has nothing to answer
  // with, rather than accepting it and reporting a miss.
  const canGo = (!!metaId && !!snapshot) || !!tick || !!from;

  return (
    <div
      // ⚠️ THE BAR IS ITS OWN BOX (user, 2026-09-01: "can you check the margins? it looks like it's
      // all a bit crammed", then "maybe put the search fields in a subtle outline"). Measured
      // before: the toolbar, this row and the table header sat at 0px from each other, three
      // stacked strips separated by nothing but their own 4-6px padding — so the criteria read as
      // more table chrome. A hairline box does both jobs at once: it groups the three criteria as
      // one thing and it buys the margin, since a box needs air on both sides to be a box.
      //
      // OUTLINE ONLY, no fill: the fields inside carry `--panel-plate`, and a plate on a plate
      // would flatten them into the container. Same weight as every other resting division here.
      className="flex-none flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border/50 px-3 py-2 mb-2"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        // Enter anywhere in the bar runs the same search the button runs — implicit submission for
        // everyone who expects it, one visible control for everyone who does not.
        if (e.key === "Enter" && canGo) { e.preventDefault(); onSubmit(); }
      }}
    >
      {/* ── METAGRAPH SNAPSHOT — the chain, then its ordinal, as one control ─────────────────── */}
      <span className="flex flex-none items-center gap-1.5 max-[700px]:w-full">
        {/* ⚠️ THE NOUN IS SAID ONCE, BY THE TOGGLE (user, 2026-09-01: "remove 'snapshot' from the
            filter texts? say 'search snapshots' instead?"). "SEARCH SNAPSHOTS" opens the bar, so
            repeating "snapshot" in all three labels only crowded them — each field names the axis
            that distinguishes it and nothing more. The aria-labels stay unabbreviated: a reader
            hears one field at a time, with no toggle above it to carry the noun. */}
        <span className={label}>metagraph</span>
        {/* ⚠️ The trigger COLLAPSES TO ITS MARK once chosen: an identity bullet and the ticker, the
            same two-part identity every row and card in this app wears (user: "you'll see the
            metagraph coloured bullet with the selected snapshot number in the field"). The two
            halves are JOINED — squared inner corners, no gap — because they are one criterion, and
            a gap between them would read as two. */}
        <Select value={metaId ?? undefined} onValueChange={setMetaId} disabled={metaLocked}>
          <SelectTrigger
            size="sm"
            aria-label="Which metagraph's chain"
            title={metaLocked ? "The log is paging this network's chain — change it in the top bar's filter" : "Which metagraph's chain the number counts on"}
            // ⚠️ `h-6!` — CSS trap 4. The primitive sizes itself with `data-[size=sm]:h-8`, an
            // attribute selector at (0,2,0) that beats a plain `h-6` at (0,1,0), so the picker sat
            // 32px tall beside 24px inputs. The important modifier is the documented escape.
            className="h-6! pointer-coarse:h-10! w-[116px] flex-none rounded-l-xs rounded-r-none border-r-0 border-border/50 bg-[var(--panel-plate)] px-1.5 py-0! text-micro uppercase tracking-caps focus-visible:ring-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
          >
            <SelectValue placeholder="network" />
          </SelectTrigger>
          <SelectContent className="rounded-btn">
            {networks.map((n) => (
              <SelectItem key={n.id} value={n.id} className="text-micro uppercase tracking-caps">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 flex-none rounded-full"
                    style={{ background: displayNetwork(n.id)?.hue ?? "var(--core)" }}
                  />
                  {n.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="text"
          inputMode="numeric"
          value={snapshot}
          aria-label="Metagraph snapshot ordinal"
          onChange={(e) => onSnapshot(e.target.value)}
          className={cn(field, "w-[124px] max-[700px]:w-auto max-[700px]:flex-1 rounded-l-none text-right")}
        />
      </span>

      {/* ── GLOBAL SNAPSHOT — no hint inside the box; the label is the hint ──────────────────── */}
      <span className="flex flex-none items-center gap-1.5 max-[700px]:w-full">
        <span className={label}>global</span>
        <input
          type="text"
          inputMode="numeric"
          value={tick}
          aria-label="Global snapshot ordinal"
          onChange={(e) => onTick(e.target.value)}
          className={cn(field, "w-[124px] max-[700px]:w-auto max-[700px]:flex-1 text-right")}
        />
      </span>

      {/* ── DATE RANGE — the calendar ───────────────────────────────────────────────────────── */}
      <span className="flex flex-none items-center gap-1.5 max-[700px]:w-full">
        <span className={label}>date</span>
        <DateRange from={from} to={to} onFrom={onFrom} onTo={onTo} onSubmit={onSubmit} />
      </span>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canGo}
        className={cn(
          // RIGHT-ALIGNED ON THE FIELDS' OWN LINE (user, 2026-09-01: "why is search on the left,
          // can't it be on the right and same line as the input fields?"). `ml-auto` pushes it to
          // the far end of whatever line it lands on, so the criteria read left-to-right and the
          // action sits where an action sits — and on a narrow pane, where the row wraps, it still
          // ends its own line rather than floating mid-row.
          "ml-auto inline-flex flex-none items-center gap-1 h-6 pointer-coarse:h-10 px-2.5 pointer-coarse:px-4 rounded-xs cursor-pointer",
          "text-micro uppercase tracking-caps transition-colors",
          "border border-[var(--primary)]/40 bg-[var(--wash-soft)] text-[var(--primary)]",
          "hover:bg-[var(--wash-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
          "disabled:opacity-30 disabled:cursor-default disabled:hover:bg-[var(--wash-soft)]",
        )}
      >
        {seeking && <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />}
        search
      </button>
    </div>
  );
}
