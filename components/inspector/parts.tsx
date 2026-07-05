"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NodeInfo } from "@/src/data/types";
import {
  nodeStatus,
  statusBreakdown,
  labelBreakdown,
  BUCKET_COLOR,
  type StatusBucket,
} from "@/src/data/nodeStatus";
import { compositionRows } from "@/src/data/composition";

// Shared building blocks for the inspector cards (the React port of ui.js _cardBody),
// split out so each per-kind card reads as its own small file.

export const ROLE_FR: Record<string, string> = { l0: "L0", cl1: "currency-L1", dl1: "data-L1" };
export const ROLE_SHORT: Record<string, string> = { l0: "L0", cl1: "cL1", dl1: "dL1" };
export const ROLE_ORDER = ["l0", "cl1", "dl1"];

// A node's roles, falling back to its primary layer when the role list is absent.
export const rolesOf = (n: NodeInfo) => (n.roles && n.roles.length ? n.roles : [n.layer!]);

// Shared "Ready" text treatment (plain, no chrome) — the structural green success token, not an
// identity colour, so it's the one place we lean on a theme token instead of the exact legacy hex.
const READY_CLS = "text-success font-semibold text-[12.5px]";

// The ONE identity dot every row list leads with (the filter picker's rows, the geo explorer's
// node rows): a plain small disc in the subject's identity hue — flat fill, NO glow (the geo
// rows' old `shadow-[0_0_5px_currentColor]` halo read much brighter than the picker's dots;
// user-unified to the picker's exact treatment).
export function IdentityDot({ hue }: { hue: string }) {
  return <span className="w-2 h-2 rounded-full flex-none" style={{ background: hue }} aria-hidden />;
}

// Single node status — Ready reads as plain green text; any other state is a small pill in its
// bucket colour, labelled with the exact stage. Colour = bucket (lane-clean), text = exact state.
export function StatusMark({ state }: { state?: string | null }) {
  const s = nodeStatus(state);
  if (s.bucket === "ready") return <span className={READY_CLS}>{s.label}</span>;
  return (
    <Badge
      variant="outline"
      className="text-[11px] font-semibold px-2 py-px rounded-full border"
      style={{ color: s.color, borderColor: s.color + "55", background: s.color + "1a" }}
    >
      {s.label}
    </Badge>
  );
}

// Rolled-up status for a node group (dossier): the non-zero buckets as counts + colour dots
// (`28 ready · 2 waiting · 1 syncing · 2 down`). Deliberately NO "all ready" special case
// (user reversal — the green bold idiom dominated the card): ready is a count in the same
// muted text as every other status, its green BULLET alone carrying the semantic. The amber
// "progress" bucket is spelled out by its exact lifecycle state(s) — same wording a single
// node's own card shows (`StatusMark`) — instead of collapsing to a bare "N in progress";
// colour still comes from the bucket (BUCKET_COLOR), only the text goes granular.
const BUCKET_WORD: Record<StatusBucket, string> = {
  ready: "ready",
  progress: "in progress",
  down: "down",
  unknown: "unknown",
};
export function StatusBreakdown({ states }: { states: (string | null | undefined)[] }) {
  const b = statusBreakdown(states);
  const order: StatusBucket[] = ["ready", "progress", "down", "unknown"];
  // EVERY status item carries its own colour bullet (in its bucket's colour) — the progress
  // bucket spells out several stage words (syncing / joining / …), and rendering one dot per
  // BUCKET left every stage after the first (e.g. "1 joining") bullet-less.
  const items = order
    .filter((k) => b[k] > 0)
    .flatMap((k) =>
      k === "progress"
        ? labelBreakdown(states, "progress").map((it) => ({ ...it, color: BUCKET_COLOR[k] }))
        : [{ label: BUCKET_WORD[k], count: b[k], color: BUCKET_COLOR[k] }],
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {items.map((it, i) => (
        <span className="inline-flex items-center gap-[5px]" key={it.label}>
          {i > 0 ? <span className="text-muted-foreground opacity-60"> · </span> : null}
          <span className="w-[7px] h-[7px] rounded-full" style={{ background: it.color }} />
          <span>
            {it.count} {it.label}
          </span>
        </span>
      ))}
    </span>
  );
}

