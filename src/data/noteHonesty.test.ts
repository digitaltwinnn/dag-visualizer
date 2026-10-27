import { describe, it, expect } from "vitest";
import { bannedWords, checkNote, undash } from "@/src/data/noteHonesty";
import type { Fact } from "@/src/data/noteTypes";

const F = (label: string, value: number, kind: Fact["kind"], text: string): Fact => ({ label, value, kind, text });
const facts = [
  F("USDC.dag snapshots anchored, ratio to previous span", 2.48, "ratio", "2.48"),
  F("BioFi snapshots anchored, ratio to previous span", 1.37, "ratio", "1.37"),
  F("Global snapshots in span", 12159, "count", "12,159"),
  F("Networks anchoring", 3, "count", "3"),
  F("Hetzner share of nodes", 0.58, "share", "58%"),
  F("Longest pause", 79200, "duration", "22h"),
  F("Busiest day", Date.UTC(2026, 9, 19), "date", "Oct 19"),
];
const names = ["USDC.dag", "BioFi", "Hetzner Online GmbH"];
const ok = (t: string, o?: { maxSentences?: number }) => checkNote(t, facts, names, o).ok;

describe("checkNote — numbers must be backed by a fact", () => {
  it("passes a note with no numbers that a ratio fact backs", () => {
    expect(checkNote("USDC.dag more than doubled its pace.", facts, names)).toEqual({ ok: true });
  });
  it("matches a percentage to a ratio as (r-1)*100", () => {
    expect(ok("BioFi rose by 37% against the span before.")).toBe(true);
  });
  it("matches a count written in full, and compacted within its written precision", () => {
    expect(ok("The hypergraph made 12,159 global snapshots.")).toBe(true);
    expect(ok("The hypergraph made 12.2K global snapshots.")).toBe(true);
  });
  it("rejects a count no fact holds", () => {
    expect(ok("The hypergraph made 205,723 global snapshots.")).toBe(false);
  });
  it("reads number words, and a date phrase is not a number", () => {
    expect(ok("Three networks anchored on Oct 19.")).toBe(true);
    expect(ok("Five networks anchored.")).toBe(false);
  });
  it("leaves a date that no date fact holds to be checked as a number", () => {
    expect(ok("Three networks anchored on Oct 20.")).toBe(false);
  });
  it("matches a percentage to a share and a duration to seconds", () => {
    expect(ok("Hetzner carries 58% of the nodes.")).toBe(true);
    expect(ok("The longest pause lasted 22 hours.")).toBe(true);
    expect(ok("The longest pause lasted 30 hours.")).toBe(false);
  });
  it("reads every written form of a ratio, a date and a duration", () => {
    expect(ok("USDC.dag ran at 2.5x the previous span, 2.5 times in all.")).toBe(true);
    expect(ok("USDC.dag ran at 3x the previous span.")).toBe(false);
    expect(ok("Busiest on October 19, 2026, 19 Oct and 2026-10-19.")).toBe(true);
    expect(ok("The pause ran 1320 minutes.")).toBe(true);
    expect(ok("The pause ran 45s.")).toBe(false);
  });
  it("does not read number words inside other words", () => {
    expect(ok("Someone noticed none, often.")).toBe(true);
  });
  it("does not let a layer name count as a number", () => {
    expect(ok("Nodes run L0 and data L1 layers.")).toBe(true);
  });
});

describe("checkNote — a written zero needs a measured zero", () => {
  const f = (v: number): Fact[] => [{ label: "X snapshots anchored, per day", value: v, kind: "count", text: String(v) }];
  it("is not backed by a small non-zero value", () => {
    expect(checkNote("X anchored 0 snapshots a day.", f(0.03), ["X"]).ok).toBe(false);
    expect(checkNote("X anchored 0 snapshots a day.", f(0), ["X"])).toEqual({ ok: true });
  });
});

