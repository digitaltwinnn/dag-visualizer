import { describe, expect, it } from "vitest";
import type { NoteView, NotableDay } from "@/src/data/noteTypes";
import { PROMPTS, VOICE, buildMessages, parseAnswer } from "./prompts";

const VIEWS: NoteView[] = ["hyper", "geo", "ledger", "trend"];

describe("VOICE", () => {
  it("carries the house voice", () => {
    expect(VOICE).toContain("never machines");
    expect(VOICE).toContain("no dash");
    expect(VOICE).toContain("the reader can see the numbers; say what stands out, in two or three plain sentences");
    expect(VOICE).toContain("use only numbers from the facts");
    expect(VOICE).toContain("never explain why");
    expect(VOICE).toContain("was part of");
    expect(VOICE).toMatch(/never ticks/);
    expect(VOICE).toMatch(/feeless/);
  });

  it("answers in the question's order: the view's own subject first, the common reading last (R74), and leads each part with what changed", () => {
    expect(VOICE).toContain("what it asks for first is what this view shows and comes first, even when it held; what it asks for last comes last, in one sentence.");
    expect(VOICE).toContain(
      "Within each part, lead with what changed. Do not restate a breakdown the reader can already see on screen, such as how many nodes run each layer, unless it changed.",
    );
  });

  it("asks for how much a figure moved, never only the direction (user, 2026-10-27)", () => {
    expect(VOICE).toContain("say by how much: write it from the earlier figure to the current one");
  });

  it("holds no digit a facts list could also hold, layer names aside (R59: an example's 9 became a note's 9)", () => {
    expect(VOICE.replace(/\b[cd]?L[01]\b/g, "")).not.toMatch(/\d/);
  });

  it("steers the model toward what the honesty gate accepts", () => {
    expect(VOICE).toMatch(/exactly as the facts give them/);
    expect(VOICE).toMatch(/never round a small figure to zero/i);
    expect(VOICE).toMatch(/only use durations the facts give/i);
    for (const w of ["half", "hundreds", "thousands", "-fold", "doubles"]) expect(VOICE).toContain(w);
    expect(VOICE).toMatch(/never the fleet/);
  });
});