// One composition row per make-up: role (bright) + codes (muted) + a capped chip stack
// (visual scale only, ≤10, no +N) + the authoritative count. (A per-row status line lived
// here briefly — reverted: it read too busy; the dossier shows ONE aggregate StatusBreakdown
// as the composition block's attached footer instead.)
export function CompositionRows({ nodes }: { nodes: NodeInfo[] }) {
  const rows = compositionRows(nodes);
  return (
    <div className="flex flex-col gap-[7px] mt-2">
      {rows.map((r, i) => (
        <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2" key={i}>
          <span className="text-[12.5px] text-foreground">{r.label}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{r.codes.join("·")}</span>
          {/* Chip stack = a miniature of the 3D node cloud: identity-hued discs that OVERLAP (like
              stacked avatars), each ringed in the panel colour so the overlap reads. Visual scale
              only (capped ≤10). Plain overlapping dots (no image/fallback content), so a bare
              utility span reproduces the look more directly than fighting Avatar's chrome. */}
          <span className="inline-flex justify-end items-center pl-1" aria-hidden>
            {Array.from({ length: Math.min(r.count, 10) }).map((_, j) => (
              <span
                key={j}
                className="w-[9px] h-[9px] rounded-full -ml-1"
                style={{
                  background: "color-mix(in oklch, var(--filter-accent, #a0afcd) 60%, transparent)",
                  boxShadow: "0 0 0 1.5px var(--panel)",
                }}
              />
            ))}
          </span>
          <span className="text-[12.5px] text-foreground tabular-nums min-w-[1.5em] text-right">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

// One pass over a metagraph's nodes → the facts every card needs to describe it.
// (Was computed twice — once for the meta card's rows, once for the meta-node blurb.)
export interface Composition {
  present: string[]; // role keys present, in ROLE_ORDER
  hybrid: number; // nodes running more than one layer
  dedBy: Record<string, number>; // dedicated-node count per role
  parts: string[]; // e.g. ["3 hybrid", "19 dedicated data-L1"]
  total: number;
  hasCurrency: boolean; // runs a currency-L1 cluster → has a real token
}
export function nodeComposition(nodes: NodeInfo[]): Composition {
  const present = ROLE_ORDER.filter((r) => nodes.some((n) => rolesOf(n).includes(r)));
  const hybrid = nodes.filter((n) => rolesOf(n).length > 1).length;
  const dedBy: Record<string, number> = {};
  for (const n of nodes) {
    const r = rolesOf(n);
    if (r.length === 1) dedBy[r[0]!] = (dedBy[r[0]!] || 0) + 1;
  }
  const parts = (hybrid ? [`${hybrid} hybrid`] : []).concat(
    present.filter((r) => dedBy[r]).map((r) => `${dedBy[r]} dedicated ${ROLE_FR[r]}`),
  );
  const total = hybrid + Object.values(dedBy).reduce((a, b) => a + b, 0);
  return { present, hybrid, dedBy, parts, total, hasCurrency: present.includes("cl1") };
}

// The network-type descriptor for the dossier ticker row (subtle, behind the ticker) — derived
// from the SAME composition read as the old "data metagraph · no token" body line (reused, not
// re-derived): a metagraph is a "data"/"currency"/"data and currency" metagraph by whether it
// runs dL1/cL1 nodes; the DAG core is the one exception ("hypergraph", not a metagraph at all).
export function networkKind(id: string, nodes: NodeInfo[]): string {
  if (id === "dag") return "hypergraph";
  // With zero locatable nodes the roles are unknown — claiming a type would be a guess.
  if (nodes.length === 0) return "metagraph";
  const { present, hasCurrency } = nodeComposition(nodes);
  const hasData = present.includes("dl1");
  if (hasCurrency && hasData) return "data and currency metagraph";
  if (hasCurrency) return "currency metagraph";
  return "data metagraph";
}

// Long description with a 3-line clamp + "Show more" (replaces ui.js _descHTML + the delegated
// toggle; here it's just local state). Clamp-worthiness is decided SYNCHRONOUSLY from text
// length (no post-paint measurement), so the control always renders in the same frame as the
// card — the only "Show more appears late" case left is a data swap: on a cold boot the dossier
// shows the short `cfg.blurb` (~110 chars, genuinely un-clampable) until `/api/metagraphs`
// delivers the long `description`, and the button rightly arrives WITH that longer text.
// Kept custom over shadcn Collapsible (evaluated): Collapsible's model is hidden-when-closed,
// ours is always-visible-but-clamped — forceMount + data-state clamp overrides would invert the
// primitive into a bare state container, so local state + aria-expanded is the smaller truth.
// Keyed on `text` by the caller (MetaCard) so `open` resets when the subject changes.
export function Desc({ text }: { text?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  if (text.length <= 180) return <p className="text-[13px] leading-[1.6] text-[#c7d0ea] mb-0">{text}</p>;
  return (
    <>
      <p className={cn("text-[13px] leading-[1.6] text-[#c7d0ea] mb-0", open ? "line-clamp-none" : "line-clamp-3")}>
        {text}
      </p>
      <Button
        type="button"
        variant="link"
        size="xs"
        className="inline-block h-auto mt-0.5 mb-0 p-0 text-[11px] font-semibold"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Show less" : "Show more"}
      </Button>
    </>
  );
}
