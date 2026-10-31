import { describe, it, expect } from "vitest";
import { countryNoteReq, noteScopeOf, providerNoteReq, rangeNoteReq, typeNoteReq } from "./subjectNote";

// A SUBJECT CARD'S OWN NOTE (spec 2026-10-29-subject-notes): the request each card asks with, in
// the subject forms the server accepts — scoped as the card's lead is.

const unl = (id: string) => id === "unlisted";

describe("noteScopeOf", () => {
  it("is the fleet (null) with no filter, the network under one, and none (undefined) for the unlisted network", () => {
    expect(noteScopeOf("all", unl)).toBeNull();
    expect(noteScopeOf(null, unl)).toBeNull();
    expect(noteScopeOf("dor", unl)).toBe("dor");
    expect(noteScopeOf("dag", unl)).toBe("dag");
    expect(noteScopeOf("unlisted", unl)).toBeUndefined();
  });
});

describe("the subject notes' requests", () => {
  it("a country note is fleet scoped with no filter, network scoped under one, none for the unlisted network", () => {
    expect(countryNoteReq("FI", "all", unl)).toEqual({ view: "geo", subject: "cc:FI" });
    expect(countryNoteReq("FI", null, unl)).toEqual({ view: "geo", subject: "cc:FI" });
    expect(countryNoteReq("FI", "dor", unl)).toEqual({ view: "geo", subject: "dor/cc:FI" });
    expect(countryNoteReq("FI", "dag", unl)).toEqual({ view: "geo", subject: "dag/cc:FI" });
    expect(countryNoteReq("FI", "unlisted", unl)).toBeNull();
  });

  it("a provider note keys the display name the sampler's way, and has none without a provider", () => {
    expect(providerNoteReq("Hetzner Online GmbH", "all", unl)).toEqual({ view: "geo", subject: "isp:hetzner-online-gmbh" });
    expect(providerNoteReq("Hetzner Online GmbH", "dor", unl)).toEqual({ view: "geo", subject: "dor/isp:hetzner-online-gmbh" });
    expect(providerNoteReq(null, "dor", unl)).toBeNull();
    expect(providerNoteReq("---", "dor", unl)).toBeNull();
  });

  it("a make-up note spells the composition key's codes as a role key", () => {
    expect(typeNoteReq({ netId: "dor", key: "Hybrid|L0·cL1" }, unl)).toEqual({ view: "hyper", subject: "dor/type:l0+cl1" });
    expect(typeNoteReq({ netId: "dor", key: "Unknown|" }, unl)).toEqual({ view: "hyper", subject: "dor/type:none" });
    expect(typeNoteReq({ netId: "unlisted", key: "Data|dL1" }, unl)).toBeNull();
    // The DAG core: no stored make-up series, so no ask that could only answer `none`.
    expect(typeNoteReq({ netId: "dag", key: "Data|dL1" }, unl)).toBeNull();
  });

  it("a range note stands on the plane's network, the hypergraph for all / dag / none, and only while a range is brushed", () => {
    expect(rangeNoteReq("dor", { fromMs: 1, toMs: 2 }, unl)).toEqual({ view: "trend", subject: "dor", span: "r1-2" });
    for (const c of ["all", "dag", null]) expect(rangeNoteReq(c, { fromMs: 1, toMs: 2 }, unl)).toEqual({ view: "trend", subject: "dag", span: "r1-2" });
    expect(rangeNoteReq("dor", null, unl)).toBeNull();
    // A brush read off the pointer is fractional; the span is whole milliseconds (digits only).
    expect(rangeNoteReq("dor", { fromMs: 1716000000123.456, toMs: 1716003600999.5 }, unl)?.span).toBe("r1716000000123-1716003601000");
    expect(rangeNoteReq("unlisted", { fromMs: 1, toMs: 2 }, unl)).toBeNull();
  });
});
