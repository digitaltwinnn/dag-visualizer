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

const SCHEMATIC: Partial<Record<Mode, ReactNode>> = {
  status: <NetworkSchematic />,
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
    <figure id="blueprint" aria-hidden={false}>
      <div className="bp-art">{art}</div>
      <figcaption className="bp-cap">
        <span className="bp-tag">preview · in development</span>
        <span className="bp-line">{CAPTION[mode]}</span>
      </figcaption>
    </figure>
  );
}