describe("checkNote — ratio words need a ratio fact of that size", () => {
  it("holds a named network to its own ratio", () => {
    expect(ok("BioFi more than doubled its pace.")).toBe(false); // 1.37 < 2, even though USDC.dag's 2.48 exists
    expect(ok("BioFi tripled.")).toBe(false);
    expect(ok("USDC.dag doubled its pace.")).toBe(true);
    expect(ok("USDC.dag tripled.")).toBe(false); // 2.48 < 2.95
  });
  it("takes an unattributed ratio fact when no network is named", () => {
    expect(ok("The pace doubled.")).toBe(false); // only named networks' ratios exist; a nameless sentence cannot borrow one
    expect(checkNote("The pace doubled.", [F("Snapshots anchored, ratio to previous span", 2.1, "ratio", "2.1")], names).ok).toBe(true);
    expect(ok("The pace quadrupled.")).toBe(false);
    expect(ok("The pace halved.")).toBe(false);
  });
});

describe("checkNote — the house voice", () => {
  it("rejects an em dash and a spaced en dash or hyphen, but not a joining hyphen", () => {
    expect(ok("USDC.dag doubled — a busy week.")).toBe(false);
    expect(ok("USDC.dag doubled – a busy week.")).toBe(false);
    expect(ok("USDC.dag doubled - a busy week.")).toBe(false);
    expect(ok("Data-fingerprinting kept a steady pace.")).toBe(true);
  });
  it("rejects banned vocabulary, on word starts only", () => {
    for (const bad of ["machines", "ticks", "L1 snapshots", "feeless", "decentralised", "decentralization"])
      expect(ok(`USDC.dag doubled its ${bad}.`), bad).toBe(false);
    expect(ok("A sticky pace.")).toBe(true);
  });
  it("lets a name carry a banned word, since the name is not the model's prose", () => {
    expect(checkNote("TickTock doubled.", facts, ["TickTock"]).ok).toBe(false); // no ratio fact names it
    expect(checkNote("TickTock held steady.", facts, ["TickTock"]).ok).toBe(true);
  });
  it("caps the sentence count, 3 by default and as asked", () => {
    expect(ok("One. Two. Three. Four.")).toBe(false);
    expect(ok("The pace held. It stayed calm. Nothing moved.")).toBe(true);
    expect(ok("USDC.dag doubled. BioFi rose.", { maxSentences: 1 })).toBe(false);
    expect(ok("USDC.dag doubled its pace.", { maxSentences: 1 })).toBe(true);
  });
  it("does not split a sentence on a dot inside a name or a number", () => {
    expect(ok("USDC.dag ran at 2.5x the previous span.", { maxSentences: 1 })).toBe(true);
  });
  it("names the banned words it finds, and turns a dash clause into a comma", () => {
    expect(bannedWords("Fast, feeless transfers on decentralized nodes, not machines.")).toEqual(["feeless", "decentrali", "machine"]);
    expect(bannedWords("A sticky pace.")).toEqual([]);
    expect(undash("Proof of data — anchored to the Global L0.")).toBe("Proof of data, anchored to the Global L0.");
    expect(undash("Proof of data – anchored - here.")).toBe("Proof of data, anchored, here.");
    expect(undash("Data-fingerprinting as a service.")).toBe("Data-fingerprinting as a service.");
    expect(ok(undash("USDC.dag held steady — a calm week."))).toBe(true);
  });
  it("rejects an empty note and reports a reason per failure", () => {
    expect(ok("   ")).toBe(false);
    const r = checkNote("Five machines — all busy.", facts, names);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.length).toBe(3);
  });
});

describe("checkNote — a named network is held to its own ratio, in tokens as in words", () => {
  it("rejects another network's x or % under a name", () => {
    expect(ok("BioFi ran at 2.5x its previous pace.")).toBe(false); // 2.5 is USDC.dag's
    expect(ok("BioFi rose by 148%.")).toBe(false); // from USDC.dag's 2.48
    expect(ok("USDC.dag ran at 2.5x its previous pace.")).toBe(true);
  });
  it("lets a % borrow a ratio only when the sentence names its network", () => {
    expect(ok("Hetzner carries 37% of the nodes.")).toBe(false); // BioFi's ratio, not a share
    expect(ok("Hetzner carries 58% of the nodes.")).toBe(true);
  });
});