describe("PROMPTS", () => {
  it("has a question and a system prompt for every view, carrying VOICE and the subject", () => {
    for (const v of VIEWS) {
      const p = PROMPTS[v];
      expect(p.question.length).toBeGreaterThan(10);
      const sys = p.system("Mainnet");
      expect(sys).toContain(VOICE);
      expect(sys).toContain("Mainnet");
      expect(sys).toContain(p.question);
    }
  });

  it("keeps Geography to where, then one sentence of activity, never pace, and the other views to theirs", () => {
    const geo = PROMPTS.geo.system("the network");
    expect(geo).not.toContain("pace");
    expect(geo).toMatch(/where/i);
    expect(geo).toMatch(/decentrali/i); // it is told to leave the subject alone
    expect(PROMPTS.geo.system("the network", undefined, true)).toMatch(/then the one sentence on activity/);
    expect(geo).not.toMatch(/activity/);
    expect(PROMPTS.hyper.question).toMatch(/who|what/i);
    expect(PROMPTS.ledger.question).toMatch(/anchoring/i);
    expect(PROMPTS.ledger.question).toMatch(/hours/i);
    expect(PROMPTS.trend.question).toMatch(/changed/i);
  });

  it("asks Hypergraph and Geography their own subject first and activity last (R74); the ledger and History keep their questions", () => {
    expect(PROMPTS.hyper.question).toBe(
      "First, who and what is on the network over the span: networks or layers that gained or lost nodes, networks that started or stopped anchoring; if nothing changed there, say that it held, with the level.",
    );
    expect(PROMPTS.hyper.questionCommon).toBe("Last, in one sentence, how active it was: the global snapshots it was part of per day last week against the weeks before.");
    expect(PROMPTS.geo.question).toBe(
      "First, where the nodes run: countries and hosting providers that gained or lost nodes, or where the nodes are now when nothing moved. Say nothing about speed.",
    );
    expect(PROMPTS.geo.questionCommon).toBe("Last, in one sentence, how active the network was: its global snapshots per day last week against the weeks before.");
    expect(PROMPTS.geo.system("x")).toContain("Stay on where the nodes are located and who hosts them, and nothing else.");
    expect(PROMPTS.geo.system("x", undefined, true)).toContain("Stay on where the nodes are located and who hosts them, then the one sentence on activity, and nothing else.");
    expect(PROMPTS.ledger.question).toBe(
      "Say what changed in the anchoring rhythm over the recent hours against the usual: what sped up or slowed down, from the usual figure to the recent one, and which networks did it. Then the reading itself: the longest gap, and what was part of the global snapshots.",
    );
    expect(PROMPTS.trend.question).toBe("Say what changed over the span: what rose, what fell and when, as the numbers show it.");
  });

  // R71 (user, 2026-10-29): "change, else now" — the Snapshots builder picks the question.
  it("asks Snapshots for the reading itself when the builder says nothing moved, and tells it not to describe a change", () => {
    const now = PROMPTS.ledger.questionNow!;
    expect(now).toMatch(/do not describe a change/i);
    expect(now).toMatch(/do not mention the usual/i);
    expect(now).toMatch(/right now/i);
    expect(now).toMatch(/longest gap/i);
    const sysNow = PROMPTS.ledger.system("x", { kind: "now" });
    expect(sysNow).toContain(now);
    expect(sysNow).not.toContain(PROMPTS.ledger.question);
    expect(sysNow).not.toContain("Lead with what moved");
    expect(PROMPTS.ledger.system("x")).toContain(PROMPTS.ledger.question);
    // The other views have one question and ignore the lead.
    for (const v of ["hyper", "geo", "trend"] as const) {
      expect(PROMPTS[v].questionNow).toBeUndefined();
      expect(PROMPTS[v].system("x", { kind: "now" })).toBe(PROMPTS[v].system("x"));
      expect(PROMPTS[v].system("x", { kind: "change", moved: ["Fees in DAG per hour"] })).toBe(PROMPTS[v].system("x"));
    }
    expect(buildMessages("ledger", "Mainnet", "Facts", null, undefined, { kind: "now" })[0]!.content).toContain(now);
    expect(buildMessages("ledger", "Mainnet", "Facts", null)[0]!.content).toContain(PROMPTS.ledger.question);
  });
  it("names the pairs that moved when the builder found a change, so a one-percent drift beside them is a reading", () => {
    const sys = PROMPTS.ledger.system("x", { kind: "change", moved: ["Fees in DAG per hour", "Data in MB per hour"] });
    expect(sys).toContain(PROMPTS.ledger.question);
    expect(sys).toContain("Lead with what moved: Fees in DAG per hour; Data in MB per hour.");
    expect(sys).toMatch(/every other figure held/i);
    expect(sys).not.toMatch(/—|\s[–-]\s/);
    expect(buildMessages("ledger", "Mainnet", "Facts", null, undefined, { kind: "change", moved: ["Fees in DAG per hour"] })[0]!.content).toContain("Lead with what moved: Fees in DAG per hour.");
  });

  // R74: the common part is asked only while the facts hold it — a country, or a network short of
  // measured days, has none, and asked anyway the model wrote one from a share ratio (live 2026-10-29).
  it("asks for the common reading only when the facts hold it, in Hypergraph and Geography alone", () => {
    for (const v of ["hyper", "geo"] as const) {
      expect(PROMPTS[v].system("x", undefined, false)).not.toContain(PROMPTS[v].questionCommon!);
      expect(PROMPTS[v].system("x")).not.toContain(PROMPTS[v].questionCommon!);
      expect(PROMPTS[v].system("x", undefined, true)).toContain(`${PROMPTS[v].question} ${PROMPTS[v].questionCommon}`);
    }
    for (const v of ["ledger", "trend"] as const) {
      expect(PROMPTS[v].questionCommon).toBeUndefined();
      expect(PROMPTS[v].system("x", undefined, true)).toBe(PROMPTS[v].system("x"));
    }
    expect(buildMessages("geo", "Germany", "Facts", null, undefined, undefined, false)[0]!.content).not.toContain("activity");
    expect(buildMessages("geo", "the network", "Facts", null, undefined, undefined, true)[0]!.content).toContain(PROMPTS.geo.questionCommon!);
  });

  // A subject note (a country, a provider, a make-up) asks its kind's question: the card's own lead
  // sets the frame, and the common reading is the network's, so a subject's facts hold none.
  it("asks a country, a provider and a make-up their own question, with no common part", () => {
    const geo = PROMPTS.geo.questions!;
    const hyper = PROMPTS.hyper.questions!;
    expect(Object.keys(geo).sort()).toEqual(["country", "provider"]);
    expect(Object.keys(hyper)).toEqual(["type"]);
    expect(PROMPTS.ledger.questions).toBeUndefined();
    expect(PROMPTS.trend.questions).toBeUndefined();
    expect(geo.country).toBe(
      "First, how many of the network's nodes run in the country and how that moved over the span; if nothing moved, say it held, with the level and the country's place among the network's countries. Say nothing about speed.",
    );
    expect(geo.provider).toBe(
      "First, how many nodes the provider hosts across the network and how that moved over the span, stated as network-wide, not for one place; if nothing moved, say it held, with the level and its place among the providers. Say nothing about speed.",
    );
    expect(hyper.type).toBe(
      "First, how many of the network's nodes run this make-up and how that changed over the span; if nothing changed, say it held, with the level and its share of the network's nodes.",
    );
    for (const [view, kind] of [["geo", "country"], ["geo", "provider"], ["hyper", "type"]] as const) {
      const sys = PROMPTS[view].system("Germany", undefined, false, kind);
      expect(sys).toContain(VOICE);
      expect(sys).toContain("Subject: Germany.");
      expect(sys).toContain(PROMPTS[view].questions![kind]!);
      expect(sys).not.toContain(PROMPTS[view].question);
      expect(sys).not.toContain(PROMPTS[view].questionCommon!);
      expect(buildMessages(view, "Germany", "Facts", null, undefined, undefined, false, kind)[0]!.content).toContain(PROMPTS[view].questions![kind]!);
    }
  });

  it("a view kind asks the view's question, unchanged, and a kind without a question falls back to it", () => {
    for (const v of VIEWS) {
      expect(PROMPTS[v].system("x", undefined, false, "view")).toBe(PROMPTS[v].system("x"));
      expect(buildMessages(v, "x", "Facts", null, undefined, undefined, false, "view")).toEqual(buildMessages(v, "x", "Facts", null));
    }
    expect(PROMPTS.hyper.system("x", undefined, true, "view")).toContain(`${PROMPTS.hyper.question} ${PROMPTS.hyper.questionCommon}`);
    // Only geo has country and provider, only hyper has type; elsewhere the view's question stands.
    expect(PROMPTS.hyper.system("x", undefined, false, "country")).toContain(PROMPTS.hyper.question);
    expect(PROMPTS.geo.system("x", undefined, false, "type")).toContain(PROMPTS.geo.question);
    expect(PROMPTS.ledger.system("x", undefined, false, "provider")).toContain(PROMPTS.ledger.question);
  });

  it("the kind questions keep the house copy: no digits, no dashes, no fleet or machines", () => {
    const all = [...Object.values(PROMPTS.geo.questions!), ...Object.values(PROMPTS.hyper.questions!)];
    expect(all).toHaveLength(3);
    for (const q of all) {
      expect(q).not.toMatch(/\d/);
      expect(q).not.toMatch(/—|–|\s-\s/);
      expect(q).not.toMatch(/fleet|machine/i);
    }
    for (const [view, kind] of [["geo", "country"], ["geo", "provider"], ["hyper", "type"]] as const)
      expect(PROMPTS[view].system("x", undefined, false, kind)).not.toMatch(/—|\s[–-]\s/);
  });

  it("keeps its own copy free of dashes", () => {
    for (const v of VIEWS) expect(PROMPTS[v].system("x")).not.toMatch(/—|\s[–-]\s/);
    for (const v of VIEWS) expect(PROMPTS[v].system("x", undefined, true)).not.toMatch(/—|\s[–-]\s/);
    expect(PROMPTS.ledger.system("x", { kind: "now" })).not.toMatch(/—|\s[–-]\s/);
    expect(VOICE).not.toMatch(/—|\s[–-]\s/);
  });
});

