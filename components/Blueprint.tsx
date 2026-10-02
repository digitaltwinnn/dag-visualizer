"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { useBreakpoint } from "@/components/useBreakpoint";

// Structural blueprint chrome expressed as Tailwind-on-tokens. Stroke/fill come through
// class-based `[stroke:…]` utilities (CSS declarations, so `var()`/`color-mix()` resolve —
// unlike an SVG presentation attribute), keeping the cyan accents tied to the design tokens.
const BP_CELL = "fill-none [stroke:color-mix(in_oklch,var(--primary)_40%,var(--border))] [stroke-width:1.25]";
const BP_CELL_WAIT = "[stroke-dasharray:3_3] [stroke:color-mix(in_oklch,var(--primary)_55%,transparent)]";
const BP_CELL_OFF = "[stroke:var(--border)] opacity-50";
const BP_FLOW = "fill-none [stroke:color-mix(in_oklch,var(--primary)_55%,transparent)] [stroke-width:1.25] [stroke-dasharray:4_4]";
const BP_ARROWHEAD = "fill-none [stroke:color-mix(in_oklch,var(--primary)_55%,transparent)] [stroke-width:1]";
const BP_VALIDATOR = "fill-none [stroke:color-mix(in_oklch,var(--primary)_45%,var(--border))] [stroke-width:1.5]";
const BP_STAKER = "[fill:color-mix(in_oklch,var(--primary)_45%,transparent)] stroke-none";
const BP_DELEGATE = "[stroke:var(--border)] [stroke-width:1]";
const BP_SVG = "block w-full h-auto overflow-visible";
const BP_SLOT = "fill-none [stroke:color-mix(in_oklch,var(--primary)_38%,var(--border))] [stroke-width:1.5] [stroke-dasharray:5_6]";

// The schematic BLUEPRINT GALLERY for the one consolidated "Coming soon" view (2026-09-04 —
// three separate placeholder modes said the same nothing three times; the ONE view now previews
// every coming feature side by side). Faint, abstract wireframes with no numbers and no real
// values, so nothing reads as live data — the register itself carries that claim since the
// `preview · in development` eyebrow retired (user, 2026-09-09: the view switch already says
// "Coming soon").
// Structural chrome only (blueprint = chrome, not identity); accent/flow lines in cyan. Renders
// on the empty scene (the canvas hides for the flat view). Not shown in any 3D view.
//
// DRAWINGS ONLY, ON A LOOSE TABLE (user, 2026-10-02 — `docs/superpowers/design/2026-10-02-soon-
// gallery`, option B: "just show the separate svgs but no text … say more things are coming but
// not sure yet what will come first"). The names, the icons and the sentences are gone, and so is
// the ROW: three captioned columns read as a roadmap, in that order. The drawings now lie like
// sketches on a table — different sizes, slightly turned, no shared baseline — so nothing is
// first, and a few EMPTY dashed frames among them say "and more" without naming anything. Static:
// the turn is a resting pose, not motion. The accessible names stay on each drawing.

// Network → a health GRID of node cells (a couple dashed = waiting, one hollow = offline —
// schematic states, not counts).
function NetworkSchematic() {
  const cells = [];
  const cols = 8, rows = 4, gap = 26, r = 7;
  let i = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++, i++) {
      const cx = x * gap + r, cy = y * gap + r;
      const dashed = i === 9 || i === 22;   // "waiting"
      const hollow = i === 17;              // "offline"
      cells.push(
        <rect
          key={i}
          x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={3}
          className={cn(BP_CELL, dashed && BP_CELL_WAIT, hollow && BP_CELL_OFF)}
        />,
      );
    }
  }
  return (
    <svg viewBox={`-6 -6 ${cols * gap} ${rows * gap}`} className={BP_SVG} role="img" aria-label="Network health grid preview">
      {cells}
    </svg>
  );
}

// Transactions → an address/flow graph (address nodes + dashed flow arrows between them).
function TransactionsSchematic() {
  const nodes = [
    { x: 20, y: 30 }, { x: 120, y: 16 }, { x: 210, y: 54 },
    { x: 70, y: 96 }, { x: 168, y: 110 }, { x: 30, y: 150 }, { x: 140, y: 168 },
  ];
  const edges: [number, number][] = [[0, 1], [1, 2], [0, 3], [3, 4], [4, 2], [3, 5], [5, 6], [6, 4]];
  return (
    <svg viewBox="0 0 230 190" className={BP_SVG} role="img" aria-label="Transaction flow preview">
      <defs>
        <marker id="bp-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8" className={BP_ARROWHEAD} />
        </marker>
      </defs>
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
          className={BP_FLOW} markerEnd="url(#bp-arrow)" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={7} className={BP_CELL} />
      ))}
    </svg>
  );
}

