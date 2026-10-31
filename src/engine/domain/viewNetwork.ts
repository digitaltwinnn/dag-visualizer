// THE NETWORK THE VIEW STANDS ON (user, 2026-10-31: "open the 1st of that set and allow left/right
// swipe without setting the filter"). The Hypergraph rail BROWSES: its Metagraph ghost and swipe
// commit `hyperNet`, not the filter, and the card, the scene, the explorer and the band all stand on
// it, so only the top bar says otherwise. The filter is what the reader set for every view, this is
// a look around one view, so it clears on leaving (Engine.setMode). Snapshots' network inside a tick
// is the precedent (`tickNet.ts`). `hyperNet` is null everywhere but Hypergraph, so this asks no view.
export const viewNetwork = (s: { filter: string; hyperNet: string | null }): string => s.hyperNet ?? s.filter;
