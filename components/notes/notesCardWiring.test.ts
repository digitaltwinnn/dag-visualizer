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

  // THE OTHER VIEWS' ROWS (user, 2026-10-31): a sentence code wrote, committing its subject through
  // the one executor (rule 2; `noteChangeTarget`), and folded like the days, under their own title.
  it("a view note's notable changes share the days' fold and commit through the executor", () => {
    expect(card).toMatch(/heading="Notable days"/);
    expect(card).toMatch(/heading="Notable changes"/);
    const body = fnBody(card, "function ChangeRow(");
    expect(body).toMatch(/applyClickActions\(acts\)/);
    expect(body).toMatch(/<NoteKindCoin kind=\{change\.kind\} \/>/);
    expect(body).toMatch(/<NoteText text=\{change\.text\} \/>/);
  });

  it("History's notable days start folded, their rows mounted only when open", () => {
    const body = fnBody(card, "function NoteRows(");
    expect(body).toMatch(/const \[open, setOpen\] = useState\(false\);/);
    expect(body).toMatch(/\{open && \(/);
    expect(body).toMatch(/aria-expanded=\{open\}/);
    // The fold's control holds phrasing content only (no SectionLabel <div> inside a <button>).
    const button = /<button\s+type=[^]*?<\/button>/.exec(body)![0];
    expect(button).not.toMatch(/<div|<SectionLabel/);
  });

  // DATE AND KIND LEAD (user, 2026-10-30, design option B of four in the brainstorming companion):
  // a day's row opens with its date, then a mark for the kind of day in the day's network hue,
  // then the caption, which wraps rather than truncates (nothing a hover would have to reveal).
  // The kind's word rides along for assistive tech; the mark is decoration.
  it("a notable day's row leads with its date and its kind mark, the caption wrapping after them", () => {
    const body = fnBody(card, "function DayRow(");
    // ONE COIN ON EVERY SURFACE (user, 2026-10-30, design option C of three in the brainstorming
    // companion): the kind's glyph on a 16px violet coin — the row's mark, the timeline's mark and
    // the chart plane's mark are the same `NoteKindCoin`, so the three never disagree in shape or size.
    expect(body).toMatch(/label=\{[^]*?rangeDays\(day\.dayMs, day\.dayMs \+ DAY_MS\)[^]*?<NoteKindCoin kind=\{day\.kind\}/);
    expect(body).not.toMatch(/figure=/);
    expect(body).toMatch(/\bwrap\b/);
    expect(body).toMatch(/sr-only[^]*?NOTE_KIND_WORD\[day\.kind\]/);
    expect(read("components/icons.tsx")).toMatch(/export const NOTE_KIND_ICONS: Record<NotableKind \| NoteChangeKind, LucideIcon>/);
    expect(card).toMatch(/import \{ NOTE_KIND_WORD \} from "\.\/noteDays";/);
    const coin = read("components/notes/NoteKindCoin.tsx");
    expect(coin).toMatch(/NOTE_KIND_ICONS\[kind\]/);
    expect(coin).toMatch(/size-4 rounded-full/);
    expect(coin).toMatch(/bg-\[var\(--ai-coin\)\]/);
    expect(coin).not.toMatch(/className=\{cn\("[^"]*(shadow|ring-|blur)/); // a plane must never carry a shadow (trendStackBoundary)
    expect(read("components/notes/NoteDiamonds.tsx")).toMatch(/<NoteKindCoin kind=\{day\.kind\}/);
    expect(read("components/notes/NoteDiamonds.tsx")).not.toMatch(/rotate-45/);
    const chart = read("components/docs/TrendChart.tsx");
    expect(chart).toMatch(/<NoteKindCoin kind=\{m\.kind\}/);
    expect(chart).not.toMatch(/rotate-45/);
  });

  // THE PLANE'S COIN PAIRS LIKE THE BAND'S (user, 2026-10-30: "the cards with charts don't carry the
  // same hover effect for the AI notable days like the vitals chart does"): a coin on a plane is a
  // button, lit when its day is the hovered one, hovering it lights the row and the band's mark
  // through `hoverNoteDay` (rule 9), and a click commits the day as the range — the row's commit.
  it("a plane's coin hovers and commits like the timeline's", () => {
    const chart = read("components/docs/TrendChart.tsx");
    expect(chart).toMatch(/lit\?: boolean;[^]*?label: string;/); // TrendMark carries its lit state and its name
    expect(chart).toMatch(/onMarkPick\?: \(mark: TrendMark\) => void;/);
    expect(chart).toMatch(/<button[^]*?aria-label=\{m\.label\}[^]*?onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}[^]*?<NoteKindCoin kind=\{m\.kind\}/);
    const stack = read("components/TrendStack.tsx");
    expect(stack).toMatch(/useStore\(\(s\) => s\.hoverNoteDay\)/);
    expect(stack).toMatch(/onMarkHover=\{/);
    expect(stack).toMatch(/onMarkPick=\{/);
  });

  // THE MARKER TRAVELS (user, 2026-10-30: "if the moment is a notable day … show the marker on the
  // cards as well, maybe as a 2nd pill on the right side in the header"): the Moment card wears the
  // day's kind chip beside its bucket chip when its bucket falls on a notable day, the Range card
  // when its span IS that day; and the chart planes draw the days as marks, outside the memoised
  // plot (the cursor hairline's own rule), each on its network's plane.
  it("the Moment and Range heads wear a notable day's kind chip, and the planes draw the marks", () => {
    const moment = read("components/inspector/TrendInstantPane.tsx");
    // The bucket chip is a clock mark and the width alone (user, 2026-10-30: "instead of saying
    // '5-min bucket' say '5-min' with an icon, shorter"); "bucket" stays for assistive tech.
    expect(moment).toMatch(/<span className="inline-flex items-center gap-1">\s*<BUCKET_ICON aria-hidden[^]*?\{bucketWord\(stepMs\)\}[^]*?<span className="sr-only"> bucket<\/span>/);
    expect(read("components/notes/NoteKindChip.tsx")).toMatch(/<span className="inline-flex items-center gap-1">\s*<Mark aria-hidden/);
    expect(moment).not.toMatch(/\{bucketWord\(stepMs\)\} bucket/);
    expect(moment).toMatch(/notableDayAt\(/);
    expect(moment).toMatch(/<NoteKindChip day=\{/);
    const range = read("components/inspector/TrendRangePane.tsx");
    expect(range).toMatch(/notableDayOfRange\(/);
    expect(range).toMatch(/<NoteKindChip day=\{/);
    const chip = read("components/notes/NoteKindChip.tsx");
    expect(chip).toMatch(/<QualifierChip/);
    expect(chip).toMatch(/NOTE_KIND_ICONS\[day\.kind\]/);
    expect(chip).toMatch(/NOTE_KIND_WORD\[day\.kind\]/);
    // A tag the AI's note produced wears the AI's edge (user, 2026-10-30).
    expect(chip).toMatch(/<QualifierChip className=\{AI_SWEEP\}>/);
    // The unlisted set keeps its mandated neutral: `identityHudCss` would hash it a saturated hue.
    expect(chip).toMatch(/UNLISTED_ID \? UNLISTED_HUE : identityHudCss/);
    const stack = read("components/TrendStack.tsx");
    expect(stack).toMatch(/const marksById = useMemo\(/);
    expect(stack).toMatch(/marks=\{marksById\.get\(pose\.id\)\}/);
    const chart = read("components/docs/TrendChart.tsx");
    expect(chart).toMatch(/marks\?: readonly TrendMark\[\];/);
    // Drawn beside the plot, never inside it: TrendPlot's own props carry no marks.
    const plot = chart.slice(chart.indexOf("const TrendPlot = memo("));
    expect(plot).not.toMatch(/\bmarks[,=}]|\bmarks\b.*\?:/); // the word "axis marks" in prose is fine; the prop is not
  });

  it("plays the rail's arrival pulse, in the AI hue (user, 2026-10-30)", () => {
    expect(card).toMatch(/const pulseKey = useEdgePulse\(subject \? /);
    expect(card).toMatch(/<PulseEdge pulseKey=\{pulseKey\} rail="right" off=\{collapsed\} hue="var\(--ai-mark\)" \/>/);
  });

  // ONE COMMIT FOR A DAY (user, 2026-10-30): the row, the band's mark and the plane's coin all bring
  // the day's plane forward and set its range through `commitNoteDay`, so none can forget the plane.
  it("every surface commits a notable day through one home, the plane through the executor", () => {
    const home = read("components/notes/commitNoteDay.ts");
    expect(home).toMatch(/applyClickActions\(noteDayActions\(/);
    expect(home).toMatch(/setTrendRange\(notableDaySpan\(/);
    for (const f of ["components/notes/NotesCard.tsx", "components/notes/NoteDiamonds.tsx", "components/TrendStack.tsx"]) {
      expect(read(f), f).toMatch(/commitNoteDay\(/);
      expect(read(f), f).not.toMatch(/setTrendRange\(\{ fromMs: (day|d)\w*\.?\w*, toMs/);
    }
  });

  // Review 2026-10-30. The hook sat after the early return, so the card's hook count depended on
  // state; nothing lints for it here, so this test does.
  it("calls every hook before its early return", () => {
    const body = fnBody(card, "export default function NotesCard(");
    expect(body.indexOf("useEdgePulse(")).toBeLessThan(body.indexOf("if (!subject || !req) return null;"));
  });

  // A click holds the plot, the coin unmounts under the pointer and no pointerleave fires, so a
  // coin that cleared the channel only on leave left the day lit (the row's and diamond's own rule).
  it("a plane's coin clears only the hover it set, on leave and on unmount", () => {
    const chart = read("components/docs/TrendChart.tsx");
    const coin = fnBody(chart, "function MarkCoin(");
    expect(coin).toMatch(/const mine = useRef\(false\);/);
    expect(coin).toMatch(/useEffect\(\s*\(\) => \(\) => \{\s*if \(mine\.current\)/);
    expect(chart).toMatch(/onMarkHover\?: \(dayMs: number, on: boolean\) => void;/);
    expect(read("components/TrendStack.tsx")).toMatch(/st\.hoverNoteDay === dayMs/);
  });

  // Rule 10: "no fallback" retired the measured lead, not the instrument state for an empty span.
  it("a span with no reading says so, once the read has landed", () => {
    const range = read("components/inspector/TrendRangePane.tsx");
    expect(range).toMatch(/const noReading = headValue == null && slice\.p != null && !slice\.stale && !roster\.pending/);
    expect(range).toMatch(/noReading[^]*?No reading/);
  });

  // Only a note the reader watched arrive is typed: one already held appears at once, the full text
  // reserves its height so the card never grows per letter, and a screen reader gets it whole.
  it("types a note in on both surfaces, through one component", () => {
    const typed = read("components/notes/TypedNote.tsx");
    expect(typed).toMatch(/prefers-reduced-motion: reduce/);
    expect(typed).toMatch(/<span className="invisible col-start-1 row-start-1">\{text\}<\/span>/);
    expect(typed).toMatch(/<span aria-hidden className="col-start-1 row-start-1"><NoteText text=\{text\} upto=\{shown\} \/><\/span>/);
    expect(typed).toMatch(/<span className="sr-only">\{text\}<\/span>/);
    expect(card).toMatch(/<TypedNote text=\{res\.text\} waited=\{waited\}/);
    expect(read("components/notes/SubjectNote.tsx")).toMatch(/<TypedNote text=\{text!?\} waited=\{waited\}/);
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
  it("SubjectNote has no door and no fallback: the note is the lead, standing down on none, saying so on unavailable, and asks once in an effect", () => {
    const src = read("components/notes/SubjectNote.tsx");
    expect(src).not.toMatch(/RequestDoor|<Door\b/);
    expect(src).not.toMatch(/Couldn/);
    // THE NOTE IS THE LEAD (user, 2026-10-30, then "no fallback"): the measured lead sentences
    // are gone from the four cards; the note's place shows "reading…" while it is in flight, nothing on none, and "no note right now" on unavailable (an instrument
    // state, not a door: the reader made no ask to answer). No label row: the text names its span.
    expect(src).toMatch(/if \(!asked \|\| res\?\.state === "none"\) return null;/);
    // `unavailable` is an instrument state in the note's place, not a door and not silence (user, 2026-10-30).
    expect(src).toMatch(/res\?\.state === "unavailable" \? \([^]*?no note right now/);
    expect(src).not.toMatch(/RequestDoor|Couldn/);
    expect(src).not.toMatch(/fallback[=:}]|SectionLabel|Constellation Gate AI/); // the word may stay in prose; no prop, no render of one
    // THE LAST LINE OF THE HEAD (user, 2026-10-31, option B of six: "not embedded enough in the
    // card"): no box, no fill, no sweep of its own. The mark sits under the title's kind mark and the
    // words on the title's column, so its width plus the gap is the kind mark's 16px plus its 8.
    expect(src).not.toMatch(/AI_SWEEP/);
    expect(src).toMatch(/data-note-lead="" className="mt-2\.5 mb-3 flex gap-\[9px\]"/);
    // The head's rule stands down for it, wherever a card's body wraps it, and only while it stands:
    // a card with no note to have keeps its rule. The rule's own margins go with it.
    const head = read("components/CardHead.tsx");
    expect(head).toMatch(/has-\[\+\[data-note-lead\]\]:hidden/);
    expect(head).toMatch(/has-\[\+\*>\[data-note-lead\]:first-child\]:hidden/);
    // …and with no note a body's leading Separator stands down, or two hairlines touch.
    expect(head).toMatch(/\[&\+\[data-slot=separator\]\]:hidden/);
    expect(src).toMatch(/const MARK = <AI_NOTES_ICON aria-hidden className="ml-px mt-\[3px\] size-3\.5 shrink-0 text-\[var\(--ai-mark\)\]" \/>;/);
    // The sweep stays the chip's: a true ring, so the card's own surface shows through.
    const sweep = read("components/notes/aiSweep.ts");
    expect(sweep).toMatch(/before:\[background:var\(--ai-edge\)\]/);
    expect(sweep).toMatch(/before:\[mask:[^"]*content-box_exclude/);
    expect(sweep).toMatch(/before:opacity-/);
    expect(sweep).toMatch(/before:p-\[0\.5px\]/); // a hairline: 2026-10-31, "a thinner box"
    expect(sweep).not.toMatch(/--panel-solid\)|--background\)|_padding-box/);
    expect(read("app/globals.css")).toMatch(/--ai-wash: light-dark\(color-mix\(in oklch, var\(--ai-mark\) 8%, transparent\), color-mix\(in oklch, var\(--ai-mark\) 4%, transparent\)\)/);
    expect(src).toMatch(/useEffect\(\(\) => \{[^]*?res\?\.state !== "request"[^]*?note\.request\(\)[^]*?\}, \[/);
    // …once per key (the ref guard, so a re-render or a poll's `request` never POSTs twice), and only
    // after the key has stood for the dwell (final review I1: paging and a deck rotation change the
    // key many times in seconds; each would be a Gate write).
    expect(src).toMatch(/askedFor\.current === key\) return;/);
    expect(src).toMatch(/setTimeout\(\(\) => \{[^]*?note\.request\(\);[^]*?\}, ASK_DWELL_MS\);[^]*?return \(\) => clearTimeout\(t\);/);
  });

  it("the Country, Provider, Composition and Range cards mount it as their lead, with no measured lead beside it; the Range card in both its modes", () => {
    const cards = read("components/inspector/cards.tsx");
    for (const decl of ["export function CountryCard(", "export function ProviderCard(", "export function CompositionCard("]) {
      const body = fnBody(cards, decl);
      expect(body, decl).toMatch(/<SubjectNote\b/);
      expect(body, decl).not.toMatch(/<Lead\b/); // the measured lead sentence is gone (user, 2026-10-30)
    }
    const range = read("components/inspector/TrendRangePane.tsx");
    // …in BOTH its modes (user, 2026-10-30): the brushed range's, or the forward plane's over the window.
    expect(range).toMatch(/<SubjectNote req=\{rangeCardNoteReq\(/);
    expect(range).not.toMatch(/\{range \? <SubjectNote\b/);
    expect(range).not.toMatch(/<Lead\b/);
  });

  it("History's top card is the window's note: no range in its span, and no range door", () => {
    expect(read("components/notes/useAiNote.ts")).not.toMatch(/span = .*trendRange/);
    expect(read("components/notes/NotesCard.tsx")).not.toMatch(/for this range/);
  });

  it("a country or provider note is scoped by the network the view stands on, never the metagraph card's", () => {
    const body = fnBody(read("components/notes/useAiNote.ts"), "export function useNoteScopeNetwork(");
    expect(body).toMatch(/useStore\(viewNetwork\)/);
    expect(body).not.toMatch(/metagraphCardNetwork\(/);
  });

  it("the top card's subject carries no country", () => {
    expect(read("components/notes/noteSubject.ts")).not.toMatch(/\bcountry\b\s*[?:]/);
  });
});

describe("a folded card's title column", () => {
  it("is the view's, set on the lane and read by the head", () => {
    expect(read("components/CardHead.tsx")).toMatch(/flex-none min-w-\[var\(--entry-col\)\]/);
    expect(read("components/Inspector.tsx")).toMatch(/\["--entry-col"\]: VIEW_POLICIES\[mode\]\.entryColumn/);
  });
});

// A NOTE'S NETWORK NAMES WEAR THEIR COLOUR (user, 2026-10-31), found by code (`noteNames.ts`), on
// every surface a note's words reach, the screen reader's copy left plain.
describe("network names in a note", () => {
  it("every surface draws through NoteText, and a colour is text ink", () => {
    const typed = read("components/notes/TypedNote.tsx");
    expect(typed).toMatch(/<NoteText text=\{text\} \/>/);
    expect(typed).toMatch(/<NoteText text=\{text\} upto=\{shown\} \/>/);
    expect(typed).toMatch(/<span className="sr-only">\{text\}<\/span>/);
    expect(read("components/notes/NotesCard.tsx")).toMatch(/<NoteText text=\{day\.caption\} \/>/);
    const text = read("components/notes/NoteText.tsx");
    expect(text).toMatch(/className=\{IDENT_INK\}/);
    expect(text).not.toMatch(/dangerouslySetInnerHTML|font-|<a\b|onClick/);
  });
});

// THE SWITCH (user, 2026-10-31: deploy with the AI card behind a flag): off unless the build says
// "on", so a forgotten setting cannot turn it on, and off is the app with no note anywhere: no card,
// no request, no write. The state notes already have off mainnet.
describe("the AI notes switch", () => {
  it("is on only when the build says so", () => {
    expect(read("src/engine/config.ts")).toMatch(/export const AI_NOTES_ON = process\.env\.NEXT_PUBLIC_AI_NOTES === "on";/);
  });
  it("stops every client ask at the one request", () => {
    expect(read("components/notes/useAiNote.ts")).toMatch(/subject && net === "mainnet" && AI_NOTES_ON \?/);
    expect(read("components/notes/SubjectNote.tsx")).toMatch(/useNet\(\) === "mainnet" && AI_NOTES_ON \? req : null/);
  });
  it("stops every route before the Gate or the store", () => {
    for (const route of ["route", "request/route", "warm/route"])
      expect(read(`app/api/notes/${route}.ts`)).toMatch(/if \(!AI_NOTES_ON\) return Response\.json\(/);
  });
  it("the About page says nothing of a card that is not there", () => {
    expect(read("components/docs/AboutDoc.tsx")).toMatch(/\{AI_NOTES_ON && \(/);
  });
});