// Staking → validators (sized) with delegation lines converging from smaller staker dots.
function StakingSchematic() {
  const validators = [{ x: 70, y: 60, r: 16 }, { x: 170, y: 120, r: 13 }];
  const stakers = [
    { x: 14, y: 20, v: 0 }, { x: 20, y: 96, v: 0 }, { x: 120, y: 22, v: 0 },
    { x: 220, y: 60, v: 1 }, { x: 210, y: 170, v: 1 }, { x: 110, y: 176, v: 1 }, { x: 60, y: 150, v: 0 },
  ];
  return (
    <svg viewBox="0 0 230 190" className={BP_SVG} role="img" aria-label="Delegated staking preview">
      {stakers.map((s, i) => {
        const val = validators[s.v];
        return <line key={"l" + i} x1={s.x} y1={s.y} x2={val.x} y2={val.y} className={BP_DELEGATE} />;
      })}
      {stakers.map((s, i) => <circle key={"s" + i} cx={s.x} cy={s.y} r={3.5} className={BP_STAKER} />)}
      {validators.map((v, i) => <circle key={"v" + i} cx={v.x} cy={v.y} r={v.r} className={BP_VALIDATOR} />)}
    </svg>
  );
}

// An empty frame — a coming thing nobody has drawn yet.
function EmptyFrame({ w, h }: { w: number; h: number }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={BP_SVG} aria-hidden>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={10} className={BP_SLOT} />
    </svg>
  );
}

// The table's layout as data: each piece's place (percent of the table), width and turn. Two
// arrangements — the wide table, and a tall one for a phone, where the same pieces stack loosely
// instead of shrinking to thumbnails. The order here is paint order only.
interface Piece { art: ReactNode; left: number; top: number; width: number; turn: number; dim?: number }
const WIDE: Piece[] = [
  { art: <TransactionsSchematic />, left: 9, top: 10, width: 23, turn: -4 },
  { art: <NetworkSchematic />, left: 39, top: 38, width: 27, turn: 2 },
  { art: <StakingSchematic />, left: 71, top: 6, width: 19, turn: 5 },
  { art: <EmptyFrame w={200} h={120} />, left: 22, top: 68, width: 13, turn: 3, dim: 0.6 },
  { art: <EmptyFrame w={160} h={130} />, left: 74, top: 62, width: 11, turn: -6, dim: 0.6 },
  { art: <EmptyFrame w={150} h={100} />, left: 47, top: 4, width: 9, turn: -2, dim: 0.5 },
];
// ⚠️ On a phone the parked grids are COLUMNS, and the DAG's runs down the left edge to about 60%
// of the screen — so the upper half of the tall table keeps to the right of it.
const TALL: Piece[] = [
  { art: <EmptyFrame w={150} h={100} />, left: 66, top: 0, width: 24, turn: 5, dim: 0.5 },
  { art: <TransactionsSchematic />, left: 42, top: 14, width: 48, turn: -4 },
  { art: <NetworkSchematic />, left: 32, top: 47, width: 58, turn: 2 },
  { art: <StakingSchematic />, left: 6, top: 68, width: 40, turn: 4 },
  { art: <EmptyFrame w={160} h={130} />, left: 60, top: 82, width: 20, turn: -6, dim: 0.6 },
];

export default function Blueprint() {
  const mode = useStore((s) => s.mode);
  const bp = useBreakpoint();
  if (mode !== "soon") return null;
  const pieces = bp === "phone" ? TALL : WIDE;
  return (
    // top-[38vh], not inset-0 (user, 2026-09-04: the gallery "fights with the nodes at the top"):
    // the parked fleet grids hold the viewport's top band on every flat view, so the table takes
    // the space BELOW them. The bottom edge clears the footer strip plus a breather. Nothing here
    // is interactive, so it takes no pointer events.
    <figure
      id="blueprint"
      aria-label="Coming features, in no particular order"
      // The phone arm also clears the dock that sits under the footer there.
      className="fixed inset-x-0 top-[38vh] bottom-[calc(var(--footer-h,0px)+16px)] max-[700px]:bottom-[104px] z-[6] flex justify-center px-6 pointer-events-none"
    >
      <div className="relative h-full w-full max-w-[1100px]">
        {pieces.map((p, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, opacity: p.dim ?? 0.75, rotate: `${p.turn}deg` } as CSSProperties}
          >
            {p.art}
          </div>
        ))}
      </div>
    </figure>
  );
}
