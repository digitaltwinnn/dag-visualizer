// THE NETWORK THE VIEW STANDS ON (user, 2026-10-31: "open the 1st of that set and allow left/right
// swipe without setting the filter"; Geography the same day). The rail BROWSES in Hypergraph and
// Geography: their Metagraph ghost and swipe commit `railNet`, not the filter, and the card, the
// scene, the explorer and the band all stand on it, so only the top bar says otherwise. The filter is
// what the reader set for every view, this is a look around one view, so it clears on leaving
// (Engine.setMode). Snapshots' network inside a tick is the precedent (`tickNet.ts`). `railNet` is
// null everywhere else, so this asks no view.
export const viewNetwork = (s: { filter: string; railNet: string | null }): string => s.railNet ?? s.filter;
