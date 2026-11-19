import type { MetaSnapRecord } from "@/src/data/api";
import type { Anchor, GlobalSnapshot } from "@/src/data/types";

// A type-only leaf so `pastWindow.ts` and `blockWindow.ts` can both name the shape without importing each other.

/** What the Snapshots surfaces read, live or past. `NetworkData` has the same fields. */
export interface LedgerSource {
  globalSnapshots: GlobalSnapshot[];
  metaSnaps: Map<string, MetaSnapRecord[]>;
  unlistedSnaps: Map<string, MetaSnapRecord[]>;
  getAnchor(ts: string): Anchor | null;
}