describe("buildMessages", () => {
  const FACTS = "Snapshots anchored: 12,159";

  it("is a system then a user message, the facts in the user message", () => {
    const m = buildMessages("hyper", "Mainnet", FACTS, null);
    expect(m.map((x) => x.role)).toEqual(["system", "user"]);
    expect(m[0]!.content).toBe(`${PROMPTS.hyper.system("Mainnet")}\n\nAnswer format: one line starting NOTE: and nothing else.`);
    expect(m[1]!.content).toContain(FACTS);
    expect(m[1]!.content).not.toContain("DAY ");
    expect(m[1]!.content).not.toContain("rejected");
  });

  it("asks for a caption per notable day when days are given", () => {
    const days: NotableDay[] = [
      { dayMs: Date.UTC(2026, 9, 19), kind: "high", networkId: null, value: 1, level: 1, score: 1 },
      { dayMs: Date.UTC(2026, 9, 21), kind: "low", networkId: null, value: 1, level: 1, score: 1 },
    ];
    const m = buildMessages("trend", "Mainnet", FACTS, days);
    expect(m[0]!.content).toContain("DAY YYYY-MM-DD:");
    expect(m[1]!.content).toContain("DAY 2026-10-19");
    expect(m[1]!.content).toContain("DAY 2026-10-21");
    expect(m[1]!.content.indexOf("2026-10-19")).toBeLessThan(m[1]!.content.indexOf("2026-10-21"));
  });

  it("names the rejection reasons on a retry", () => {
    const m = buildMessages("hyper", "Mainnet", FACTS, null, ['"12" is not in the facts', "banned word \"tick\""]);
    expect(m[1]!.content).toContain('Your previous answer was rejected: "12" is not in the facts; banned word "tick"');
    expect(m[1]!.content).toContain(FACTS);
  });

  it("treats an empty reasons list as a first attempt", () => {
    expect(buildMessages("hyper", "x", FACTS, null, [])[1]!.content).not.toContain("rejected");
  });
});

