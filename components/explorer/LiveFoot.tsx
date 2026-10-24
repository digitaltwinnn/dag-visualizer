"use client";

import LiveDot from "@/components/LiveDot";
import ExplorerFoot from "@/components/explorer/ExplorerFoot";

// THE LIVE FOOT (user, 2026-10-23: "in geo and hyper, instead of removing the bottom just say live
// view or something?"). Every explorer card ends in a plate foot that states what the list is a
// reading OF (`ExplorerFoot`): Snapshots' pager says its retained window ("last 9 min cache"),
// History's the span its averages are over. Hypergraph's and Geography's lists are the live poll —
// nothing to page, nothing to average over time — so their foot says so with the app's one live
// atom (`LiveDot` + "live", the explorer tick row's and the Global snapshot card's). A view whose
// data is not live never passes it.
//
// …AND THE LIST'S TOTAL AT THE RIGHT (user, 2026-10-24: "use the bottom section … to also show a
// total/avg of the list that is displayed"; then "total, not average"; then the geo distinct
// counts): the caller states the figure — the rows' sum where they add up, the fleet's distinct
// count where a row's members overlap (`geoMeasure.footTotal`) — formatted by `format`, the figure
// column's own where the measure has one.
export default function LiveFoot({ total, format = (v) => v.toLocaleString() }: { total?: number | null; format?: (v: number) => string }) {
  return (
    <ExplorerFoot
      left={
        <>
          <LiveDot />
          live
        </>
      }
      reading={total != null ? { word: "total", figure: format(total) } : null}
    />
  );
}
