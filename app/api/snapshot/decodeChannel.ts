// A global snapshot carries each anchored metagraph snapshot as `value.content`: a byte array of
// BROTLI-COMPRESSED JSON — the complete metagraph snapshot, which Global L0 never interprets
// (verified against mainnet 2026-08-04). Decoding it is what lets a metagraph snapshot become a
// subject with real facts instead of a fee and a size.
//
// Everything here is pure and server-side; both the per-ordinal route (summary rows) and the
// per-channel route (the full read) share it, so the two can never disagree.
import { brotliDecompress } from "node:zlib";
import { promisify } from "node:util";

const inflate = promisify(brotliDecompress);

/** Signer ids are truncated the way `hex()` already truncates them in the UI: a 138-anchor tick
 *  carries ~1600 validator keys, ~53 KB at full length against ~3.3 KB truncated. */
export const SIGNER_LEN = 8;
export const shortSigner = (id: string): string => id.slice(0, SIGNER_LEN);

export interface DecodedChannel {
  ordinal: number;
  height: number;
  subHeight: number;
  epochProgress: number;
  lastSnapshotHash: string;
  blocks: number;
  signers: string[];
  /** The application state's SHAPE — top-level keys and how many records sit under each. */
  stateKeys: { key: string; count: number }[];
  stateBytes: number;
  stateProof: string | null;
  /** True only when the state carries something; DED's `{"latestOrdinal":{},"latestUpdates":{}}`
   *  is 39 bytes of nothing and must not earn a "show deeper" invitation. */
  hasState: boolean;
  /** The decoded state as text — the raw layer renders it; the card never does (spec §7.3). */
  state: string;
  dataBlockSigners: string[];
  /** The data TRANSACTIONS inside the blocks (2026-08-07 — the missing link for data
   *  metagraphs like DED: the app's real payload rides here as signed batch commitments, e.g.
   *  MetagraphBatchMessage batch roots, while onChainState may stay empty). Count + the
   *  decoded values as JSON text for the raw layer's tree. */
  dataTxCount: number;
  dataTx: string;
}

const asBytes = (v: unknown): Buffer | null =>
  Array.isArray(v) && v.length > 0 ? Buffer.from(v as number[]) : null;

function shapeOf(state: unknown): { keys: { key: string; count: number }[]; has: boolean } {
  if (!state || typeof state !== "object") return { keys: [], has: false };
  const keys: { key: string; count: number }[] = [];
  let has = false;
  for (const [key, v] of Object.entries(state as Record<string, unknown>)) {
    const count = Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : v == null ? 0 : 1;
    if (count > 0) has = true;
    keys.push({ key, count });
  }
  return { keys, has };
}

/** `content` → the metagraph snapshot's real facts, or null if it can't be read (a channel using
 *  another encoding must degrade to bytes-only, never break the tick's read). */
export async function decodeChannelContent(content: unknown): Promise<DecodedChannel | null> {
  const bytes = asBytes(content);
  if (!bytes) return null;
  let root: Record<string, unknown>;
  try {
    root = JSON.parse((await inflate(bytes)).toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const value = (root.value ?? {}) as Record<string, unknown>;
  const proofs = Array.isArray(root.proofs) ? (root.proofs as { id?: string }[]) : [];
  const app = (value.dataApplication ?? null) as Record<string, unknown> | null;

  const stateBuf = app ? asBytes(app.onChainState) : null;
  const stateText = stateBuf ? stateBuf.toString("utf8") : "";
  let parsed: unknown = null;
  try { parsed = stateText ? JSON.parse(stateText) : null; } catch { parsed = null; }
  const shape = shapeOf(parsed);

  const appBlocks = app && Array.isArray(app.blocks) ? (app.blocks as unknown[]) : [];
  const dataBlockSigners: string[] = [];
  const dataTxValues: unknown[] = [];
  for (const b of appBlocks) {
    const buf = asBytes(b);
    if (!buf) continue;
    try {
      const blk = JSON.parse(buf.toString("utf8")) as {
        proofs?: { id?: string }[];
        value?: { dataTransactions?: unknown[]; updates?: unknown[] };
      };
      for (const p of blk.proofs ?? []) if (p.id) dataBlockSigners.push(shortSigner(p.id));
      // The transactions arrive as (possibly nested) arrays of signed updates — flatten one
      // level and keep each update's VALUE (the app record, e.g. a batch-root commitment);
      // the proofs stay behind (the signers above already witness the block).
      const txs = blk.value?.dataTransactions ?? blk.value?.updates ?? [];
      for (const t of (Array.isArray(txs) ? txs : []).flat()) {
        const v = (t as { value?: unknown })?.value ?? t;
        if (v != null) dataTxValues.push(v);
      }
    } catch { /* a block we can't read is one we don't claim */ }
  }

  return {
    ordinal: typeof value.ordinal === "number" ? value.ordinal : 0,
    height: typeof value.height === "number" ? value.height : 0,
    subHeight: typeof value.subHeight === "number" ? value.subHeight : 0,
    epochProgress: typeof value.epochProgress === "number" ? value.epochProgress : 0,
    lastSnapshotHash: typeof value.lastSnapshotHash === "string" ? value.lastSnapshotHash : "",
    blocks: Array.isArray(value.blocks) ? value.blocks.length : 0,
    signers: proofs.map((p) => shortSigner(p.id ?? "")).filter(Boolean),
    stateKeys: shape.keys,
    stateBytes: stateBuf ? stateBuf.length : 0,
    stateProof: app && typeof app.calculatedStateProof === "string" ? app.calculatedStateProof : null,
    hasState: shape.has,
    state: stateText,
    dataBlockSigners: [...new Set(dataBlockSigners)],
    dataTxCount: dataTxValues.length,
    dataTx: dataTxValues.length ? JSON.stringify(dataTxValues) : "",
  };
}
