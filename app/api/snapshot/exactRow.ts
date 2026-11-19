import type { ChannelSnapRow } from "@/src/data/types";
import { decodeChannelContent } from "./decodeChannel";

// ONE ANCHORED METAGRAPH SNAPSHOT, as the per-ordinal exact read states it (`/api/snapshot/[ordinal]`).
// Its own module so the route stays route exports only and the row has a test (`exactRow.test.ts`).
//
// The DATA UPDATES ride the row (D6, 2026-11-07): the decoder already inflates every anchored
// channel per tick, so the count of the data transactions in its data blocks costs nothing more
// here. The metagraph snapshot card's count and the Data blocks register's tile marks read it from
// this row; the deep channel read is the RAW pane's payload alone (`src/data/CLAUDE.md`, the
// two-step disclosure). So do the STATE'S SHAPE and the dL1 SIGNERS (2026-11-07): the card used to
// ask a ~2.5 MB deep read for them ("Decompress this snapshot") that the decoder had already done. A payload the decoder cannot read states no count — unknown is not zero; every
// sum of these counts asks `dataUpdatesOf` (`src/data/ledgerMeasure.ts`), which says the same.

/** The anchored entry's shape inside the global's `stateChannelSnapshots`. */
export type StateChannelSnap = { value?: { fee?: number; content?: unknown[] } };

export async function exactRowOf(metaId: string, s: StateChannelSnap | null | undefined): Promise<ChannelSnapRow> {
  const fee = s?.value?.fee ?? 0;
  // Actual serialized size — `content` is the snapshot's content as a byte array, so its length is
  // the real byte count anchored. NOT derived from the fee.
  const bytes = Array.isArray(s?.value?.content) ? s.value!.content!.length : 0;
  const decoded = await decodeChannelContent(s?.value?.content);
  return {
    metaId,
    ordinal: decoded?.ordinal ?? 0,
    decoded: !!decoded,
    fee,
    bytes,
    signers: decoded?.signers ?? [],
    blocks: decoded?.blocks ?? 0,
    hasState: decoded?.hasState ?? false,
    stateBytes: decoded?.stateBytes ?? 0,
    stateProof: decoded?.stateProof ?? null,
    dataBytes: decoded?.dataBytes ?? 0,
    ...(decoded ? { ...(decoded.dataTxCount != null ? { dataTxCount: decoded.dataTxCount } : {}), dataBlocks: decoded.dataBlocks, stateKeys: decoded.stateKeys, dataBlockSigners: decoded.dataBlockSigners, dataBlockRows: decoded.dataBlockRows } : {}),
  };
}
