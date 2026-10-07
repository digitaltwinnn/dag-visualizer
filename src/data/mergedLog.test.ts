import { describe, expect, it } from "vitest";
import { lastPageSize, mergePage, type ChainSpan, type LogRow } from "./mergedLog";

// THE ANCHOR LOG UNDER ALL IS EVERY NETWORK'S CHAIN, MERGED BY TIME (user, 2026-10-07: "I care about
// actual real totals not technical implementation … that should be solved under the hood"). A page
// boundary is a CURSOR PER CHAIN, so the newest page, the oldest page and every step between them
// are exact — no window, no "recent".

const T0 = Date.UTC(2026, 0, 1);
const row = (ordinal: number, minute: number): LogRow => ({ ordinal, hash: `h${ordinal}`, parent: "", ts: new Date(T0 + minute * 60_000).toISOString(), fee: 0, sizeInKB: 1 });
// Chain A snapshots every 2 minutes, chain B every 3.
const A = (n: number) => row(n, n * 2);
const B = (n: number) => row(n, n * 3);
const spans: ChainSpan[] = [
  { addr: "A", lo: 1, hi: 30 },
  { addr: "B", lo: 1, hi: 20 },
];
// What each chain would hand back from a cursor, newest first (down) or oldest first (up).
const down = (addr: string, from: number, lo: number) =>
  Array.from({ length: 25 }, (_, i) => from - i).filter((n) => n >= lo).map((n) => (addr === "A" ? A(n) : B(n)));
const up = (addr: string, from: number, hi: number) =>
  Array.from({ length: 25 }, (_, i) => from + i).filter((n) => n <= hi).map((n) => (addr === "A" ? A(n) : B(n)));

describe("mergePage — one page of every chain, merged by time", () => {
  it("newest first: takes the page's rows across chains and advances each chain's cursor", () => {
    const p = mergePage(
      spans.map((s) => ({ addr: s.addr, rows: down(s.addr, s.hi, s.lo) })),
      10,
      "down",
    );
    // The ten newest by minute: A30·60 B20·60 A29·58 B19·57 A28·56 A27·54 B18·54 A26·52 B17·51
    // A25·50 — a tie keeps the chain order.
    expect(p.rows.map((r) => `${r.addr}${r.ordinal}`)).toEqual(["A30", "B20", "A29", "B19", "A28", "A27", "B18", "A26", "B17", "A25"]);
    expect(p.taken).toEqual({ A: 6, B: 4 });
  });
  it("oldest first: the page is the oldest rows, still listed newest first", () => {
    const p = mergePage(
      spans.map((s) => ({ addr: s.addr, rows: up(s.addr, s.lo, s.hi) })),
      5,
      "up",
    );
    // The five oldest: A1·2 B1·3 A2·4, then the tie at 6 — and a tie is the EXACT reverse of the
    // newest-first order, so both directions agree where a page ends. Listed newest first.
    expect(p.rows.map((r) => `${r.addr}${r.ordinal}`)).toEqual(["A3", "B2", "A2", "B1", "A1"]);
    expect(p.taken).toEqual({ A: 3, B: 2 });
  });
});

describe("lastPageSize — the oldest page holds what the newest-first pages leave over", () => {
  it("is the remainder, or a full page", () => {
    expect(lastPageSize(50, 25)).toBe(25);
    expect(lastPageSize(51, 25)).toBe(1);
    expect(lastPageSize(7, 25)).toBe(7);
    expect(lastPageSize(0, 25)).toBe(0);
  });
});
