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

  it("leads with what changed and does not restate a breakdown the reader can see", () => {
    expect(VOICE).toContain(
      "Lead with what changed. Do not restate a breakdown the reader can already see on screen, such as how many nodes run each layer, unless it changed.",
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

  it("keeps Geography to where, never activity or pace, and the other views to theirs", () => {
    const geo = PROMPTS.geo.system("the fleet");
    expect(geo).not.toContain("pace");
    expect(geo).toMatch(/where/i);
    expect(geo).toMatch(/decentrali/i); // it is told to leave the subject alone
    expect(PROMPTS.hyper.question).toMatch(/who|what/i);
    expect(PROMPTS.ledger.question).toMatch(/anchoring/i);
    expect(PROMPTS.ledger.question).toMatch(/hours/i);
    expect(PROMPTS.trend.question).toMatch(/changed/i);
  });

  it("asks Hypergraph and Geography what changed; the ledger and History keep their questions", () => {
    expect(PROMPTS.hyper.question).toBe(
      "Say what changed in who and what is on the network over the span: networks or layers that gained or lost nodes, networks that started or stopped anchoring, how much more or less active they were. If nothing changed, say in one sentence that it held, with the level.",
    );
    expect(PROMPTS.geo.question).toBe(
      "Say how the places the nodes run have shifted: countries and hosting providers that gained or lost nodes. Where the facts hold no change, say briefly where the nodes are now. Say nothing about activity or speed.",
    );
    expect(PROMPTS.geo.system("x")).toContain("Stay on where the nodes are located and who hosts them, and nothing else.");
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

  it("keeps its own copy free of dashes", () => {
    for (const v of VIEWS) expect(PROMPTS[v].system("x")).not.toMatch(/—|\s[–-]\s/);
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
