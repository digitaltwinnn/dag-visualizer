"use client";

import { Fragment, useState, type ReactNode } from "react";
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

// ONE layer vocabulary, app-wide: a layer is `L0` / `cL1` / `dL1` wherever it is named (the rule
// lives with SIGNER_GROUPS in src/data/network.ts). A second long-form map ("currency-L1",
// "data-L1") used to sit here and fed the composition `parts` strings, so the same layer could
// read two ways within one card — the chips beside them have always used these codes.
export const ROLE_SHORT: Record<string, string> = { l0: "L0", cl1: "cL1", dl1: "dL1" };
export const ROLE_ORDER = ["l0", "cl1", "dl1"];

// ── The card body's ONE row grammar, in three weights (user, 2026-08-10) ────────────────────
// Every rail card body is built from these. Before, two grammars competed with no rule for
// which was which — this one-line `Fact` (label left, value right) and a STACKED block (micro
// uppercase label above, value below) that cost twice the height. The stacked form applied to
// `Hosting` but not `Anchored into`, both one-line facts; the node card was stacked end to end,
// paying ~188px for four facts. It is retired: one shape, and a long value wraps inside its own
// column, which the flex row already handles.
//
// What varies is WEIGHT, not shape — three tiers, coarse→fine like everything else here:
//
//   LEAD    the one or two things the card exists to say. Composed by the card itself (see
//           MetaSnapPane's `Lead`), not a primitive — a lead line merges facts and drops labels
//           the unit already carries (`0.0070 DAG` needs no "Fee:").
//   DETAIL  the measured facts — `Fact` inside a `FactGroup`.
//   FOOT    the values you LOOK UP rather than read: hashes, ids, block bookkeeping. Same row
//           shape at a small muted mono treatment, so the foot is a WEIGHT and not a second
//           grammar (user chose this over a denser wrapping run for exactly that reason).
//
// The tiers exist because a flat list charges the same height for a headline number and a
// parent hash. Nothing here is hidden behind a gesture — the app's disclosure model is already
// two-step (card states the SHAPE, raw layer renders the PAYLOAD) and a third tier inside the
// card would be one gesture too many.

// The one fact row. `title` carries the full value for anything the cell truncates.
export function Fact({
  label,
  children,
  title,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-2.5", className)} title={title}>
      <span className="shrink-0 text-body text-muted-foreground">{label}</span>
      <span className="min-w-0 text-body text-foreground tabular-nums text-right">{children}</span>
    </div>
  );
}

// The DETAIL tier — a run of facts at the tight gap. 4px, not the old 8px: at an 18px line the
// old gap was 44% air, which is section spacing doing row spacing's job. Sections are separated
// by the `Foot` rule and by `Separator`, so the rows themselves don't need to be.
export function FactGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-1", className)}>{children}</div>;
}

// The FOOT tier — always last in a card, and now a BASE PLATE rather than a run of rows behind a
// hairline (user, 2026-08-10: "the visual difference … is not very clear; I think it's only the
// font — can you do a bit more?"). It wasn't only the font (the rows already dropped to
// micro/label, `foreground-dim` and mono), but the LABEL had gone uppercase + caps-tracked, which
// in this aesthetic reads as a heading — so the label got louder as the value got quieter and the
// tier netted out flat, on the same ground, behind the same hairline every other resting division
// uses. A hairline says "division"; it can't say "different tier".
//
// So the foot changes GROUND. It full-bleeds by the card's own padding to the panel's bottom edge,
// picking the inner radius back up (`--radius` minus the 1px border), and sits on `--panel-plate`
// — see that token for why the fill is a neutral white LIFT and not the dark scrim this shipped as
// for an afternoon. The plate replaces the `Separator` outright: a rule on top of a ground change
// is redundant noise. (A `--wash-faint` tray was tried and rejected — that family is the
// accent/selection lane, so it read as SELECTED, backwards for look-up data. Pushing contrast
// alone was tried too and read as disabled.)
//
// The bottom bleed is a var so the PAGED box still reaches its own bottom edge: RailPager reserves
// a 36px strip on the panel and overrides `--foot-bleed` to the same number, so the plank and its
// hairline (siblings of the panel, painted after it) ride ON the plate instead of below it.
export function Foot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-3 flex flex-col gap-1",
        "-mx-[var(--card-pad)] px-[var(--card-pad)]",
        "-mb-[var(--foot-bleed,var(--card-pad))] pb-[var(--foot-bleed,var(--card-pad))] pt-[11px]",
        "rounded-b-[calc(var(--radius)-1px)] bg-[var(--panel-plate)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

// One foot row. Mono by default because most of what lands here is a hash or an id; the
// bookkeeping numbers (height · subHeight, block counts) pass `mono={false}`.
export function FootRow({
  label,
  value,
  title,
  mono = true,
}: {
  label: string;
  value: ReactNode;
  title?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2.5" title={title}>
      <span className="text-micro tracking-caps uppercase text-muted-foreground">{label}</span>
      <span className={cn("text-label text-foreground-dim tabular-nums", mono && "font-mono")}>{value}</span>
    </div>
  );
}

// A node's roles, falling back to its primary layer when the role list is absent.
export const rolesOf = (n: NodeInfo) => (n.roles && n.roles.length ? n.roles : [n.layer!]);

