import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";
import { ordinalAtOrAfter, type ChainReader } from "../notes/snapshotAt";

// A PAST WINDOW OF THE SNAPSHOTS VIEW (user, 2026-11-03: pinning an old snapshot should "go back in
// time": the chamber rebuilds for the pin's own window, frozen, and the explorer shows the same
// window; `docs/superpowers/specs/2026-11-03-snapshots-past-window-design.md`). The live buffer
// holds the newest 52 global snapshots and each chain's newest records; this reads the same two
// things around an ordinal in the past, in the live answer's own shapes, so the client folds them
// exactly as it folds the live feed.
//
// Reads are the explorer's: the global list from a crafted cursor (one read), per-ordinal records
// where the list does not serve (its 2025-05-20 floor), and each catalog chain's records from its
// newest one inside the span, found by the same ordinal search a notable row's snapshot uses.

/** The window around a pin: this many global snapshots before it… */
export const WINDOW_BEFORE = 41;
/** …and up to this many after it, so the pin lands at the front with context behind it. */
export const WINDOW_AFTER = 10;
/** A chain's records read per page of its list, and the most pages one chain may take. */
const CHAIN_PAGE = 500;
const CHAIN_PAGES_MAX = 6;

export interface WindowAnswer {
  /** Oldest → newest, as the live buffer holds them. */
  globals: GlobalSnapshot[];
  /** Each chain's records anchored in the window's span, newest first as the explorer lists them. */
  chains: Record<string, RawMetaSnapshot[]>;
}

export interface WindowDeps {
  be: string;
  reader: ChainReader;
  getJson(url: string): Promise<{ data?: unknown; meta?: { next?: string } } | null>;
  /** Every chain the catalog has tracked (current and former addresses). */
  chainIds: readonly string[];
}

/** The window's ordinals: `WINDOW_BEFORE` back from the pin, `WINDOW_AFTER` on, never past the tip. */
export function windowBounds(pin: number, latest: number): { from: number; to: number } {
  const to = Math.min(latest, pin + WINDOW_AFTER);
  return { from: Math.max(1, pin - WINDOW_BEFORE), to: Math.max(to, pin) };
}

/** The explorer's list cursors, crafted: a crafted cursor lands ON its record (inclusive). */
export const globalCursor = (timestamp: string, ordinal: number): string =>
  Buffer.from(JSON.stringify({ created_at: timestamp, ordinal: ordinal.toString(16) })).toString("base64");
export const chainCursor = (hash: string): string => Buffer.from(JSON.stringify({ hash })).toString("base64");

const asList = <T>(j: { data?: unknown } | null): T[] => (Array.isArray(j?.data) ? (j!.data as T[]) : []);

async function readGlobals(d: WindowDeps, from: number, to: number): Promise<GlobalSnapshot[] | null> {
  const top = await d.getJson(`${d.be}/global-snapshots/${to}`);
  const head = top?.data as GlobalSnapshot | undefined;
  if (!head?.timestamp) return null;
  const want = to - from + 1;
  const listed = asList<GlobalSnapshot>(await d.getJson(`${d.be}/global-snapshots?limit=${want}&next=${encodeURIComponent(globalCursor(head.timestamp, to))}`).catch(() => null));
  const byOrd = new Map<number, GlobalSnapshot>();
  for (const g of listed) if (g.ordinal >= from && g.ordinal <= to) byOrd.set(g.ordinal, g);
  byOrd.set(to, head);
  // Below the list's floor, or a short page: the missing ordinals one by one (each ~330 B).
  const missing = [];
  for (let o = from; o <= to; o++) if (!byOrd.has(o)) missing.push(o);
  for (let i = 0; i < missing.length; i += 8) {
    const got = await Promise.all(missing.slice(i, i + 8).map((o) => d.getJson(`${d.be}/global-snapshots/${o}`).catch(() => null)));
    for (const j of got) {
      const g = j?.data as GlobalSnapshot | undefined;
      if (g?.timestamp) byOrd.set(g.ordinal, g);
    }
  }
  const out: GlobalSnapshot[] = [];
  for (let o = from; o <= to; o++) {
    const g = byOrd.get(o);
    if (!g) return null; // a hole is no window: ordinals are gapless, and a row missing would lie
    out.push(g);
  }
  return out;
}

/** One chain's records with an anchoring timestamp inside [firstMs, lastMs], newest first. */
async function readChain(d: WindowDeps, id: string, firstMs: number, lastMs: number): Promise<RawMetaSnapshot[]> {
  const latest = await d.reader.latest(id).catch(() => null);
  if (!latest || Date.parse(latest.timestamp) < firstMs) return []; // quiet through the span, or not begun
  let top = latest.ordinal;
  if (Date.parse(latest.timestamp) > lastMs) {
    const after = await ordinalAtOrAfter(d.reader, id, lastMs + 1, latest.ordinal).catch(() => null);
    if (after == null || after <= 1) return [];
    top = after - 1;
  }
  const head = await d.reader.at(id, top).catch(() => null);
  if (!head || Date.parse(head.timestamp) < firstMs) return [];
  const out: RawMetaSnapshot[] = [];
  let cursor: string | undefined = chainCursor(head.hash);
  for (let page = 0; cursor && page < CHAIN_PAGES_MAX; page++) {
    const j: { data?: unknown; meta?: { next?: string } } | null = await d.getJson(`${d.be}/currency/${id}/snapshots?limit=${CHAIN_PAGE}&next=${encodeURIComponent(cursor)}`).catch(() => null);
    const rows = asList<RawMetaSnapshot>(j);
    let older = false;
    for (const r of rows) {
      const at = Date.parse(r.timestamp);
      if (at > lastMs) continue;
      if (at < firstMs) { older = true; break; }
      out.push(r);
    }
    if (older || rows.length < CHAIN_PAGE) break;
    cursor = j?.meta?.next;
  }
  return out;
}

/** The window around `pin`: its global snapshots and every chain's records in their span, or null
 *  when the global chain cannot be read whole. */
export async function readWindow(d: WindowDeps, pin: number): Promise<WindowAnswer | null> {
  const latest = await d.reader.latest(null);
  if (!latest || pin < 1 || pin > latest.ordinal) return null;
  const { from, to } = windowBounds(pin, latest.ordinal);
  const globals = await readGlobals(d, from, to);
  if (!globals) return null;
  const firstMs = Date.parse(globals[0]!.timestamp);
  const lastMs = Date.parse(globals[globals.length - 1]!.timestamp);
  const read = await Promise.all(d.chainIds.map(async (id) => [id, await readChain(d, id, firstMs, lastMs)] as const));
  const chains: Record<string, RawMetaSnapshot[]> = {};
  for (const [id, rows] of read) if (rows.length) chains[id] = rows;
  return { globals, chains };
}
