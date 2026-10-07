import { describe, it, expect } from "vitest";
import { METAGRAPHS } from "@/src/net/current";
import { UNLISTED_ID } from "@/src/data/unlistedId";
import { scopeEmptyCopy, stackRoster, trendRoster, trendScope, viewScope } from "./trendScope";

// WHAT THE COMMITTED FILTER DOES TO THE MEASURED HISTORY (2026-09-19). Two registers read this —
// the History view's chart planes and the Trends document's per-network columns — and both have
// to answer a `dag`/unlisted commit the SAME way, or one of them renders a blank stage while the
// other explains itself. So the classification and the sentences live here, once.
//
// Rule 10 is the whole content: the trends store keys its series per LISTED metagraph, so the
// base ledger and the unlisted channels genuinely have nothing measured — that is a fact to
// state, never an empty list to draw.

const catalogIds = METAGRAPHS.filter((m) => m.id).map((m) => m.id!);

describe("trendRoster — the networks a scope draws", () => {
  it("is every catalog metagraph at 'all'", () => {
    expect(trendRoster("all")).toEqual(catalogIds);
  });

  it("narrows to the ONE committed catalog metagraph", () => {
    const id = catalogIds[0];
    expect(trendRoster(id)).toEqual([id]);
  });

  it("is EMPTY for the base ledger and for the unlisted channels", () => {
    expect(trendRoster("dag")).toEqual([]);
    expect(trendRoster(UNLISTED_ID)).toEqual([]);
  });
});

describe("trendScope — which of the four states the filter puts the view in", () => {
  it("names each state", () => {
    expect(trendScope("all")).toBe("all");
    expect(trendScope(catalogIds[0])).toBe("network");
    expect(trendScope("dag")).toBe("empty-dag");
    expect(trendScope(UNLISTED_ID)).toBe("empty-unlisted");
  });

  it("treats any other uncataloged id as an unlisted channel", () => {
    // A channel address committed from the chamber's unknown lane is not in the catalog either,
    // and the reading it lacks is the same reading.
    expect(trendScope("DAG0nowhere")).toBe("empty-unlisted");
  });
});

describe("scopeEmptyCopy — the fact, plus the route THIS surface can offer", () => {
  it("says nothing where there IS something to draw", () => {
    expect(scopeEmptyCopy("all", "view")).toBeNull();
    expect(scopeEmptyCopy("network", "document")).toBeNull();
  });

  it("states the same FACT in both registers, and a different route in each", () => {
    const inView = scopeEmptyCopy("empty-unlisted", "view")!;
    const inDoc = scopeEmptyCopy("empty-unlisted", "document")!;
    expect(inView.fact).toBe(inDoc.fact);
    // The empty-state rule: each route names a gesture available on the surface saying it.
    expect(scopeEmptyCopy("empty-dag", "document")!.route).toMatch(/Hypergraph tab/);
    // The VIEW never has an empty DAG (it draws the hypergraph's own plane — `viewScope`), so it
    // has no sentence for one.
    expect(scopeEmptyCopy("empty-dag", "view")).toBeNull();
  });

  it("covers the unlisted scope too, and never fabricates a chart", () => {
    for (const surface of ["view", "document"] as const) {
      const c = scopeEmptyCopy("empty-unlisted", surface)!;
      expect(c.fact).toMatch(/listed network/); // their one measured quantity, and how
      expect(c.route).toMatch(/Snapshots/); // the measure that draws it
      expect(c.route.length).toBeGreaterThan(0);
    }
  });

  // The app-wide plain-writing rule (railCards.ts's ghost-hint block): a statement that needs two
  // clauses gets two sentences, never a dash clause. Both sentences a reader sees are checked.
  it("carries no dash clause in anything a reader sees", () => {
    for (const scope of ["empty-dag", "empty-unlisted"] as const) {
      for (const surface of ["view", "document"] as const) {
        const c = scopeEmptyCopy(scope, surface);
        if (c) expect(`${c.fact} ${c.route}`).not.toMatch(/[—–]|\s-\s/);
      }
    }
  });
});

describe("the scene's roster and scope — the hypergraph's own plane under the DAG filter (2026-09-26)", () => {
  it("draws the one id `dag` under the DAG filter, and the document's roster otherwise", () => {
    expect(stackRoster("dag")).toEqual(["dag"]);
    expect(stackRoster("all")).toEqual(trendRoster("all"));
    expect(stackRoster(catalogIds[0])).toEqual([catalogIds[0]]);
    expect(stackRoster(UNLISTED_ID)).toEqual([]);
  });

  it("scopes the DAG as a network in the view, and leaves the document's empty state alone", () => {
    expect(viewScope("dag")).toBe("network");
    expect(viewScope("all")).toBe("all");
    expect(viewScope(UNLISTED_ID)).toBe("empty-unlisted");
    expect(trendScope("dag")).toBe("empty-dag");
  });
});