// The ONE identity dot every row list leads with (the filter picker's rows, the geo explorer's
// node rows): a plain small disc in the subject's identity hue — flat fill, NO glow (the geo
// rows' old `shadow-[0_0_5px_currentColor]` halo read much brighter than the picker's dots;
// user-unified to the picker's exact treatment).
export function IdentityDot({ hue }: { hue: string }) {
  return <span className="w-2 h-2 rounded-full flex-none" style={{ background: hue }} aria-hidden />;
}

// The ONE status pill chrome (user, 2026-07-12 — unified: ready used to render as plain bold
// green text while every other state got a pill, which read as an inconsistency next to the
// dossier's breakdown). Quiet by construction: the state's bucket colour at soft tint alphas
// (border 0x55, fill 0x1a), never a solid block — so even the green stays un-dominant.
function StatusPill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="text-label font-semibold px-2 py-px rounded-full border"
      // color-mix (not hex-append) so the alpha composes on ANY colour format — the bucket
      // colours are `var(--token)` now (see BUCKET_COLOR): border ~0x55, fill ~0x1a.
      style={{
        color,
        borderColor: `color-mix(in oklch, ${color} 33%, transparent)`,
        background: `color-mix(in oklch, ${color} 10%, transparent)`,
      }}
    >
      {children}
    </Badge>
  );
}

// Single node status — one pill in its bucket colour, labelled with the exact stage (no
// ready special case). Colour = bucket (lane-clean), text = exact state.
export function StatusMark({ state }: { state?: string | null }) {
  const s = nodeStatus(state);
  return <StatusPill color={s.color}>{s.label}</StatusPill>;
}

// Rolled-up status for a node group (dossier): the non-zero buckets as count PILLS in the
// node card's exact StatusPill chrome (`21 ready` / `2 syncing` — user, 2026-07-12: pills
// read cleaner than the old bullet+text items and align the two cards' status language).
// The amber "progress" AND red "down" buckets are spelled out by their exact lifecycle
// state(s) — the same wording the single node's own card shows (`StatusMark`; the dossier
// said "down" while the node card said "leaving", user 2026-07-12) — instead of collapsing
// to the bucket word; colour still comes from the bucket (BUCKET_COLOR).
const BUCKET_WORD: Record<StatusBucket, string> = {
  ready: "ready",
  progress: "in progress",
  down: "down",
  unknown: "unknown",
};
export function StatusBreakdown({ states }: { states: (string | null | undefined)[] }) {
  const b = statusBreakdown(states);
  const order: StatusBucket[] = ["ready", "progress", "down", "unknown"];
  const items = order
    .filter((k) => b[k] > 0)
    .flatMap((k) =>
      k === "progress" || k === "down"
        ? labelBreakdown(states, k).map((it) => ({ ...it, color: BUCKET_COLOR[k] }))
        : [{ label: BUCKET_WORD[k], count: b[k], color: BUCKET_COLOR[k] }],
    );
  return (
    <span className="inline-flex items-center flex-wrap justify-end gap-1">
      {items.map((it) => (
        <StatusPill key={it.label} color={it.color}>
          {it.count} {it.label}
        </StatusPill>
      ))}
    </span>
  );
}

// Squared layer-code pills — the ONE rendering for layer codes wherever they appear (the
// node card's subtitle, the dossier's composition rows). User, 2026-07-12: the joined
// "L0·cL1" text read as one mushy token; separate squared pills scan as discrete units.
// Taxonomy chrome, not identity — muted text on the faint wash, never hued.
export function RoleChips({ codes }: { codes: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {codes.map((c) => (
        <span
          key={c}
          className="inline-flex items-center rounded-xs border border-border bg-wash-faint px-[5px] py-[2px] text-micro leading-none text-muted-foreground"
        >
          {c}
        </span>
      ))}
    </span>
  );
}

// One composition row per make-up: role (bright) + code pills + a capped chip stack
// (visual scale only, ≤10, no +N) + the authoritative count. (A per-row status line lived
// here briefly — reverted: it read too busy; the dossier shows ONE aggregate StatusBreakdown
// in its STATUS segment instead.)
export function CompositionRows({ nodes }: { nodes: NodeInfo[] }) {
  const rows = compositionRows(nodes);
  // ONE grid for the whole table (not per-row grids): the label column sizes to the WIDEST
  // label, so the code-pill column starts at one consistent x on every row (user, 2026-07-12
  // — per-row grids let each label push its own pills around).
  return (
    <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-2 gap-y-[7px] mt-2">
      {rows.map((r, i) => (
        <Fragment key={i}>
          <span className="text-body text-foreground">{r.label}</span>
          <RoleChips codes={r.codes} />
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
                  background: "color-mix(in oklch, var(--filter-accent, var(--foreground-dim)) 60%, transparent)",
                  boxShadow: "0 0 0 1.5px var(--panel)",
                }}
              />
            ))}
          </span>
          <span className="text-body text-foreground tabular-nums min-w-[1.5em] text-right">{r.count}</span>
        </Fragment>
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
  parts: string[]; // e.g. ["3 hybrid", "19 dedicated dL1"]
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
    present.filter((r) => dedBy[r]).map((r) => `${dedBy[r]} dedicated ${ROLE_SHORT[r]}`),
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
  if (text.length <= 180) return <p className="text-body text-foreground-dim mb-0">{text}</p>;
  return (
    <>
      <p className={cn("text-body text-foreground-dim mb-0", open ? "line-clamp-none" : "line-clamp-3")}>
        {text}
      </p>
      <Button
        type="button"
        variant="link"
        size="xs"
        className="inline-block h-auto mt-0.5 mb-0 p-0 text-label font-semibold"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Show less" : "Show more"}
      </Button>
    </>
  );
}
