// THE DATA BLOCKS REGISTER'S TILE MARK (D6, 2026-11-07 — user: "a 3rd option 'data blocks' which can
// visualize the DED which would inherit the snapshot layout"). The register draws the Snapshots
// chamber as it is, and on each metagraph snapshot tile whose EXACT read says it carried data blocks,
// one small mark standing on the tile's top: its HEIGHT the count of data updates those blocks carry
// (the chamber's own idiom — a bar's width is its bytes, a tile's size its anchors), on a log scale,
// because one network writes a handful per snapshot and another thousands. The number itself is the
// card's and the explorer's (`ChannelSnapRow.dataTxCount`); the mark says THAT a snapshot carried data
// and roughly how much.
//
// THE MARK IS THE TILE'S OWN SIZE (user, 2026-11-08: "make the data blocks on the metagraph planes
// the same size as the snapshot block"): a second tile standing on the first, the same footprint and
// the same height, in the lane's hue — a presence mark, no longer a bar; the count of updates is the
// card's and the explorer's. (It was a log-scaled bar at 0.42 of the tile's footprint, D6.)
//
// A SNAPSHOT THAT CARRIED NO DATA BLOCK IS NOT THE REGISTER'S SUBJECT (user, 2026-11-07: "a
// metagraph that anchored but had no datablock is still shown; don't show it"): its tile is not drawn,
// no sheet or thread ties it to its tick, and the explorer does not list it — as the Transaction blocks
// register draws no tile for a snapshot carrying no block. `carriesData` is that rule's one home.
//
// Honesty (rule 10): a tile whose read has not landed, or whose payload the decoder could not read,
// is UNKNOWN — not drawn yet, never a guess; a snapshot whose data blocks hold no update still carried
// data, so it stands at the floor height.

/** The mark's proportions as fractions of its TILE's: its footprint, its height, and the LIFT between
 *  the tile's top and the mark's underside. 1 and 1 — the snapshot block's own size — and a lift of
 *  one tile's height (user 2026-11-08: "on top of the metagraph snapshot, slightly elevated"; half a
 *  tile vanished under the bloom at the chamber's pose), so the mark hovers over its snapshot rather
 *  than doubling it. */
export const DATA_MARK: Readonly<{ foot: number; height: number; lift: number }> = { foot: 1, height: 1, lift: 1 };

/** What a tile's mark counts: the data updates of a snapshot that carried data blocks, or null where
 *  it carried none or its read has not landed. */
export function dataMarkCount(row: { dataBlocks?: number; dataTxCount?: number } | null | undefined): number | null {
  if (!row || row.dataBlocks == null || row.dataBlocks <= 0) return null;
  return row.dataTxCount ?? 0;
}

/** Did this snapshot carry data blocks, as far as its exact read says? False while the read has not
 *  landed or could not be read — the register's tile, sheet and explorer row all hang on this. */
export function carriesData(row: { dataBlocks?: number; dataTxCount?: number } | null | undefined): boolean {
  return dataMarkCount(row) != null;
}