describe("checkNote — quantity words it cannot verify fail closed", () => {
  it("rejects word quantities no fact is compared against", () => {
    for (const bad of [
      "Thirty networks anchored.", "Over a thousand nodes ran.", "Hundreds of nodes.",
      "Half the nodes run on Hetzner.", "BioFi grew threefold.", "BioFi's pace tenfold.",
      "BioFi doubles its pace.", "BioFi tripling its pace.", "Dozens of nodes ran.",
    ]) expect(ok(bad), bad).toBe(false);
  });
  it("keeps the checked ratio words and a dozen", () => {
    expect(ok("USDC.dag more than doubled its pace.")).toBe(true);
    expect(ok("USDC.dag doubled its pace.")).toBe(true);
    expect(ok("A dozen nodes ran.")).toBe(false); // 12 is backed by no fact
    expect(checkNote("A dozen nodes ran.", [F("Nodes", 12, "count", "12")], names).ok).toBe(true);
  });
  it("names the word in the reason", () => {
    const r = checkNote("Thirty networks anchored.", facts, names);
    expect(!r.ok && r.reasons).toContain("unverifiable quantity word: Thirty");
  });
});

describe("checkNote — a percentage is read in the direction the sentence says", () => {
  it("rejects a fall for a rising ratio, and a rise for a falling one", () => {
    expect(ok("BioFi fell by 37%.")).toBe(false);
    expect(ok("BioFi rose by 37%.")).toBe(true);
    const down = [F("BioFi snapshots anchored, ratio to previous span", 0.63, "ratio", "0.63")];
    expect(checkNote("BioFi fell by 37%.", down, names).ok).toBe(true);
    expect(checkNote("BioFi grew by 37%.", down, names).ok).toBe(false);
  });
  it("leaves all three readings with no direction verb", () => {
    expect(ok("BioFi moved by 37%.")).toBe(true);
  });
});

describe("checkNote — a nameless sentence cites only unattributed ratios", () => {
  const whole = [...facts, F("Snapshots anchored, ratio to previous span", 1.37, "ratio", "1.37")];
  const w = (t: string) => checkNote(t, whole, names).ok;
  it("lets a whole-network ratio back a %, an x and a ratio word", () => {
    expect(w("Snapshots anchored rose by 37% against the week before.")).toBe(true);
    expect(w("Global snapshots ran at 1.37x the usual pace.")).toBe(true);
    expect(w("Global snapshots doubled.")).toBe(false); // 1.37 is no doubling, and 2.48 is USDC.dag's
  });
  it("never borrows a named network's ratio", () => {
    expect(ok("Global snapshots ran at 2.5x the usual pace.")).toBe(false);
    expect(w("Global snapshots ran at 2.5x the usual pace.")).toBe(false);
    expect(ok("Hetzner carries 37% of the nodes.")).toBe(false);
    expect(w("BioFi rose by 37% against the span before.")).toBe(true);
  });
});

describe("checkNote — a ratio quoted as written (R33)", () => {
  const usual = F("Global snapshots per hour, ratio of recent to usual", 0.98, "ratio", "0.98");
  it("lets a plain number back itself when it IS an own ratio fact's text", () => {
    expect(checkNote("Global snapshots ran at a ratio of 0.98 to the usual rate.", [usual], names).ok).toBe(true);
  });
  it("a different decimal still fails", () => {
    expect(checkNote("Global snapshots ran at a ratio of 0.97 to the usual rate.", [usual], names).ok).toBe(false);
  });
  it("a named network's ratio text never backs a nameless sentence", () => {
    expect(ok("Global snapshots ran at a ratio of 1.37 to the span before.")).toBe(false);
    expect(ok("BioFi ran at a ratio of 1.37 to the span before.")).toBe(true);
  });
});

