"use client";

import LiveDot from "@/components/LiveDot";

// THE LIVE FOOT (user, 2026-10-23: "in geo and hyper, instead of removing the bottom just say live
// view or something?"). Every explorer card ends in a plate foot that states what the list is a
// reading OF: Snapshots' pager says its retained window ("last 9 min cache"), History's the span
// its averages are over. Hypergraph's and Geography's lists are the live poll — nothing to page,
// nothing to average over time — so their foot says so with the app's one live atom (`LiveDot` +
// "live", the explorer tick row's and the Global snapshot card's), in the pager foot's own recipe,
// so the four cards end the same way. A view whose data is not live never passes it.
//
// …AND THE LIST'S READING AT THE RIGHT (user, 2026-10-24: "use the bottom section … to also show a
// total/avg of the list that is displayed"): the total where the rows add up, the average per row
// where they overlap — `explorerMeasure.listReading` decides, per measure, and the figure is in the
// figure column's own format. The same caps-word-then-figure the History foot states its span in.
export default function LiveFoot({ reading }: { reading?: { word: "total" | "average"; value: number } | null }) {
  return (
    <div className="flex-none pt-1.5 flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-1.5 min-h-6 text-label tracking-caps uppercase text-muted-foreground">
        <LiveDot />
        live
      </span>
      {reading && (
        <span className="inline-flex items-baseline gap-1.5 text-label tracking-caps uppercase text-muted-foreground tabular-nums">
          {reading.word}
          <span className="font-mono text-body font-bold normal-case tracking-normal text-foreground">
            {reading.word === "average" ? reading.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : reading.value.toLocaleString()}
          </span>
        </span>
      )}
    </div>
  );
}
