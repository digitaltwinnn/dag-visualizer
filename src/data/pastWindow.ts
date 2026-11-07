import { metaSnapRecord, type MetaSnapRecord } from "@/src/data/api";
import type { Anchor, GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";
import { currentIdOf } from "@/src/net/lineage";
import type { LedgerSource } from "@/src/data/ledgerSourceType";
import type { BlockWindow } from "@/src/data/blockWindow";
import type { LedgerRegister } from "@/src/store/mode";
import { readsBlockWindow } from "@/src/engine/domain/viewPolicy";

// THE SNAPSHOTS VIEW'S PAST WINDOW (user, 2026-11-03: pinning an old snapshot should "go back in time";
// `docs/superpowers/specs/2026-11-03-snapshots-past-window-design.md`). Every Snapshots surface reads
// a LEDGER SOURCE: the live buffer (`NetworkData`) normally, and this frozen window around the pin
// when the pin is older than the live buffer holds. It answers the live buffer's own questions in its
// own shapes — global snapshots oldest→newest, each chain's records, `getAnchor(ts)` — so a pin inside
// it behaves exactly as a pin inside the live window does.
//
// The window's data lives here beside `NetworkData` (fetched buffers, too large for the store); the
// store carries only its status (`store.pastWindow`), which `components/PastWindowBridge.tsx`, the one
// writer, keeps in step with what is held here.

export type { LedgerSource };

export interface PastWindow extends LedgerSource {
  from: number;
  to: number;
  /** Does the window hold this global snapshot? */
  holds(ordinal: number): boolean;
}

/** The route's answer (`app/api/ledger/window.ts`). */
export interface PastWindowAnswer {
  globals: GlobalSnapshot[];
  chains: Record<string, RawMetaSnapshot[]>;
}

/** The anchor index, folded from each chain's records exactly as the live buffer folds them
 *  (`NetworkData._recordMetaSnaps`): one entry per anchoring global timestamp, its fee and count summed
 *  and each network's count kept. A settled past is no longer settling, so `touched` is 0. */
export function foldAnchors(chains: ReadonlyMap<string, readonly MetaSnapRecord[]>): Map<string, Anchor> {
  const out = new Map<string, Anchor>();
  for (const [key, records] of chains) {
    for (const r of records) {
      const a = out.get(r.ts) ?? { fee: 0, count: 0, metaIds: new Set<string>(), metaCounts: new Map<string, number>(), touched: 0 };
      a.fee += r.fee;
      a.count += 1;
      a.metaIds.add(key);
      a.metaCounts.set(key, (a.metaCounts.get(key) ?? 0) + 1);
      out.set(r.ts, a);
    }
  }
  return out;
}

/** The window as a ledger source. A chain's former address joins its network's current one, the lane
 *  the chamber draws it on (each record keeping its `chain`); records are kept oldest → newest, as
 *  the live buffer keeps them. */
export function buildPastWindow(answer: PastWindowAnswer, net: string): PastWindow | null {
  const globals = [...answer.globals].sort((a, b) => a.ordinal - b.ordinal);
  if (!globals.length) return null;
  const metaSnaps = new Map<string, MetaSnapRecord[]>();
  for (const [id, rows] of Object.entries(answer.chains)) {
    const key = currentIdOf(net, id);
    // A former address files under its network's current id (the lane), each record keeping its own
    // chain, so a selection names the real one (ordinals are per chain).
    const recs = rows.map((r) => (key === id ? metaSnapRecord(r) : { ...metaSnapRecord(r), chain: id }));
    metaSnaps.set(key, [...(metaSnaps.get(key) ?? []), ...recs].sort((a, b) => a.ts.localeCompare(b.ts) || a.ordinal - b.ordinal));
  }
  const anchors = foldAnchors(metaSnaps);
  const from = globals[0]!.ordinal;
  const to = globals[globals.length - 1]!.ordinal;
  return {
    from,
    to,
    globalSnapshots: globals,
    metaSnaps,
    unlistedSnaps: new Map(),
    getAnchor: (ts) => anchors.get(ts) ?? null,
    holds: (ordinal) => ordinal >= from && ordinal <= to,
  };
}

/** What the view wants of a past window: none, the one it holds, or one around the pin. */
export type PastWant = { kind: "clear" } | { kind: "keep" } | { kind: "fetch"; ordinal: number };

/** THE ONE RULE for when the view goes back in time: in the Snapshots view, pinned on a snapshot older
 *  than the live buffer's oldest. A pin the held window holds keeps it (the pager stepping inside);
 *  following live, leaving the view, or a pin the live buffer holds releases it. */
export function pastWanted(s: { ledger: boolean; following: boolean; pin: number | null; liveOldest: number | null; held: { from: number; to: number } | null; register?: LedgerRegister }): PastWant {
  if (!s.ledger || (s.register != null && readsBlockWindow(s.register)) || s.following || s.pin == null || s.liveOldest == null) return { kind: "clear" };
  if (s.pin >= s.liveOldest) return { kind: "clear" };
  if (s.held && s.pin >= s.held.from && s.pin <= s.held.to) return { kind: "keep" };
  return { kind: "fetch", ordinal: s.pin };
}

/** THE RETRY SCHEDULE for a window read that failed (user, 2026-11-03: "add a retry"): the delay
 *  before retry `attempt` (0-based), or null once the budget is spent and the failure is told. A
 *  read crosses many explorer reads, so one upstream blip should not cost the reader the window;
 *  three spaced tries cover a blip without knocking on a door that stays shut. */
export const PAST_RETRY_MS: readonly number[] = [2_000, 6_000, 15_000];
export function pastRetryDelay(attempt: number): number | null {
  return PAST_RETRY_MS[attempt] ?? null;
}

// ── The held window (the module's one piece of state) ─────────────────────────────────────────

let held: PastWindow | null = null;
const listeners = new Set<() => void>();

/** The past window the view stands on, or null while it reads the live buffer. */
export function getPastWindow(): PastWindow | null {
  return held;
}

/** Hold a window, or none. The bridge is the one caller. */
export function setPastWindow(w: PastWindow | null): void {
  if (w === held) return;
  held = w;
  for (const l of listeners) l();
}

/** Listen for the held window changing; returns the unsubscribe. */
export function onPastWindow(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

let heldBlocks: BlockWindow | null = null;
const blockListeners = new Set<() => void>();

/** The Blocks register's window, or null while none has landed. */
export function getBlockWindow(): BlockWindow | null {
  return heldBlocks;
}

/** Hold a block window, or none. The bridge is the one caller. */
export function setBlockWindow(w: BlockWindow | null): void {
  if (w === heldBlocks) return;
  heldBlocks = w;
  for (const l of blockListeners) l();
}

/** Listen for the block window changing; returns the unsubscribe. */
export function onBlockWindow(l: () => void): () => void {
  blockListeners.add(l);
  return () => blockListeners.delete(l);
}

/** THE LEDGER SOURCE: in the Snapshots register the held past window, else the live buffer; in the
 *  Blocks register the block window alone (the live buffer's ticks are the wrong set, so with no
 *  window yet the chamber draws nothing). */
export function ledgerSource(live: LedgerSource | null, register: LedgerRegister = "snapshots"): LedgerSource | null {
  return readsBlockWindow(register) ? (heldBlocks ?? null) : (held ?? live);
}
