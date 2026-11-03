import { describe, expect, it } from "vitest";
import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";
import type { ChainReader, SnapRead } from "../notes/snapshotAt";
import { WINDOW_AFTER, WINDOW_BEFORE, chainCursor, globalCursor, readWindow, windowBounds, type WindowDeps } from "./window";

// A fake explorer: a global chain one tick every 10 s from T0, and one metagraph chain anchoring
// two records into every global tick (stamped with the global's own timestamp, the join).
const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);
const TIP = 200;
const iso = (o: number) => new Date(T0 + o * 10_000).toISOString();
const glob = (o: number): GlobalSnapshot => ({ ordinal: o, timestamp: iso(o), hash: `g${o}`, metagraphSnapshotCount: 2 });
const chainRec = (o: number): RawMetaSnapshot => ({ ordinal: o, timestamp: iso(Math.ceil(o / 2)), hash: `m${o}`, lastSnapshotHash: `m${o - 1}`, fee: 1, sizeInKB: 1 } as RawMetaSnapshot);
const read = (r: { ordinal: number; hash: string; timestamp: string }): SnapRead => ({ ordinal: r.ordinal, hash: r.hash, timestamp: r.timestamp });

function deps(over: Partial<WindowDeps> & { listFloor?: number } = {}): WindowDeps & { urls: string[] } {
  const urls: string[] = [];
  const reader: ChainReader = {
    latest: async (chain) => read(chain == null ? glob(TIP) : chainRec(2 * TIP)),
    at: async (chain, o) => (o < 1 ? null : read(chain == null ? glob(o) : chainRec(o))),
  };
  const getJson = async (url: string) => {
    urls.push(url);
    const one = /global-snapshots\/(\d+)$/.exec(url);
    if (one) return { data: glob(Number(one[1])) };
    const list = /global-snapshots\?limit=(\d+)&next=(.+)$/.exec(url);
    if (list) {
      const { ordinal } = JSON.parse(Buffer.from(decodeURIComponent(list[2]!), "base64").toString()) as { ordinal: string };
      const top = parseInt(ordinal, 16);
      if (over.listFloor != null && top < over.listFloor) return { data: [] };
      return { data: Array.from({ length: Number(list[1]) }, (_, i) => glob(top - i)) };
    }
    const chain = /currency\/c\/snapshots\?limit=(\d+)&next=(.+)$/.exec(url);
    if (chain) {
      const { hash } = JSON.parse(Buffer.from(decodeURIComponent(chain[2]!), "base64").toString()) as { hash: string };
      const top = Number(hash.slice(1));
      return { data: Array.from({ length: Math.min(Number(chain[1]), top) }, (_, i) => chainRec(top - i)) };
    }
    return null;
  };
  return { be: "be", reader, getJson, chainIds: ["c"], ...over, urls };
}

describe("windowBounds", () => {
  it("is the pin with its context before and after, never past the tip", () => {
    expect(windowBounds(100, 500)).toEqual({ from: 100 - WINDOW_BEFORE, to: 100 + WINDOW_AFTER });
    expect(windowBounds(495, 500)).toEqual({ from: 495 - WINDOW_BEFORE, to: 500 });
    expect(windowBounds(10, 500).from).toBe(1);
  });
});

describe("the explorer cursors", () => {
  it("are the explorer's two dialects, base64 JSON", () => {
    expect(JSON.parse(Buffer.from(globalCursor("2026-11-02T08:00:00.000Z", 255), "base64").toString())).toEqual({ created_at: "2026-11-02T08:00:00.000Z", ordinal: "ff" });
    expect(JSON.parse(Buffer.from(chainCursor("abc"), "base64").toString())).toEqual({ hash: "abc" });
  });
});

describe("readWindow", () => {
  it("reads the window's global snapshots in one list read, oldest first", async () => {
    const d = deps();
    const w = (await readWindow(d, 100))!;
    expect(w.globals.map((g) => g.ordinal)).toEqual(Array.from({ length: WINDOW_BEFORE + WINDOW_AFTER + 1 }, (_, i) => 100 - WINDOW_BEFORE + i));
    expect(d.urls.filter((u) => /global-snapshots\/\d+$/.test(u))).toHaveLength(1); // only the head, for its timestamp
  });

  it("reads each ordinal on its own below the list's floor", async () => {
    const w = (await readWindow(deps({ listFloor: 1000 }), 100))!;
    expect(w.globals).toHaveLength(WINDOW_BEFORE + WINDOW_AFTER + 1);
  });

  it("keeps every chain record anchored inside the span and none outside it", async () => {
    const w = (await readWindow(deps(), 100))!;
    const first = Date.parse(w.globals[0]!.timestamp);
    const last = Date.parse(w.globals.at(-1)!.timestamp);
    const rows = w.chains.c!;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => Date.parse(r.timestamp) >= first && Date.parse(r.timestamp) <= last)).toBe(true);
    expect(rows.length).toBe(2 * (WINDOW_BEFORE + WINDOW_AFTER + 1)); // two records per tick, the span whole
  });

  it("fails, never answers \"anchored nothing\", when a chain read fails or a page is cut short", async () => {
    const broken = deps({ getJson: async (url: string) => { if (/currency/.test(url)) throw new Error("be 503"); return deps().getJson(url); } });
    await expect(readWindow(broken, 100)).rejects.toThrow();
    const flaky = deps({ reader: { latest: async (chain) => { if (chain != null) throw new Error("timeout"); return read(glob(TIP)); }, at: deps().reader.at } });
    await expect(readWindow(flaky, 100)).rejects.toThrow();
  });

  it("is nothing for a pin the chain does not hold, and leaves a chain with nothing in the span out", async () => {
    expect(await readWindow(deps(), TIP + 5)).toBeNull();
    const quiet = deps({ reader: { latest: async (chain) => (chain == null ? read(glob(TIP)) : read(chainRec(4))), at: async (chain, o) => read(chain == null ? glob(o) : chainRec(o)) } });
    expect((await readWindow(quiet, 150))!.chains).toEqual({});
  });
});
