"use client";

// The SUBJECT CALLOUT (user, 2026-08-15) — a scene-anchored label naming the committed subject in
// the 3D view itself: an Instrument-Glass mini-panel tied to the subject's rendered position by a
// dashed leader ending in a small identity-hued ring, the same leader language as the ledger's
// ordinal labels. It is a LABEL, not a control (`pointer-events-none` — the subject's controls are
// the rail cards), and it carries the CardHead register at tooltip scale: eyebrow slot noun,
// identity dot + name, ticker aside, one muted lead line.
//
// SPLIT OF LABOUR (the spike's conclusion, and the user's own instinct — "furniture can be regular
// threejs object text, subjects more 2d/3d html type of content"): FURNITURE labels are in-scene
// canvas-texture meshes (`makeEdgeLabel` — they bloom on the scene lane and ride shader fades);
// the SUBJECT callout is real HUD DOM, composited crisp over the bloom pass, so it can reuse the
// HUD's tokens and grammar directly. CSS2DRenderer was evaluated and declined: the node chips are
// InstancedMesh instances (nothing to parent a CSS2DObject to), so the per-frame anchor resolution
// must exist in the Engine either way — the renderer would only replace the final projection while
// adding its own overlay container, render pass and a React-portal handshake.
//
// OWNERSHIP: React owns this DOM and its content (from committed store state); the ENGINE owns its
// per-frame placement — `Engine._syncCallout()` projects the subject's rendered anchor and writes
// `transform` + `data-on` straight to `#callout` (the Tooltip discipline: position never triggers
// a React render). `#callout` is therefore a marker contract (CLAUDE.md table) — the wrapper is a
// 0-size ANCHOR at the projected point, and everything inside is laid out relative to it, so the
// engine writes exactly one transform and one flag.
//
// V1 SCOPE (hyper, first consumer — `viewPolicy.callout`): the anchor is NETWORK-level — the
// committed metagraph's hub, or the DAG core. A committed NODE keeps the network callout: hyper's
// own camera answers a node commit with its network's framing (a node is one bead on a shell), so
// the callout matches what the view frames; per-node anchors arrive with the geo rollout, where a
// chip has a positional identity of its own. `unlisted` has no anchor — honest absence, no callout.
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { displayNetwork } from "@/src/data/unlisted";

// Panel offset from the anchor, up and to the right. The leader spans exactly this diagonal, so
// the three pieces (ring, line, panel corner) stay attached by construction.
const OFF_X = 62;
const OFF_Y = 92;

// The composition lead line: the layer codes present across the network's machines, in the one
// layer vocabulary and its fixed order (L0 · cL1 · dL1).
function layerCodes(nodes: { roles?: string[] }[]): string {
  const has = { l0: false, cl1: false, dl1: false };
  for (const n of nodes) for (const r of n.roles ?? []) if (r in has) has[r as keyof typeof has] = true;
  return (["l0", "cl1", "dl1"] as const)
    .filter((k) => has[k])
    .map((k) => (k === "l0" ? "L0" : k === "cl1" ? "cL1" : "dL1"))
    .join(" · ");
}

export default function SceneCallout() {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const section = useStore((s) => s.section);
  const metaList = useStore((s) => s.metaList);
  if (!VIEW_POLICIES[mode].callout || section !== "scene") return null;
  const net = displayNetwork(filter);
  // "all" has no subject; the unlisted set has no 3D anchor (no machines are knowable).
  if (!net || net.virtual) return null;
  const mg = metaList.find((m) => m.id === filter) ?? null;
  const codes = mg ? layerCodes(mg.nodes) : "";
  const lead = mg ? `${mg.nodes.length} nodes${codes ? ` · ${codes}` : ""}` : null;
  // The ticker aside suppresses itself when it only restates the name (the DAG core's ticker IS
  // its name) — a head must not say the same thing twice (the CardHead aside rule).
  const aside = net.ticker !== net.name ? net.ticker : null;
  return (
    <div
      id="callout"
      data-on="0"
      aria-hidden
      className="fixed left-0 top-0 z-30 pointer-events-none opacity-0 data-[on=1]:opacity-100 transition-opacity duration-200 motion-reduce:transition-none"
    >
      {/* Anchor ring at the projected point (the wrapper's origin). */}
      <span
        className="absolute -translate-x-1/2 -translate-y-1/2 w-[7px] h-[7px] rounded-full border"
        style={{ borderColor: net.hue }}
      />
      {/* Dashed leader from the anchor to the panel's near corner — the ordinal-label language. */}
      <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
        <line x1={5} y1={-5} x2={OFF_X} y2={-OFF_Y + 8} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" />
      </svg>
      {/* The panel — keyed by subject so the roll-in replays on a change, like a card title. */}
      <div
        key={filter}
        className="roll-in absolute whitespace-nowrap rounded-[10px] border border-border px-3 py-2 backdrop-blur-[8px] bg-[var(--panel-solid)]"
        style={{ left: OFF_X, bottom: OFF_Y }}
      >
        <div className="text-micro tracking-caps uppercase text-muted-foreground mb-0.5">
          {filter === "dag" ? "Network" : "Metagraph"}
        </div>
        <div className="flex items-center gap-[7px]">
          <span className="w-[9px] h-[9px] rounded-full flex-none" style={{ background: net.hue }} />
          <span className="text-body font-semibold text-foreground">{net.name}</span>
          {aside && (
            <span className="text-label font-bold ml-1" style={{ color: net.hue }}>
              {aside}
            </span>
          )}
        </div>
        {lead && <div className="text-label text-muted-foreground mt-0.5">{lead}</div>}
      </div>
    </div>
  );
}
