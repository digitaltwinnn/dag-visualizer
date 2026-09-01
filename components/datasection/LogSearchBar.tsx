"use client";

import { Loader2 } from "lucide-react";

import DateRange from "@/components/datasection/DateRange";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SearchAxis = "snapshot" | "tick" | "age";

// THE ANCHOR LOG'S SEARCH BAR — one axis at a time, one input, one button.
//
// ⚠️ ONE BUTTON, NOT ONE PER FIELD (user, 2026-09-01: "don't add a button next to each field, I
// want a search button or 'go' or something"). Three fields each with their own submit was the
// previous cut, and the objection is right: three buttons is three offers where the reader makes
// one choice. But a single button over three simultaneous fields has to GUESS which one you meant,
// so the fields stopped being simultaneous — an axis is CHOSEN, its input is the only one on
// screen, and the button acts on it. That is also the grouping the guidance names for exactly this
// case: a search input paired with a control that limits which parameter the search covers.
//
// ⚠️ A METAGRAPH SNAPSHOT ORDINAL IS MEANINGLESS WITHOUT ITS NETWORK (user, same). Ordinals are
// per-chain — DOR's 27,813,700 and DED's 27,813,700 are unrelated snapshots of unrelated ledgers —
// so `SNAPSHOT` needs to know whose chain it is counting on. It does NOT ask in a popup: this app
// already has one committed network, it is the top bar's filter, and under a commit this table IS
// that network's chain. So the axis states the network it will search and refuses to guess when
// none is committed. That also keeps the answer honest in the other direction: an unfiltered log
// is a window over EVERY network, where the same ordinal can legitimately match several rows.
//
// The other two axes need no network. ANCHORED INTO addresses a GLOBAL snapshot, which is the one
// chain everyone shares; AGE is a timestamp, likewise.
export default function LogSearchBar({
  axis,
  setAxis,
  network,
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
  axis: SearchAxis;
  setAxis: (a: SearchAxis) => void;
  /** The committed network's short name, or null under "all" — SNAPSHOT's scope, stated. */
  network: string | null;
  seeking: boolean;
  snapshot: string;
  tick: string;
  from: string;
  to: string;
  onSnapshot: (v: string) => void;
  onTick: (v: string) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onSubmit: (which: SearchAxis) => void;
  /** Escape folds the bar away — the same key that dismisses every other transient surface here. */
  onClose: () => void;
}) {
  const needsNet = axis === "snapshot" && !network;
  const value = axis === "snapshot" ? snapshot : tick;
  const canGo = axis === "age" ? !!from : !!value && !needsNet;

  const field =
    "w-full min-w-0 h-6 px-1.5 py-0 bg-[var(--panel-plate)] border border-border/50 rounded-xs " +
    "font-mono text-body tabular-nums text-foreground placeholder:text-muted-foreground placeholder:font-sans " +
    "hover:border-border focus:border-transparent disabled:opacity-40 " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] transition-colors";

  return (
    <div
      className="flex-none flex flex-wrap items-center gap-x-2 gap-y-1.5 pb-1.5"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      {/* THE AXIS CHOOSER IS A DROPDOWN (user, 2026-09-01: "it should also be that shadcn dropdown
          thing no?") — and it is the shape the guidance names for precisely this control: "a search
          input paired with a dropdown that limits which parameters the search covers". A segmented
          control was the first cut and spends three slots stating a single choice; a dropdown
          spends one and scales if a fourth axis ever earns its place. The three options ARE the
          statement the old per-column row made with empty cells: these axes can be searched across
          the whole chain, and nothing else can. */}
      <span className="flex flex-none items-center gap-1.5">
        <span className="text-micro uppercase tracking-caps text-muted-foreground">search by</span>
        <Select value={axis} onValueChange={(v) => setAxis(v as SearchAxis)}>
          <SelectTrigger
            size="sm"
            aria-label="What to search by"
            className="h-6 w-[152px] rounded-xs border-border/50 bg-[var(--panel-plate)] px-1.5 text-micro uppercase tracking-caps text-foreground focus-visible:ring-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-btn">
            <SelectItem value="snapshot" className="text-micro uppercase tracking-caps">snapshot</SelectItem>
            <SelectItem value="tick" className="text-micro uppercase tracking-caps">anchored into</SelectItem>
            <SelectItem value="age" className="text-micro uppercase tracking-caps">date</SelectItem>
          </SelectContent>
        </Select>
      </span>

      {/* THE ONE INPUT, whichever axis is chosen. */}
      {axis === "age" ? (
        <DateRange from={from} to={to} seeking={false} onFrom={onFrom} onTo={onTo} onSubmit={() => onSubmit("age")} />
      ) : (
        <span className="flex flex-none items-center gap-1.5">
          {/* SNAPSHOT states whose chain it counts on — and says so rather than searching one it
              was never told (see the header). The chip is the committed network's own short name. */}
          {axis === "snapshot" && network && (
            <span className="flex-none rounded-xs border border-border/50 px-1 py-0.5 text-micro uppercase tracking-caps text-foreground-dim">
              {network}
            </span>
          )}
          <input
            type="text"
            inputMode="numeric"
            value={value}
            disabled={needsNet}
            placeholder={axis === "snapshot" ? "snapshot #" : "global snapshot #"}
            aria-label={axis === "snapshot" ? "Metagraph snapshot ordinal" : "Global snapshot ordinal"}
            onChange={(e) => (axis === "snapshot" ? onSnapshot : onTick)(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canGo) { e.preventDefault(); onSubmit(axis); } }}
            className={cn(field, "w-[150px] text-right")}
          />
        </span>
      )}

      {/* ONE submit. Enter still works inside the input — both, never one: implicit submission for
          everyone who knows it, a visible control for everyone who does not. */}
      <button
        type="button"
        onClick={() => onSubmit(axis)}
        disabled={!canGo}
        className={cn(
          "inline-flex flex-none items-center gap-1 h-6 px-2 rounded-xs cursor-pointer",
          "text-micro uppercase tracking-caps transition-colors",
          "border border-[var(--primary)]/40 bg-[var(--wash-soft)] text-[var(--primary)]",
          "hover:bg-[var(--wash-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
          "disabled:opacity-30 disabled:cursor-default disabled:hover:bg-[var(--wash-soft)]",
        )}
      >
        {seeking ? <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" /> : null}
        search
      </button>

      {/* The refusal, in words. It names the control that fixes it — the top bar's own filter — so
          the reader is not left to guess what "a network" means here. */}
      {needsNet && (
        <span className="text-micro text-muted-foreground">
          pick a network in the top bar — a snapshot number counts on its own chain
        </span>
      )}
    </div>
  );
}
