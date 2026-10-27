import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE AI NOTES CARD'S WIRING, pinned at the source (review M6, 2026-10-27). The Vitest env has no
// DOM, so these read the files the way the boundary tests do: each assertion is a piece of wiring
// the rail and thread files have lost silently before, and each would fail if it were dropped.
//   · the card LEADS the rail inside a `[data-thread-off]` wrapper, and RailThread's card query
//     skips that subtree — the briefing is not a rung, so the spine gets no dot for it;
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

describe("the notes card leads the rail outside the thread", () => {
  it("Inspector wraps the notes pane in [data-thread-off] and puts it before the ladder on every tier", () => {
    const src = read("components/Inspector.tsx");
    expect(src).toMatch(/<div key="notes-lead" data-thread-off>\s*\{detailPane\.notes\}\s*<\/div>/);
    expect(src.match(/\{notesPane\}\s*\{ladderLane\}/g)).toHaveLength(2); // tablet/phone `content` and the desktop rail
  });

  it("RailThread's card query skips a card under [data-thread-off]", () => {
    const src = read("components/RailThread.tsx");
    expect(src).toMatch(/querySelectorAll<HTMLElement>\("\.ig-panel, \.rail-entry"\)\)\.filter\(\s*\(c\) =>[^\n]*!c\.closest\("\[data-thread-off\]"\)/);
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

  it("asks for notes on mainnet only, the network read through useNet()", () => {
    const body = fnBody(card, "export function useAiNote(");
    expect(body).toMatch(/const net = useNet\(\);/);
    expect(body).toMatch(/subject && net === "mainnet"/);
    expect(body).not.toMatch(/NET === "mainnet"/);
    // The fetch never runs on a dev network's mainnet-faced first frame.
    expect(body).toMatch(/useNote\(NET === net \? req : null\)/);
  });
});
