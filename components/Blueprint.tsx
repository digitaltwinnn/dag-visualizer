"use client";

import type { ReactNode } from "react";
import { useStore } from "@/src/store/store";
import type { Mode } from "@/src/store/store";

// The center schematic BLUEPRINT for the not-yet-built ("SOON") views. A faint, abstract wireframe
// of what each view will become — explicitly labelled `preview · in development` so it never reads
// as live data (no numbers, no real values). Structural chrome only (blueprint = chrome, not
// identity); accent/flow lines in cyan. Renders on the empty scene (SceneCanvas fades out for flat
// views). Not shown for the three 3D views.

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
          className={"bp-cell" + (dashed ? " bp-cell--wait" : "") + (hollow ? " bp-cell--off" : "")}
        />,
      );
    }
  }
  return (
    <svg viewBox={`-6 -6 ${cols * gap} ${rows * gap}`} className="bp-svg" role="img" aria-label="Network health grid preview">
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
    <svg viewBox="0 0 230 190" className="bp-svg" role="img" aria-label="Transaction flow preview">
      <defs>
        <marker id="bp-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8" className="bp-arrowhead" />
        </marker>
      </defs>
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
          className="bp-flow" markerEnd="url(#bp-arrow)" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={7} className="bp-addr" />
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
    <svg viewBox="0 0 230 190" className="bp-svg" role="img" aria-label="Delegated staking preview">
      {stakers.map((s, i) => {
        const val = validators[s.v];
        return <line key={"l" + i} x1={s.x} y1={s.y} x2={val.x} y2={val.y} className="bp-delegate" />;
      })}
      {stakers.map((s, i) => <circle key={"s" + i} cx={s.x} cy={s.y} r={3.5} className="bp-staker" />)}
      {validators.map((v, i) => <circle key={"v" + i} cx={v.x} cy={v.y} r={v.r} className="bp-validator" />)}
    </svg>
  );
}

const SCHEMATIC: Partial<Record<Mode, ReactNode>> = {
  status: <NetworkSchematic />,
  transactions: <TransactionsSchematic />,
  staking: <StakingSchematic />,
};

const CAPTION: Partial<Record<Mode, string>> = {
  status: "Network health — validator uptime, node states and version spread across the network.",
  transactions: "Transactions — $DAG and metagraph currencies moving between addresses, plus lookup and economics.",
  staking: "Delegated staking — who is staked to which validators, total delegated, and rewards flowing back.",
};

export default function Blueprint() {
  const mode = useStore((s) => s.mode) as Mode;
  const art = SCHEMATIC[mode];
  if (!art) return null; // 3D views + any placeholder without art yet
  return (
    <figure id="blueprint">
      <div className="bp-art">{art}</div>
      <figcaption className="bp-cap">
        <span className="bp-tag">preview · in development</span>
        <span className="bp-line">{CAPTION[mode]}</span>
      </figcaption>
    </figure>
  );
}