describe("parseAnswer", () => {
  it("reads the note and the day captions", () => {
    const r = parseAnswer("NOTE: A b.\nDAY 2026-10-19: C d.");
    expect(r.note).toBe("A b.");
    expect([...r.captions]).toEqual([["2026-10-19", "C d."]]);
  });

  it("tolerates whitespace and lines before NOTE:", () => {
    const r = parseAnswer("\n  Let me think about this.\nOkay.\n  NOTE:   Six networks anchored.  \n\nDAY 2026-10-19:  Busy.  \nDAY 2026-10-21: Quiet.\n\n");
    expect(r.note).toBe("Six networks anchored.");
    expect([...r.captions]).toEqual([["2026-10-19", "Busy."], ["2026-10-21", "Quiet."]]);
  });

  it("treats the whole trimmed text as the note when there is no NOTE: line", () => {
    const r = parseAnswer("  Six networks anchored.\nTwo were quiet.  \n");
    expect(r.note).toBe("Six networks anchored.\nTwo were quiet.");
    expect(r.captions.size).toBe(0);
  });

  it("keeps a note that runs over several lines up to the first DAY line", () => {
    const r = parseAnswer("NOTE: One.\nTwo.\nDAY 2026-10-19: Busy.");
    expect(r.note).toBe("One.\nTwo.");
  });

  it("drops a leaked reasoning block", () => {
    const r = parseAnswer("<think>\nNOTE: draft\n</think>\nNOTE: Final.");
    expect(r.note).toBe("Final.");
  });

  it("drops an unclosed reasoning block instead of making it the note", () => {
    expect(parseAnswer("<think>\nThe user wants a note. Let me count the networks").note).toBe("");
    const r = parseAnswer("NOTE: Final.\nDAY 2026-10-19: Busy.\n<think>and then I kept going");
    expect(r.note).toBe("Final.");
    expect([...r.captions]).toEqual([["2026-10-19", "Busy."]]);
  });

  it("returns an empty note for empty text", () => {
    expect(parseAnswer("  \n").note).toBe("");
  });
});
