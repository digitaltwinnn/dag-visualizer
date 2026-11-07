// THE DATA BLOCKS REGISTER'S TILE MARK (D6, 2026-11-07 — user: "a 3rd option 'data blocks' which can
// visualize the DED which would inherit the snapshot layout"). The register draws the Snapshots
// chamber as it is, and on each metagraph snapshot tile whose EXACT read says it carried data blocks,
// one small mark standing on the tile's top: its HEIGHT the count of data updates those blocks carry
// (the chamber's own idiom — a bar's width is its bytes, a tile's size its anchors), on a log scale,
// because one network writes a handful per snapshot and another thousands. The number itself is the
// card's and the explorer's (`ChannelSnapRow.dataTxCount`); the mark says THAT a snapshot carried data
// and roughly how much.
//
// A SNAPSHOT THAT CARRIED NO DATA BLOCK IS NOT THE REGISTER'S SUBJECT (user, 2026-11-07: "a
// metagraph that anchored but had no datablock is still shown; don't show it"): its tile is not drawn,
// no sheet or thread ties it to its tick, and the explorer does not list it — as the Transaction blocks
// register draws no tile for a snapshot carrying no block. `carriesData` is that rule's one home.
//
// Honesty (rule 10): a tile whose read has not landed, or whose payload the decoder could not read,
// is UNKNOWN — not drawn yet, never a guess; a snapshot whose data blocks hold no update still carried
// data, so it stands at the floor height.

/** The mark's proportions, in chamber units: the floor height a single update stands at, the ceiling,
 *  how much height each decade of updates adds, and its footprint as a fraction of its tile's. */
export const DATA_MARK: Readonly<{ h0: number; perDecade: number; hMax: number; foot: number }> = {
  h0: 0.1,
  perDecade: 0.12,
  hMax: 0.58,
  foot: 0.42,
};

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

/** The mark's height for a count of data updates — the floor at one (or none), a decade's step after. */
export function dataMarkHeight(count: number): number {
  if (count <= 1) return DATA_MARK.h0;
  return Math.min(DATA_MARK.hMax, DATA_MARK.h0 + DATA_MARK.perDecade * Math.log10(count));
}
