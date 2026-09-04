"use client";

import type { ReactNode } from "react";
import { ArrowLeftRight, HandCoins, Radar, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";

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
const BP_SVG = "w-[min(26vw,280px)] h-auto overflow-visible";

// The schematic BLUEPRINT GALLERY for the one consolidated "Coming soon" view (2026-09-04 —
// three separate placeholder modes said the same nothing three times; the ONE view now previews
// every coming feature side by side). Faint, abstract wireframes — explicitly labelled
// `preview · in development` so nothing reads as live data (no numbers, no real values).
// Structural chrome only (blueprint = chrome, not identity); accent/flow lines in cyan. Renders
// on the empty scene (the canvas hides for the flat view). Not shown for the three 3D views.
// Each feature keeps the mark it wore as a bar button (Radar / ArrowLeftRight / HandCoins), so
// the vocabulary survives the consolidation.

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

const SOON_FEATURES: { name: string; icon: LucideIcon; art: ReactNode; caption: string }[] = [
  {
    name: "Network",
    icon: Radar,
    art: <NetworkSchematic />,
    caption: "Network health: node uptime, node states and version spread across the network.",
  },
  {
    name: "Transactions",
    icon: ArrowLeftRight,
    art: <TransactionsSchematic />,
    caption: "$DAG and metagraph currencies moving between addresses, plus lookup and economics.",
  },
  {
    name: "Staking",
    icon: HandCoins,
    art: <StakingSchematic />,
    caption: "Who is staked to which nodes, total delegated, and rewards flowing back.",
  },
];

export default function Blueprint() {
  const mode = useStore((s) => s.mode);
  if (mode !== "soon") return null;
  return (
    <figure id="blueprint" className="fixed inset-0 z-[6] flex flex-col items-center justify-center gap-9 pointer-events-none px-6">
      <span className="text-label tracking-caps uppercase [color:color-mix(in_oklch,var(--primary)_80%,#fff)] opacity-[0.85]">
        preview · in development
      </span>
      <div className="flex flex-wrap items-start justify-center gap-x-14 gap-y-9 max-w-[1160px]">
        {SOON_FEATURES.map((f) => (
          <figcaption key={f.name} className="flex flex-col items-center gap-3 text-center max-w-[300px]">
            <span className="flex items-center gap-2 text-title font-semibold text-foreground">
              <f.icon aria-hidden className="size-4 text-primary flex-none" />
              {f.name}
            </span>
            <div className="opacity-50">{f.art}</div>
            <span className="text-label text-muted-foreground leading-relaxed">{f.caption}</span>
          </figcaption>
        ))}
      </div>
    </figure>
  );
}
