import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOG } from "@/src/engine/config";
import { isLimitedNote, parseNoteParams, parseNoteRequest } from "./params";
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
    // The ledger's whole network is one subject: `dag` there IS `all` (identical facts, one note).
    expect(parseNoteParams(sp("view=ledger&subject=dag&span=hours"), NOW)).toEqual({ view: "ledger", subject: "all", span: "hours" });
    expect(parseNoteParams(sp("view=hyper&subject=dag&span=day"), NOW)).toEqual({ view: "hyper", subject: "dag", span: "day" });
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

  it("a well-formed brush with no span in it is no note, not an error (too short, empty, in the future)", () => {
    expect(parseNoteParams(sp(`view=trend&subject=dag&from=${NOW - D}&to=${NOW - D}`), NOW)).toEqual({ none: true });
    // inside the still-filling bucket at the live edge: nothing whole to describe once clamped
    expect(parseNoteParams(sp(`view=trend&subject=dag&from=${NOW}&to=${NOW + 1000}`), NOW)).toEqual({ none: true });
    expect(parseNoteParams(sp(`view=trend&subject=dag&from=${NOW + D}&to=${NOW + 2 * D}`), NOW)).toEqual({ none: true });
    expect(parseNoteRequest({ view: "trend", subject: "dag", fromMs: NOW - D, toMs: NOW - D }, NOW)).toEqual({ none: true });
  });

  it("Geography takes a network's country and a provider, fleet or network scoped; Hypergraph a network's make-up", () => {
    expect(parseNoteParams(sp(`view=geo&subject=${anId}/cc:FI`), NOW)).toEqual({ view: "geo", subject: `${anId}/cc:FI`, span: "day" });
    expect(parseNoteParams(sp("view=geo&subject=dag/cc:FI"), NOW)).toEqual({ view: "geo", subject: "dag/cc:FI", span: "day" });
    expect(parseNoteParams(sp("view=geo&subject=isp:hetzner-online"), NOW)).toEqual({ view: "geo", subject: "isp:hetzner-online", span: "day" });
    expect(parseNoteParams(sp(`view=geo&subject=${anId}/isp:hetzner-online`), NOW)).toEqual({ view: "geo", subject: `${anId}/isp:hetzner-online`, span: "day" });
    expect(parseNoteParams(sp(`view=hyper&subject=${anId}/type:l0+cl1`), NOW)).toEqual({ view: "hyper", subject: `${anId}/type:l0+cl1`, span: "day" });
    expect(parseNoteParams(sp(`view=hyper&subject=${anId}/type:none`), NOW)).toEqual({ view: "hyper", subject: `${anId}/type:none`, span: "day" });
  });

  it("a former address inside a subject note answers as its current id", () => {
    expect(parseNoteParams(sp(`view=geo&subject=${relisted.formerIds![0]}/cc:FI`), NOW)).toEqual({ view: "geo", subject: `${relisted.id}/cc:FI`, span: "day" });
  });

  it("refuses a subject note in the wrong view, an untracked network, a bad key or a make-up out of order", () => {
    for (const q of [`view=hyper&subject=${anId}/cc:FI`, `view=geo&subject=${anId}/type:l0`, `view=ledger&subject=${anId}/type:l0`, `view=trend&subject=${anId}/cc:FI&span=7d`,
      "view=geo&subject=nope/cc:FI", "view=geo&subject=isp:Hetzner", "view=geo&subject=isp:", `view=hyper&subject=${anId}/type:cl1+l0`, `view=hyper&subject=${anId}/type:l0+l0`, `view=hyper&subject=${anId}/type:l2`,
      `view=geo&subject=${anId}/cc:fi`, `view=geo&subject=${anId}/`])
      expect(parseNoteParams(sp(q), NOW), q).toHaveProperty("error");
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

  it("takes a subject note for Hypergraph or Geography with no span", () => {
    expect(parseNoteRequest({ view: "geo", subject: `${anId}/cc:FI` }, NOW)).toEqual({ view: "geo", subject: `${anId}/cc:FI`, span: "day" });
    expect(parseNoteRequest({ view: "hyper", subject: `${anId}/type:l0` }, NOW)).toEqual({ view: "hyper", subject: `${anId}/type:l0`, span: "day" });
  });

  it("refuses a view note, the warmed country, or a span beside a subject note", () => {
    for (const b of [{ view: "geo", subject: anId }, { view: "geo", subject: "cc:FI" }, { view: "geo", subject: `${anId}/cc:FI`, span: "day" }, { view: "ledger", subject: `${anId}/cc:FI` }])
      expect(parseNoteRequest(b, NOW)).toHaveProperty("error");
  });
});

describe("isLimitedNote", () => {
  it("is true for a brushed range and for every subject note", () => {
    expect(isLimitedNote("trend", anId, `r${NOW - 2 * D}-${NOW - D}`)).toBe(true);
    expect(isLimitedNote("geo", `${anId}/cc:FI`, "day")).toBe(true); expect(isLimitedNote("geo", "isp:x", "day")).toBe(true);
    expect(isLimitedNote("geo", "cc:FI", "day")).toBe(false); expect(isLimitedNote("hyper", anId, "day")).toBe(false);
    for (const s of ["1h", "24h", "7d", "30d", "1y", "all"] as const) expect(isLimitedNote("trend", anId, s)).toBe(false);
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
