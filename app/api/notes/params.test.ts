import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOG } from "@/src/engine/config";
import { isLimitedSpan, parseNoteParams, parseNoteRequest } from "./params";
import { snapSpan } from "./keys";

const H = 3_600_000;
const D = 86_400_000;
const NOW = Date.UTC(2026, 9, 27, 12, 30);
const sp = (q: string) => new URLSearchParams(q);
// The catalog's own re-registered network: a former address must read as its current id.
const relisted = CATALOG.mainnet.find((m) => m.formerIds?.length)!;
const anId = CATALOG.mainnet[0]!.id;

describe("parseNoteParams", () => {
  it("Geography takes a country subject; its span is fixed to the day", () => {
    expect(parseNoteParams(sp("view=geo&subject=cc:DE"), NOW)).toEqual({ view: "geo", subject: "cc:DE", span: "day" });
  });

  it("a country is Geography's alone", () => {
    expect(parseNoteParams(sp("view=hyper&subject=cc:DE"), NOW)).toHaveProperty("error");
    expect(parseNoteParams(sp("view=geo&subject=cc:de"), NOW)).toHaveProperty("error");
    expect(parseNoteParams(sp("view=geo&subject=cc:DEU"), NOW)).toHaveProperty("error");
  });

  it("an untracked network is no subject", () => {
    expect(parseNoteParams(sp("view=hyper&subject=DAGnotTracked"), NOW)).toHaveProperty("error");
    expect(parseNoteParams(sp("view=hyper"), NOW)).toHaveProperty("error");
  });

  it("a tracked network, all and dag are subjects; hyper's span is the day, the ledger's the hours", () => {
    expect(parseNoteParams(sp(`view=hyper&subject=${anId}`), NOW)).toEqual({ view: "hyper", subject: anId, span: "day" });
    expect(parseNoteParams(sp("view=ledger&subject=all"), NOW)).toEqual({ view: "ledger", subject: "all", span: "hours" });
    expect(parseNoteParams(sp("view=ledger&subject=dag&span=hours"), NOW)).toEqual({ view: "ledger", subject: "dag", span: "hours" });
  });

  it("a fixed-span view refuses any other span", () => {
    expect(parseNoteParams(sp("view=ledger&subject=all&span=7d"), NOW)).toHaveProperty("error");
  });

  it("a former address is answered as its network's current id", () => {
    const former = relisted.formerIds![0]!;
    expect(parseNoteParams(sp(`view=trend&subject=${former}&span=7d`), NOW)).toEqual({ view: "trend", subject: relisted.id, span: "7d" });
  });

  it("an unknown view is an error", () => {
    expect(parseNoteParams(sp("view=status&subject=all"), NOW)).toHaveProperty("error");
    expect(parseNoteParams(sp("subject=all"), NOW)).toHaveProperty("error");
  });

  it("History takes a pill", () => {
    expect(parseNoteParams(sp("view=trend&subject=dag&span=7d"), NOW)).toEqual({ view: "trend", subject: "dag", span: "7d" });
    for (const p of ["1h", "24h", "30d", "1y", "all"])
      expect(parseNoteParams(sp(`view=trend&subject=dag&span=${p}`), NOW)).toMatchObject({ span: p });
  });

  it("a span that is no pill is an error", () => {
    expect(parseNoteParams(sp("view=trend&subject=dag&span=90d"), NOW)).toHaveProperty("error");
    expect(parseNoteParams(sp("view=trend&subject=dag"), NOW)).toHaveProperty("error");
  });

  it("a brushed range is snapped, so near-identical brushes share one key", () => {
    const from = NOW - 2 * D + 61_000;
    const to = NOW - D - 17_000;
    const snapped = snapSpan(from, to, NOW)!;
    expect(parseNoteParams(sp(`view=trend&subject=dag&from=${from}&to=${to}`), NOW)).toEqual({
      view: "trend", subject: "dag", span: `r${snapped.fromMs}-${snapped.toMs}`,
    });
  });

  it("a reversed, malformed or half range is an error", () => {
    expect(parseNoteParams(sp(`view=trend&subject=dag&from=${NOW - D}&to=${NOW - 2 * D}`), NOW)).toHaveProperty("error");
    expect(parseNoteParams(sp(`view=trend&subject=dag&from=1e12&to=${NOW}`), NOW)).toHaveProperty("error");
    expect(parseNoteParams(sp(`view=trend&subject=dag&from=-5&to=${NOW}`), NOW)).toHaveProperty("error");
    expect(parseNoteParams(sp(`view=trend&subject=dag&from=${NOW - D}`), NOW)).toHaveProperty("error");
    expect(parseNoteParams(sp(`view=trend&subject=dag&span=7d&from=${NOW - D}&to=${NOW}`), NOW)).toHaveProperty("error");
  });

  it("an error never echoes the raw input", () => {
    const res = parseNoteParams(sp("view=<script>&subject=all"), NOW);
    expect(JSON.stringify(res)).not.toContain("<script>");
  });
});

describe("parseNoteRequest (the request route's body)", () => {
  it("takes the 1h pill or a brushed range, for History", () => {
    expect(parseNoteRequest({ view: "trend", subject: "dag", span: "1h" }, NOW)).toEqual({ view: "trend", subject: "dag", span: "1h" });
    const range = parseNoteRequest({ view: "trend", subject: "dag", fromMs: NOW - 2 * D, toMs: NOW - D }, NOW);
    expect(range).toEqual({ view: "trend", subject: "dag", span: `r${NOW - 2 * D}-${NOW - D}` });
  });

  it("refuses every other kind, view and shape", () => {
    expect(parseNoteRequest({ view: "trend", subject: "dag", span: "7d" }, NOW)).toHaveProperty("error");
    expect(parseNoteRequest({ view: "hyper", subject: "all", span: "1h" }, NOW)).toHaveProperty("error");
    expect(parseNoteRequest({ view: "trend", subject: "dag", fromMs: "1", toMs: NOW }, NOW)).toHaveProperty("error");
    expect(parseNoteRequest({ view: "trend", subject: "dag", fromMs: NOW - H }, NOW)).toHaveProperty("error");
    expect(parseNoteRequest(null, NOW)).toHaveProperty("error");
    expect(parseNoteRequest("trend", NOW)).toHaveProperty("error");
    expect(parseNoteRequest({ view: "trend", subject: "DAGnotTracked", span: "1h" }, NOW)).toHaveProperty("error");
  });
});

describe("isLimitedSpan", () => {
  it("is true for a brushed range only", () => {
    expect(isLimitedSpan(`r${NOW - 2 * D}-${NOW - D}`)).toBe(true);
    for (const s of ["1h", "24h", "7d", "30d", "1y", "all", "day", "hours"] as const) expect(isLimitedSpan(s)).toBe(false);
  });
});

describe("a tracked address with no current id", () => {
  afterEach(() => {
    vi.doUnmock("@/src/net/lineage");
    vi.resetModules();
  });

  it("is rejected rather than passed on", async () => {
    vi.resetModules();
    vi.doMock("@/src/net/lineage", async (orig) => ({
      ...(await orig<typeof import("@/src/net/lineage")>()),
      isTracked: () => true,
      currentIdOf: () => "",
    }));
    const { parseNoteParams: parse } = await import("./params");
    expect(parse(sp("view=trend&subject=DAGorphan&span=7d"), NOW)).toHaveProperty("error");
  });
});
