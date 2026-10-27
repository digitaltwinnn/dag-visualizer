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
//   · the iridescent edge is the open BOX's alone, the resting entry stays subtle;
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
    // A view's entry never pins it: pinned open, it stood as a second box above the late live tick.
    expect(src).toMatch(/ladderIds\.filter\(\(id\) => id !== "notes" && presentOf\(id\)\)/);
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
    expect(card).toMatch(/collapsed\s*\?\s*undefined\s*:\s*"border border-transparent \[background:[^"]*var\(--ai-edge\)_border-box\]"/);
  });

  it("asks for notes on mainnet only, the network read through useNet()", () => {
    const body = fnBody(read("components/notes/useAiNote.ts"), "export function useAiNote(");
    expect(body).toMatch(/const net = useNet\(\);/);
    expect(body).toMatch(/subject && net === "mainnet"/);
    expect(body).not.toMatch(/NET === "mainnet"/);
    // The fetch never runs on a dev network's mainnet-faced first frame.
    expect(body).toMatch(/useNote\(NET === net \? req : null\)/);
  });
});
