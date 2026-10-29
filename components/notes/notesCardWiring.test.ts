import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE AI NOTES CARD'S WIRING, pinned at the source (review M6, 2026-10-27; re-cut for R57 the same
// day). The Vitest env has no DOM, so these read the files the way the boundary tests do: each
// assertion is a piece of wiring the rail and thread files have lost silently before, and each
// would fail if it were dropped.
//   · the card is PART OF THE STACK (R57): it renders as the lane's top slot through the lane's
//     one render (`detailPane`), with no lead pane above the lane and no thread opt-out — the
//     manifest-side half (lane order, focus) is `railCards.test.ts`;
//   · the iridescent edge is the open BOX's alone, the resting entry stays subtle, and it is the
//     box's ONE edge on paper too (no slab box rule inside it);
//   · Inspector asks the pure collapse module (`railCollapse.ts`, whose test drives the box
//     invariant by outcome) rather than special-casing the notes slot inline;
//   · History's notable days start FOLDED, and their rows mount only when opened;
//   · notes are asked for on mainnet only, through the hydration-safe `useNet()` — never `NET`
//     alone in render, which differs between the server (always mainnet) and a dev network.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** The source of one top-level function, from its declaration to the next top-level one. */
function fnBody(src: string, decl: string): string {
  const at = src.indexOf(decl);
  expect(at, decl).toBeGreaterThanOrEqual(0);
  const next = src.slice(at + decl.length).search(/\n(?:export )?(?:default )?function /);
  return next < 0 ? src.slice(at) : src.slice(at, at + decl.length + next);
}

describe("the notes card is part of the stack", () => {
  it("Inspector renders it as a lane slot, with no lead pane and no thread opt-out", () => {
    const src = read("components/Inspector.tsx");
    expect(src).toMatch(/notes: <NotesCard key="notes" \{\.\.\.cx\("notes"\)\} \/>/);
    expect(src).not.toMatch(/notesPane|data-thread-off/);
    // The slot's presence reaches the focus derivation, so at rest the notes card is the box.
    expect(src).toMatch(/useLadderFocus\(noteAbsent\)/);
    // The collapse decisions are the pure module's (`railCollapse.ts`, tested by outcome); Inspector
    // asks it rather than special-casing the notes slot inline (review M4/M5).
    expect(src).toMatch(/setRailCollapseMany\(overridesOnViewEntry\(live\)\)/);
    expect(src).toMatch(/const deepestId = subjectRunEnd\(ladderIds, presentOf\);/);
    expect(src).not.toMatch(/=== "notes"|!== "notes"/);
  });

  it("RailThread gives every lane card a dot — no subtree is skipped", () => {
    expect(read("components/RailThread.tsx")).not.toMatch(/data-thread-off/);
  });
});