describe("checkNote — the DAG currency is a unit, not a network, and labels match whole words", () => {
  const hgNames = ["DAG", "USDC.dag", "BioFi", "Niger", "Nigeria"];
  const fees = (hg: number, usdc: number): Fact[] => [
    F("Fees, ratio to previous span", hg, "ratio", hg.toFixed(2)),
    F("USDC.dag fees, ratio to previous span", usdc, "ratio", usdc.toFixed(2)),
    F("Fees, per day, this span", 1200, "amount", "1.2K"),
  ];
  const probe = "Fees fell by 40% to 1.2K DAG per day.";
  it("passes History's commonest note: the hypergraph's own fall, priced in DAG", () => {
    expect(checkNote(probe, fees(0.6, 0.9), hgNames).ok).toBe(true);
  });
  it("never lets the unit borrow USDC.dag's ratio (substring 'dag')", () => {
    expect(checkNote(probe, fees(0.9, 0.6), hgNames).ok).toBe(false);
  });
  it("a network named in the sentence still names it, the unit aside", () => {
    expect(checkNote("USDC.dag fees fell by 40% to 1.2K DAG per day.", fees(0.9, 0.6), hgNames).ok).toBe(true);
    expect(checkNote("USDC.dag fees fell by 40% to 1.2K DAG per day.", fees(0.6, 0.9), hgNames).ok).toBe(false);
  });
  it("a name inside a longer word is not that name (Niger in Nigeria)", () => {
    const geo = [F("Nigeria, nodes now against a month ago", 1.5, "ratio", "1.50"), F("Niger, nodes now against a month ago", 1.2, "ratio", "1.20")];
    expect(checkNote("Niger grew by 20% in a month.", geo, hgNames).ok).toBe(true);
    expect(checkNote("Niger grew by 50% in a month.", geo, hgNames).ok).toBe(false);
  });
});

describe("checkNote — a nameless sentence cites the SUBJECT's own ratios (R39)", () => {
  const nf = [
    F("USDC.dag snapshots anchored, ratio to previous span", 1.37, "ratio", "1.37"),
    F("BioFi snapshots anchored, ratio to previous span", 1.5, "ratio", "1.50"),
    F("Located nodes in the fleet, now against a month ago", 1.1, "ratio", "1.10"),
  ];
  const nn = ["USDC.dag", "BioFi"];
  it("a pronoun sentence passes on a network subject, citing its own ratio", () => {
    expect(checkNote("Its snapshots anchored rose by 37%.", nf, nn, { subject: "USDC.dag" }).ok).toBe(true);
  });
  it("still cannot borrow ANOTHER network's ratio", () => {
    expect(checkNote("Its snapshots anchored rose by 50%.", nf, nn, { subject: "USDC.dag" }).ok).toBe(false);
  });
  it("on a network subject an unattributed ratio is not its own", () => {
    expect(checkNote("Its nodes rose by 10%.", nf, nn, { subject: "USDC.dag" }).ok).toBe(false);
  });
  it("without a subject (the whole network), the unattributed ratios stay citable", () => {
    expect(checkNote("Located nodes rose by 10%.", nf, nn).ok).toBe(true);
    expect(checkNote("Its snapshots anchored rose by 37%.", nf, nn).ok).toBe(false);
  });
  it("works for a country subject by its display name", () => {
    const geo = [F("Germany, nodes now against a month ago", 1.2, "ratio", "1.20"), F("France, nodes now against a month ago", 1.4, "ratio", "1.40")];
    const g = ["Germany", "France"];
    expect(checkNote("Its nodes grew by 20% in a month.", geo, g, { subject: "Germany" }).ok).toBe(true);
    expect(checkNote("Its nodes grew by 40% in a month.", geo, g, { subject: "Germany" }).ok).toBe(false);
  });
});

