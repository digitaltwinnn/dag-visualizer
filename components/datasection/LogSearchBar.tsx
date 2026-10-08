"use client";

import { Loader2, Search, X } from "lucide-react";

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
/** The "no chain chosen" row's value. Radix reserves the empty string for the placeholder, so the
 *  unscoped state needs a sentinel of its own; it is mapped back to `null` at the boundary below,
 *  and nothing outside this file ever sees it. */
const ANY_NET = "__any";

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
  miss,
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
  setMetaId: (id: string | null) => void;
  /** True while a network is committed: the table IS that chain, so the picker states it rather
   *  than offering a choice this surface could not run (see AnchorLogTable's `searchNet`). */
  metaLocked: boolean;
  seeking: boolean;
  snapshot: string;
  tick: string;
  from: string;
  to: string;
  /** The last search's refusal or miss — answered HERE, beside the button that asked (user,
   *  2026-09-09: the message used to sit by the pager, a screen away from the press, and the
   *  search read as simply not working). */
  miss?: string | null;
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
  //
  // ⚠️ AND LEGIBLE AT REST (user, 2026-09-29: "the search control is tiny, the filter hints as
  // well" — design round `.superpowers/brainstorm/…/search-options.html`, desktop A + phone A).
  // 24px fields under 10.5px caps labels read as fine print; the bar is 32px now, 44px on touch
  // and on the phone, where the inputs also take 16px text — iOS zooms the page into any focused
  // input set smaller, which on this layer would throw the reader off the log.
  const field =
    "min-w-0 h-8 pointer-coarse:h-11 max-[700px]:h-11 px-2.5 py-0 bg-[var(--panel-plate)] border border-border/70 rounded-xs max-[700px]:rounded-btn " +
    "font-mono text-body max-[700px]:text-base tabular-nums text-foreground " +
    "hover:border-border focus:border-transparent " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] transition-colors";
  // ⚠️ AND PHONE ALIGNS THE CRITERIA AS LABELLED ROWS (same user note: "the search fields need
  // some alignment"). Free-wrapped, the three labels' different widths gave every field a
  // different left edge — a ragged form. Each criterion goes full-width, the label takes one
  // fixed column and the field fills the rest, so the fields share one edge the way Fact values
  // share theirs. Desktop keeps the one-line flow untouched.
  //
  // The labels are sentence-case body text in the dim ink (they were micro caps in the muted one —
  // the "filter hints" the user found tiny). On the PHONE they stand ABOVE their fields in the
  // sheet, so every field takes the full width and no label column eats the ordinal's room (the
  // ordinal field measured 76px there beside a 96px label column).
  const label = "flex-none text-body text-foreground-dim";
  const criterion = "flex flex-none items-center gap-2.5 max-[700px]:w-full max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:gap-2";

  // What the one button would actually do. Any typed criterion ENABLES it — including a
  // metagraph ordinal with no chain picked, which the handler answers with "pick which
  // metagraph's chain…" (user, 2026-09-09: the old refusal was a silently-disabled button,
  // which read as the search simply not working; a press that gets an ANSWER teaches, a
  // grey button explains nothing).
  const canGo = !!snapshot || !!tick || !!from;

  return (
    <>
    {/* THE PHONE SHEET'S VEIL (design round phone A): the bar rises over the log instead of pushing
        it down — open, it took ~40% of the screen and left the table two rows. A tap on the veil
        folds it like Escape. Phone only; the raw panel's backdrop-filter makes the panel this
        `fixed` layer's containing block, so veil and sheet stay inside the log's own glass. */}
    <div aria-hidden onClick={onClose} className="hidden max-[700px]:block fixed inset-0 z-40 bg-black/50" />
    <div
      role="search"
      aria-label="Search snapshots"
      // ⚠️ THE BAR IS ITS OWN BOX (user, 2026-09-01: "can you check the margins? it looks like it's
      // all a bit crammed", then "maybe put the search fields in a subtle outline"). Measured
      // before: the toolbar, this row and the table header sat at 0px from each other, three
      // stacked strips separated by nothing but their own 4-6px padding — so the criteria read as
      // more table chrome. A hairline box does both jobs at once: it groups the three criteria as
      // one thing and it buys the margin, since a box needs air on both sides to be a box.
      //
      // OUTLINE ONLY, no fill: the fields inside carry `--panel-plate`, and a plate on a plate
      // would flatten them into the container. Same weight as every other resting division here.
      className={cn(
        "flex-none flex flex-wrap items-center gap-x-7 gap-y-2 rounded-md border border-border/60 px-3.5 py-3 mb-2",
        // PHONE: a bottom sheet — hairline top edge, rounded top, the panel's own glass ground.
        "max-[700px]:fixed max-[700px]:inset-x-0 max-[700px]:bottom-0 max-[700px]:z-50 max-[700px]:mb-0",
        "max-[700px]:flex-col max-[700px]:flex-nowrap max-[700px]:items-stretch max-[700px]:gap-4",
        "max-[700px]:rounded-none max-[700px]:rounded-t-[18px] max-[700px]:border-0 max-[700px]:border-t max-[700px]:border-border",
        "max-[700px]:px-5 max-[700px]:pt-2 max-[700px]:pb-6 max-[700px]:[background:var(--topbar-glass),var(--background)]",
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        // Enter anywhere in the bar runs the same search the button runs — implicit submission for
        // everyone who expects it, one visible control for everyone who does not.
        if (e.key === "Enter" && canGo) { e.preventDefault(); onSubmit(); }
      }}
    >
      {/* The sheet's head — grabber and title with its close — phone only. Desktop keeps the
          toolbar's toggle as the one way in and out. */}
      <div className="hidden max-[700px]:flex flex-col gap-2">
        <span aria-hidden className="self-center h-1 w-10 rounded-full bg-foreground-dim/35" />
        <div className="flex items-center justify-between">
          <span className="text-title font-semibold">Search snapshots</span>
          <button type="button" onClick={onClose} aria-label="Close search" className="-mr-3 inline-flex size-11 items-center justify-center rounded-btn text-muted-foreground hover:text-foreground">
            <X aria-hidden className="size-[18px]" />
          </button>
        </div>
      </div>

      {/* ── METAGRAPH SNAPSHOT — the chain, then its ordinal, as one control ─────────────────── */}
      <span className={criterion}>
        {/* ⚠️ THE NOUN IS SAID ONCE, BY THE TOGGLE (user, 2026-09-01: "remove 'snapshot' from the
            filter texts? say 'search snapshots' instead?"). "SEARCH SNAPSHOTS" opens the bar, so
            repeating "snapshot" in all three labels only crowded them — each field names the axis
            that distinguishes it and nothing more. The aria-labels stay unabbreviated: a reader
            hears one field at a time, with no toggle above it to carry the noun. */}
        <span className={label}>Metagraph</span>
        {/* ⚠️ The trigger COLLAPSES TO ITS MARK once chosen: an identity bullet and the ticker, the
            same two-part identity every row and card in this app wears (user: "you'll see the
            metagraph coloured bullet with the selected snapshot number in the field"). The two
            halves are JOINED — squared inner corners, no gap — because they are one criterion, and
            a gap between them would read as two. */}
        <span className="flex min-w-0">
        <Select value={metaId ?? ANY_NET} onValueChange={(v) => setMetaId(v === ANY_NET ? null : v)} disabled={metaLocked}>
          <SelectTrigger
            size="sm"
            aria-label="Which metagraph's chain"
            // ⚠️ `h-6!` — CSS trap 4. The primitive sizes itself with `data-[size=sm]:h-8`, an
            // attribute selector at (0,2,0) that beats a plain `h-6` at (0,1,0), so the picker sat
            // 32px tall beside 24px inputs. The important modifier is the documented escape.
            className="h-8! pointer-coarse:h-11! max-[700px]:h-11! w-[112px] max-[700px]:w-[124px] flex-none rounded-l-xs max-[700px]:rounded-l-btn rounded-r-none border-r-0 border-border/70 bg-[var(--panel-plate)] px-2.5 py-0! text-body max-[700px]:text-base focus-visible:ring-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
          >
            <SelectValue placeholder="network" />
          </SelectTrigger>
          {/* ⚠️ POPPER, NOT THE PRIMITIVE'S `item-aligned` DEFAULT (user, 2026-09-14: "its dropdown
              is on top of the control instead of underneath"). Item-aligned positioning lifts the
              list so the CHOSEN row lands over the trigger — a sensible default for a long settings
              menu you reopen to change one value, and the wrong one here: this trigger sits inside a
              bordered criteria box directly under the toolbar, so the list covered the very field it
              belongs to and the reader lost sight of what they were picking FOR. Measured before the
              change: trigger top 135px, list top 10px — the list opened ABOVE and across it.
              `align="start"` because the trigger is the left end of a joined control; centring the
              list under a 116px trigger would hang it off both sides of that seam. */}
          <SelectContent className="rounded-btn" position="popper" align="start" sideOffset={4}>
            {/* ⚠️ THE WAY BACK (user, 2026-09-14: "the metagraph filter doesn't support 'all'").
                The picker could be entered but never left: once a chain was chosen every later
                search stayed scoped to it, with no row to undo the choice and no reason on screen
                that it was still in force. "All" is the top bar filter's own word for the same
                idea, so the vocabulary is learned once.
                It RESTORES the unscoped state; it does not promise an all-chain ordinal search.
                Ordinals are per-chain — DOR's 27,813,700 and DED's are unrelated snapshots of
                unrelated ledgers — so a number typed with All standing still routes to the
                "pick which metagraph's chain…" teaching, which is the honest answer and the
                reason this picker exists at all. The title says so before the press. */}
            <SelectItem
              value={ANY_NET}
              className="text-body"
            >
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 flex-none rounded-full border border-muted-foreground/60" />
                All
              </span>
            </SelectItem>
            {networks.map((n) => (
              <SelectItem key={n.id} value={n.id} className="text-body">
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
          className={cn(field, "w-[148px] max-[700px]:w-auto max-[700px]:flex-1 rounded-l-none max-[700px]:rounded-l-none text-right")}
        />
        </span>
      </span>

      {/* ── GLOBAL SNAPSHOT — no hint inside the box; the label is the hint ──────────────────── */}
      <span className={criterion}>
        <span className={label}>Global</span>
        <input
          type="text"
          inputMode="numeric"
          value={tick}
          aria-label="Global snapshot ordinal"
          onChange={(e) => onTick(e.target.value)}
          className={cn(field, "w-[148px] max-[700px]:w-full text-right")}
        />
      </span>

      {/* ── DATE RANGE — the calendar ───────────────────────────────────────────────────────── */}
      <span className={criterion}>
        <span className={label}>Date</span>
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
          // action sits where an action sits. On the PHONE tier, where the criteria are already
          // full-width labelled rows, the button goes full-width too (2026-09-10) — a small
          // control floating right on an empty line read as an afterthought, and the wide press
          // is the touch form the rest of the bar already takes.
          // ⚠️ FILLED, the bar's one primary action (design round, 2026-09-29): the washed caps
          // button at 30% disabled read as absent. Disabled keeps the fill at a legible 45%, so
          // the control says it exists and waits for a criterion.
          "ml-auto inline-flex flex-none items-center justify-center gap-2 h-8 pointer-coarse:h-11 max-[700px]:h-12 px-4 rounded-btn cursor-pointer max-[700px]:w-full max-[700px]:mt-1",
          "text-body max-[700px]:text-base font-semibold transition-colors",
          // THE ACCENT AS A FILL UNDER TEXT IS `--primary-ink` (light-theme pass, 2026-10-03): on paper
          // near-white on the bare accent measured 4.21:1; on the ink (a third toward black there,
          // the accent itself on dark) it is 9.1:1. The same token the accent takes as TEXT.
          "bg-primary-ink text-primary-foreground hover:bg-primary-ink/90",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          "disabled:opacity-45 disabled:cursor-default disabled:hover:bg-primary",
        )}
      >
        {seeking ? (
          <Loader2 aria-hidden className="size-[15px] animate-spin motion-reduce:animate-none" />
        ) : (
          <Search aria-hidden className="size-[15px]" />
        )}
        Search
      </button>

      {/* The search's answer, IN the bar (user, 2026-09-09 — see the `miss` prop note): a
          refusal or a miss lands on its own full-width line right under the fields, in the
          advisory tone, instead of whispering by the pager a screen below. aria-live so the
          answer is spoken when it changes, not just painted. */}
      {miss && (
        <p aria-live="polite" className="w-full basis-full text-body text-[var(--warn-soft)]">{miss}</p>
      )}
    </div>
    </>
  );
}
