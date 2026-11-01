import { describe, expect, it } from "vitest";
import type { NoteView, NotableDay } from "@/src/data/noteTypes";
import { CAPTION_FORMAT, LINE_FORMAT, PROMPTS, VOICE, buildMessages, parseAnswer, spanWords } from "./prompts";

const VIEWS: NoteView[] = ["hyper", "geo", "ledger", "trend"];

describe("VOICE", () => {
  it("carries the house voice", () => {
    expect(VOICE).toContain("never machines");
    expect(VOICE).toContain("no dash");
    expect(VOICE).toContain("the reader can see the numbers; say what stands out, in two or three plain sentences");
    expect(VOICE).toContain("use only numbers from the facts");
    expect(VOICE).toContain("never explain why");
    expect(VOICE).toContain("was part of");
    expect(VOICE).toContain("Use no noun more than twice in a sentence");
    expect(VOICE).toContain("Be concise and to the point");
    expect(VOICE).toContain("never call it steady");
    expect(VOICE).toContain("Never say which lost or gained the most");
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
      "First, who and what is on the network over the span: networks or layers that gained or lost nodes, networks that became active or went quiet; if nothing changed there, say so plainly: a steady week: the node count held at its level and the layers held steady, and for the whole network so did the active networks.",
    );
    expect(PROMPTS.hyper.questionCommon).toBe("Last, in one sentence, how active it was: open with the direction, up, down or steady, then the global snapshots it was part of per day last week against the weeks before.");
    expect(PROMPTS.geo.question).toBe(
      "First, how many nodes there are and how that moved, then where they run: the countries and hosting providers that gained or lost nodes and no others, or where the nodes are now when nothing moved. Say nothing about speed.",
    );
    expect(PROMPTS.geo.questionCommon).toBe("Last, in one sentence, how active the network was: open with the direction, up, down or steady, then its global snapshots per day last week against the weeks before.");
    // The whole network PRODUCES its global snapshots (user, 2026-10-30: "there is no specific
    // network, so 'all' should probably have some different wording").
    for (const v of ["hyper", "geo"] as const) {
      expect(PROMPTS[v].questionCommonWhole).toBe("Last, in one sentence, how active the network was: open with the direction, up, down or steady, then the global snapshots it produced per day last week against the weeks before.");
      expect(PROMPTS[v].system("the whole network", undefined, true, undefined, true)).toContain(`${PROMPTS[v].question} ${PROMPTS[v].questionCommonWhole}`);
      expect(PROMPTS[v].system("the whole network", undefined, true, undefined, true)).not.toContain(PROMPTS[v].questionCommon!);
      expect(PROMPTS[v].system("the whole network", undefined, false, undefined, true)).not.toContain(PROMPTS[v].questionCommonWhole!);
    }
    expect(VOICE).toMatch(/the whole network is part of nothing: it produces them/);
    expect(buildMessages("hyper", "the whole network", "Facts", null, undefined, undefined, true, undefined, null, true)[0]!.content).toContain(PROMPTS.hyper.questionCommonWhole!);
    expect(PROMPTS.geo.system("x")).toContain("Stay on where the nodes are located and who hosts them, and nothing else.");
    expect(PROMPTS.geo.system("x", undefined, true)).toContain("Stay on where the nodes are located and who hosts them, then the one sentence on activity, and nothing else.");
    expect(PROMPTS.ledger.question).toBe(
      "Say what changed in the anchoring rhythm over the recent hours against the usual: what sped up or slowed down, from the usual figure to the recent one, and which networks did it. Then the reading itself: the longest gap, then, in one short clause: for the whole network, what each global snapshot holds, as \"N snapshots from M networks in each global snapshot\", never that it was part of anything; for one network, only the share of global snapshots it was part of.",
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
    expect(now).toContain("N snapshots from M networks in each global snapshot");
    expect(now).not.toMatch(/what they were part of/);
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
    // History's one subject question is the SPAN FACET (user, 2026-10-30): the Range card's note
    // over the window, complementary to the top card's "what changed", never a copy of it.
    expect(Object.keys(PROMPTS.trend.questions!)).toEqual(["span"]);
    expect(PROMPTS.trend.questions!.span).toBe(
      "Describe the span's shape, as a companion to a note above it that already states what rose and fell: the busiest day and the quietest day, each with its date and figure, and a typical day's figure, using only the facts named for those days. If the facts name none, say how quiet or steady the span was. Do not say what rose or fell overall.",
    );
    expect(PROMPTS.trend.system("the hypergraph", undefined, false, "span")).toContain(PROMPTS.trend.questions!.span);
    expect(PROMPTS.trend.system("the hypergraph", undefined, false, "span")).not.toContain(PROMPTS.trend.question);
    expect(PROMPTS.trend.system("the hypergraph")).toContain(PROMPTS.trend.question);
    expect(geo.country).toBe(
      "Open with a plain sentence with the network as its actor, in the shape \"<network> hosts N nodes in <country>\"; then what share of the network's nodes that is and the country's place among the network's countries, or, when the facts count one country, that it is the network's only country, with no share and no place; then how that moved over the span, or that it held. Say nothing about speed.",
    );
    expect(geo.provider).toBe(
      "Open with a plain sentence with the provider as its actor, in the shape \"<provider> hosts N of <network>'s nodes\", network-wide, not for one place; then what share of the network's nodes with a known provider that is and its place among the network's providers, or, when the facts count one provider, that it is the network's only provider, with no share and no place; then how that moved over the span, or that it held. Say nothing about speed.",
    );
    expect(hyper.type).toBe(
      "Open with a plain sentence whose subject is the nodes, in the shape \"N of the M <network> nodes run <layers>\", M being all its nodes, the layers named exactly as the facts name them, with no possessive on the name (a node RUNS its layers, so the verb is run); then say in plain words where that group stands among the network's layer groups, as a reader would (\"its largest group\", \"the smaller of its two groups\", \"its only group\"), never \"share\", \"rank\" or a percentage; then how that changed over the span, or that it held.",
    );
    // The opening is a plain sentence with an actor, never the Subject line used as a noun
    // ("Dor Technologies nodes in Finland run 2" — user, 2026-10-30: "not really logical").
    for (const q of [geo.country, geo.provider]) expect(q).toMatch(/^Open with a plain sentence with the \w+ as its actor, in the shape "<\w+> (hosts|runs) N /);
    // A node RUNS its layers (user, 2026-10-30: "do they run the nodes on L0 or is the node composed
    // out of it?"): the group's sentence has the nodes as its subject, never the network running
    // nodes "on" a layer.
    // …and no possessive on the name ("Dor Technologies's", live).
    expect(hyper.type).toMatch(/^Open with a plain sentence whose subject is the nodes, in the shape "N of the M <network> nodes run <layers>"/);
    expect(hyper.type).not.toMatch(/nodes on </);
    // Nothing the model is handed says "make-up" (user, 2026-10-30: not a human's word).
    for (const q of [VOICE, hyper.type, PROMPTS.hyper.question, CAPTION_FORMAT]) expect(q).not.toMatch(/make-up/);
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

describe("spanWords — the span the note names, in the card pill's own words (user, 2026-10-30)", () => {
  const D = 86_400_000;
  const now = Date.UTC(2026, 9, 30, 12);
  it("the fixed spans: a week for Hypergraph and Geography, a day for Snapshots", () => {
    expect(spanWords("hyper", "day", now - 7 * D, now)).toBe("the last 7 days");
    expect(spanWords("geo", "day", now - 7 * D, now)).toBe("the last 7 days");
    expect(spanWords("ledger", "hours", now - D, now)).toBe("the last 24 hours");
  });
  it("History's pills", () => {
    expect(spanWords("trend", "1h", now - 3_600_000, now)).toBe("the last hour");
    expect(spanWords("trend", "24h", now - D, now)).toBe("the last 24 hours");
    expect(spanWords("trend", "7d", now - 7 * D, now)).toBe("the last 7 days");
    expect(spanWords("trend", "30d", now - 30 * D, now)).toBe("the last 30 days");
    expect(spanWords("trend", "1y", now - 365 * D, now)).toBe("the last year");
    expect(spanWords("trend", "all", 0, now)).toBe("all measured history");
  });
  it("a brushed range by its UTC days, as the Range card titles it; one day is 'on'", () => {
    const from = Date.UTC(2026, 9, 28);
    const to = Date.UTC(2026, 9, 30);
    expect(spanWords("trend", `r${from}-${to}`, from, to)).toBe("from Oct 28 to Oct 29");
    expect(spanWords("trend", `r${from}-${from + D}`, from, from + D)).toBe("on Oct 28");
  });
});

describe("buildMessages", () => {
  const FACTS = "Snapshots anchored: 12,159";

  // HONEST, AND SAID POSITIVELY (user, 2026-10-31): growth opens its sentence rather than trailing
  // as an afterthought ("It was part of 6,146 …, up from 5,002"), stillness reads as steady rather
  // than as what did not happen ("No network started or stopped"), and a fall stays a plain fall.
  it("asks for growth up front, steadiness over negatives, and a fall stated plainly", () => {
    expect(VOICE).toMatch(/When a figure grew, open the sentence with the growth/);
    // …anywhere in a sentence (the same day: "'no networks started or stopped anchoring', this is
    // also steady no?"): the rule first stopped negatives only at a sentence's start.
    expect(VOICE).toMatch(/say what held steady, anywhere in a sentence/);
    // A network creates snapshots and anchors them (user, 2026-10-31): "anchoring networks" is jargon.
    expect(VOICE).toMatch(/A network that creates snapshots is an active network, never an "anchoring network"/);
    expect(VOICE).toMatch(/never write that something did not happen, such as "no changes" or "no networks"/);
    expect(VOICE).toMatch(/State a fall plainly: never soften, hide or reframe it/);
  });

  it("hands the span's words to the model and asks for them in the first sentence (user, 2026-10-30)", () => {
    const m = buildMessages("hyper", "Mainnet", FACTS, null, undefined, undefined, undefined, undefined, "the last 7 days");
    expect(m[1]!.content).toContain("Span: the last 7 days");
    expect(VOICE).toMatch(/Name the span in your first sentence/);
    // Live 2026-10-30: "Over from Mar 6 to May 25" — the two examples were read as one template.
    expect(VOICE).toMatch(/never "over from"/);
    // …and the subject by its name, never "the network" for one network (user, 2026-10-30).
    expect(VOICE).toMatch(/Call the subject by its name/);
    expect(buildMessages("hyper", "Mainnet", FACTS, null)[1]!.content).not.toContain("Span:");
  });

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
    // THE ROW SAYS THE DATE AND THE KIND, so the caption says neither (user, 2026-10-30, design B):
    // a short clause with the figure and whose it was, read against what the facts name the day.
    expect(m[0]!.content).toContain(CAPTION_FORMAT);
    expect(CAPTION_FORMAT).toMatch(/at most ten words/);
    expect(CAPTION_FORMAT).toMatch(/repeats neither/);
    expect(CAPTION_FORMAT).not.toMatch(/\d/);
    // Plain words (user, 2026-10-30: "'… against median' is not really human readable").
    expect(CAPTION_FORMAT).toMatch(/never "median", never "against"/);
    expect(CAPTION_FORMAT).toMatch(/usually/);
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

  // Review 2026-10-30: captions were keyed by date alone, so two notable days on one UTC date shared
  // the last caption, and a row could show another network's event under its own coin.
  it("keeps two captions for one date, the second under its occurrence", () => {
    const r = parseAnswer("NOTE: A b.\nDAY 2026-08-15: First.\nDAY 2026-08-15: Second.");
    expect([...r.captions]).toEqual([["2026-08-15", "First."], ["2026-08-15#2", "Second."]]);
  });

  it("drops a wrapping fence, markdown on the markers and chatter after a blank line", () => {
    expect(parseAnswer("\`\`\`\nNOTE: The network held.\n\`\`\`").note).toBe("The network held.");
    expect(parseAnswer("**NOTE:** The network held.").note).toBe("The network held.");
    expect(parseAnswer("NOTE: The network held.\n\nLet me know if you need more.").note).toBe("The network held.");
    expect(parseAnswer("NOTE:\n\nThe network held.").note).toBe("The network held.");
    expect([...parseAnswer("NOTE: A.\n\n**DAY 2026-08-15:** B.").captions]).toEqual([["2026-08-15", "B."]]);
    expect(parseAnswer("\`\`\`\nThe network held.\n\`\`\`").note).toBe("The network held.");
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

describe("the Briefing's line", () => {
  it("is asked for only when wanted", () => {
    const asked = (line?: boolean) => buildMessages("geo", "x", "Facts", null, undefined, undefined, false, undefined, null, false, line)[0]!.content;
    expect(asked(true)).toContain(LINE_FORMAT);
    expect(asked()).not.toContain(LINE_FORMAT);
  });

  it("is read back apart from the note", () => {
    const r = parseAnswer("NOTE: A b. C d.\nLINE: A in short.\nDAY 2026-10-19: Busy.");
    expect(r.note).toBe("A b. C d.");
    expect(r.line).toBe("A in short.");
    expect(r.captions.get("2026-10-19")).toBe("Busy.");
  });

  it("is absent from an answer without one", () => {
    expect(parseAnswer("NOTE: A b.").line).toBeNull();
    expect(parseAnswer("A b.").line).toBeNull();
  });
});

describe("the Briefing's line, in an untidy answer", () => {
  it("leaves the note when the model skipped NOTE:", () => {
    const r = parseAnswer("A b. C d.\nLINE: A in short.");
    expect(r.note).toBe("A b. C d.");
    expect(r.line).toBe("A in short.");
  });

  it("is split from a note on the same line", () => {
    const r = parseAnswer("NOTE: A b. C d. LINE: A in short.");
    expect(r.note).toBe("A b. C d.");
    expect(r.line).toBe("A in short.");
  });

  it("loses the markdown around it", () => {
    expect(parseAnswer("NOTE: A b.\n**LINE: A in short.**").line).toBe("A in short.");
  });
});