describe("checkNote — ordinal rank words need a matching rank fact", () => {
  const ranks = [
    F("BioFi rank by nodes", 2, "count", "2"),
    F("USDC.dag, nodes (second biggest network)", 40, "count", "40"),
  ];
  const r = (t: string) => checkNote(t, ranks, ["BioFi", "USDC.dag"]).ok;
  it("passes an ordinal a rank fact holds", () => {
    expect(r("BioFi is the second biggest network by nodes.")).toBe(true);
    expect(r("USDC.dag is the second biggest network.")).toBe(true);
  });
  it("rejects an ordinal no rank fact holds", () => {
    expect(r("BioFi is the third biggest network by nodes.")).toBe(false);
    expect(checkNote("BioFi is the second biggest network.", [F("Networks with nodes", 5, "count", "5")], ["BioFi"]).ok).toBe(false);
  });
  it("leaves a time unit and an indefinite 'a second' alone", () => {
    expect(checkNote("Fees ran at 1 second a snapshot.", [F("Mean spacing", 1, "duration", "1s")], []).ok).toBe(true);
    expect(checkNote("BioFi anchored for a second straight span.", [], ["BioFi"]).ok).toBe(true);
  });
});

describe("checkNote — a change written from A to B is ONE measured pair (R54)", () => {
  type End = "from" | "to";
  const Pf = (label: string, value: number, kind: Fact["kind"], text: string, key?: string, end?: End): Fact =>
    key && end ? { label, value, kind, text, pair: { key, end } } : { label, value, kind, text };
  // The facts behind the first live note under "say how much" (2026-10-27), one per line as the
  // model saw them, with the fleet's one figure the tiers' 86 (R58: the geo family's 80 was a
  // second figure for the same quantity); 9 is Amazon's (and IONOS's) node count, not the fleet's.
  const dump: Fact[] = [
    Pf("Located nodes in the fleet", 86, "count", "86", "fleet", "to"),
    Pf("Germany, nodes (biggest country)", 33, "count", "33", "cc:DE", "to"),
    Pf("United States, nodes (second biggest country)", 27, "count", "27", "cc:US", "to"),
    Pf("Finland, nodes (third biggest country)", 17, "count", "17", "cc:FI", "to"),
    Pf("Hetzner Online, nodes (biggest provider)", 51, "count", "51"),
    Pf("Amazon.com, nodes (second biggest provider)", 9, "count", "9"),
    Pf("IONOS, nodes (third biggest provider)", 9, "count", "9"),
    Pf("Located nodes in the fleet a month ago", 173, "count", "173", "fleet", "from"),
    Pf("Located nodes in the fleet, now against a month ago", 86 / 173, "ratio", "0.50"),
    Pf("Germany, nodes a month ago", 67, "count", "67", "cc:DE", "from"),
    Pf("Germany, nodes now against a month ago", 33 / 67, "ratio", "0.49"),
    Pf("United States, nodes a month ago", 58, "count", "58", "cc:US", "from"),
    Pf("Finland, nodes a month ago", 41, "count", "41", "cc:FI", "from"),
    Pf("Span length", 2_592_000, "duration", "30d"),
  ];
  const geoNames = ["Constellation", "USDC.dag", "Germany", "United States", "Finland", "Hetzner Online", "Hetzner", "Amazon.com", "IONOS"];
  const gate = (t: string) => checkNote(t, dump, geoNames);

  it("rejects the live failure: 173 and 9 each exist, but are not one change", () => {
    const r = gate("Located nodes fell from 173 a month ago to 9. Germany dropped from 67 to 33.");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toEqual(["173 and 9 are not one measured change"]);
  });

  it("accepts the change the facts hold, and a country's own pair", () => {
    expect(gate("Located nodes fell from 173 a month ago to 86.")).toEqual({ ok: true });
    expect(gate("Germany dropped from 67 to 33.")).toEqual({ ok: true });
  });

  it("rejects a pair whose end belongs to another quantity (the US's count)", () => {
    const r = gate("Germany dropped from 67 to 27.");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toEqual(["67 and 27 are not one measured change"]);
  });

  it("rejects the ends swapped: the earlier reading is not the later one", () => {
    expect(gate("Located nodes rose from 86 to 173.").ok).toBe(false);
  });

  it("does not read a from-phrase as a change when its 'to' belongs to a later verb", () => {
    expect(gate("Nodes from 9 providers grew to 51.")).toEqual({ ok: true });
    expect(gate("Nodes from 9 providers grew to 52.").ok).toBe(false); // 52 is still checked alone
  });

  it("keeps today's rule for a number outside a change construction", () => {
    expect(gate("Amazon.com runs 9 nodes, and the fleet fell from 173 to 86.")).toEqual({ ok: true });
    expect(gate("Germany hosts 33 of the 86 located nodes.")).toEqual({ ok: true });
    expect(gate("Amazon.com runs 12 nodes.").ok).toBe(false);
  });

  // ONE TEST PER FORM the model writes.
  const rates: Fact[] = [
    Pf("Global snapshots per day, the weeks before", 41_200, "count", "41,200", "g", "from"),
    Pf("Global snapshots per day, last week", 49_512, "count", "49,512", "g", "to"),
    Pf("Global snapshots per day, ratio last week to the weeks before", 49_512 / 41_200, "ratio", "1.20"),
    Pf("USDC.dag nodes at the start of the span", 18, "count", "18", "usdc", "from"),
    Pf("USDC.dag nodes at the end of the span", 8, "count", "8", "usdc", "to"),
    Pf("BioFi nodes at the end of the span", 45_000, "count", "45,000"),
    Pf("Mean spacing between global snapshots, usual", 20, "duration", "20s", "spacing", "from"),
    Pf("Mean spacing between global snapshots, recent", 45, "duration", "45s", "spacing", "to"),
  ];
  const r = (t: string) => checkNote(t, rates, ["USDC.dag", "BioFi"]);

  it("form: from A <words> to B", () => {
    expect(r("Global snapshots went from 41,200 a day in the weeks before to 49,512.").ok).toBe(true);
    expect(r("Global snapshots went from 41,200 a day in the weeks before to 45,000.").ok).toBe(false);
  });

  it("form: <verb> from A to B", () => {
    expect(r("USDC.dag fell from 18 to 8 nodes.").ok).toBe(true);
    expect(r("USDC.dag fell from eighteen to eight nodes.").ok).toBe(true);
    expect(r("USDC.dag fell from 18 to 9 nodes.").ok).toBe(false);
  });

  it("form: <verb> to B <words> from A", () => {
    expect(r("Global snapshots rose to 49,512 per day from 41,200.").ok).toBe(true);
    expect(r("Global snapshots rose to 49,512 per day, up from 41,200.").ok).toBe(true);
    expect(r("Global snapshots rose to 45,000 per day from 41,200.").ok).toBe(false);
    expect(r("Global snapshots rose to 41,200 per day from 49,512.").ok).toBe(false);
  });

  it("form: <verb> A to B", () => {
    expect(r("USDC.dag dropped 18 to 8 nodes.").ok).toBe(true);
    expect(r("USDC.dag dropped 18 to 9 nodes.").ok).toBe(false);
  });

  it("holds each end at its written precision, and reads durations as pairs too", () => {
    expect(r("Global snapshots rose from 41.2K to 49.5K a day.").ok).toBe(true);
    expect(r("Global snapshots rose from 41K to 50K a day.").ok).toBe(true);
    expect(r("Global snapshots rose from 40K to 50K a day.").ok).toBe(false);
    expect(r("The spacing widened from 20s to 45s.").ok).toBe(true);
    expect(r("The spacing widened from 20 seconds to 45 seconds.").ok).toBe(true);
    expect(r("The spacing widened from 45s to 20s.").ok).toBe(false);
  });

  it("is not a change construction when a percentage or a ratio sits on either side", () => {
    expect(r("Global snapshots rose by 20% to 49,512 a day.").ok).toBe(true);
    expect(r("Global snapshots rose 20% to 49,512 a day.").ok).toBe(true);
  });
});