describe("the notes card's own behaviour", () => {
  const card = read("components/notes/NotesCard.tsx");

  it("History's notable days start folded, their rows mounted only when open", () => {
    const body = fnBody(card, "function NotableDays(");
    expect(body).toMatch(/const \[open, setOpen\] = useState\(false\);/);
    expect(body).toMatch(/\{open && \(/);
    expect(body).toMatch(/aria-expanded=\{open\}/);
    // The fold's control holds phrasing content only (no SectionLabel <div> inside a <button>).
    const button = /<button\s+type=[^]*?<\/button>/.exec(body)![0];
    expect(button).not.toMatch(/<div|<SectionLabel/);
  });

  it("wears the iridescent edge on the open box only", () => {
    expect(card).toMatch(/collapsed\s*\?\s*undefined\s*:\s*"border border-transparent [^"]*\[background:[^"]*var\(--ai-edge\)_border-box\]"/);
  });

  it("draws ONE edge on both grounds: the slab's paper box rule is stated away on the box (review M1)", () => {
    expect(card).toMatch(/collapsed\s*\?\s*undefined\s*:\s*"[^"]*\[--box-rule:transparent\][^"]*"/);
  });

  it("asks for notes on mainnet only, the network read through useNet()", () => {
    const body = fnBody(read("components/notes/useAiNote.ts"), "export function useAiNote(");
    expect(body).toMatch(/const net = useNet\(\);/);
    expect(body).toMatch(/subject && net === "mainnet"/);
    expect(body).not.toMatch(/NET === "mainnet"/);
    // The fetch goes through the one mainnet gate, which never runs it on a dev network's
    // mainnet-faced first frame.
    expect(body).toMatch(/useMainnetNote\(req\)/);
    const gate = fnBody(read("components/notes/useAiNote.ts"), "export function useMainnetNote(");
    expect(gate).toMatch(/const net = useNet\(\);/);
    expect(gate).toMatch(/useNote\(NET === net \? req : null\)/);
  });

  it("a subject card's note stands only on mainnet, through the same gate", () => {
    const src = read("components/notes/SubjectNote.tsx");
    expect(src).toMatch(/useNet\(\) === "mainnet"/);
    expect(src).toMatch(/useMainnetNote\(/);
    expect(src).not.toMatch(/\buseNote\(/);
  });
});

describe("a failed write answers the gesture on the card's surface (R68)", () => {
  it("Inspector states which path the answer came by", () => {
    expect(read("components/Inspector.tsx")).toMatch(/noteCardAbsent\(aiNote\.req != null, aiNote\.note\.res, aiNote\.note\.via\)/);
  });

  it("useNote marks the request route's answer as the gesture's, and every GET answer as a read's", () => {
    const src = read("components/notes/useNote.ts");
    expect(src).toMatch(/loader\.request\([^]*?via: "request"/);
    expect(src).toMatch(/loader\.get\([^]*?via: "read"/);
  });

  it("the card says it could not write, then offers the same door again", () => {
    const card = read("components/notes/NotesCard.tsx");
    expect(card).toMatch(/res\.state === "unavailable"[^]*?Couldn&apos;t write notes just now[^]*?<RequestDoor/);
  });
});

// THE TOP CARD HOLDS, THE SUBJECT CARDS CARRY THEIR OWN (spec 2026-10-29-subject-notes): the Gate
// AI card is the view's note at the filter's scope, and a committed country, provider, make-up or
// brushed range shows its note inside its own card. The subject note is asked by the selection
// itself, so it has no door and never says it could not write.
describe("subject notes live on their cards", () => {
  it("SubjectNote has no door and no failure copy, stands down on none / unavailable, and asks once in an effect", () => {
    const src = read("components/notes/SubjectNote.tsx");
    expect(src).not.toMatch(/RequestDoor|<Door\b/);
    expect(src).not.toMatch(/Couldn/);
    expect(src).toMatch(/"none"/);
    expect(src).toMatch(/"unavailable"/);
    expect(src).toMatch(/useEffect\(\(\) => \{[^]*?res\?\.state === "request"[^]*?note\.request\(\)[^]*?\}, \[/);
    // …and once per key: the ref guard, so a re-render or a poll's `request` never POSTs twice.
    expect(src).toMatch(/res\?\.state === "request" && askedFor\.current !== key/);
  });

  it("the Country, Provider and Composition cards mount it; the Range card mounts it only while a range is brushed", () => {
    const cards = read("components/inspector/cards.tsx");
    for (const decl of ["export function CountryCard(", "export function ProviderCard(", "export function CompositionCard("])
      expect(fnBody(cards, decl), decl).toMatch(/<SubjectNote\b/);
    expect(read("components/inspector/TrendRangePane.tsx")).toMatch(/\{range \? \(?\s*<SubjectNote\b/);
  });

  it("History's top card is the window's note: no range in its span, and no range door", () => {
    expect(read("components/notes/useAiNote.ts")).not.toMatch(/span = .*trendRange/);
    expect(read("components/notes/NotesCard.tsx")).not.toMatch(/for this range/);
  });

  it("a country or provider note is scoped by the filter, its lead's denominator, never the metagraph card's network", () => {
    const body = fnBody(read("components/notes/useAiNote.ts"), "export function useNoteScopeNetwork(");
    expect(body).toMatch(/useStore\(\(s\) => s\.filter\)/);
    expect(body).not.toMatch(/metagraphCardNetwork\(/);
  });

  it("the top card's subject carries no country", () => {
    expect(read("components/notes/noteSubject.ts")).not.toMatch(/\bcountry\b\s*[?:]/);
  });
});
