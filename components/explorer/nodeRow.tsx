"use client";

import type { CSSProperties } from "react";

import type { ExplorerRowSpec } from "@/components/explorer/Explorer";
import { RoleChips } from "@/components/inspector/parts";
import { layerCodesOf } from "@/src/data/composition";
import { coLocatedNetworks, metagraphById } from "@/src/data/network";
import { identityHudCss } from "@/src/palette/identity";
import { nodeStatus } from "@/src/data/nodeStatus";
import type { MetaInfo, NodeRow } from "@/src/data/types";
import { midHash } from "@/src/util/format";
import { cn } from "@/lib/utils";
import { IDENT_INK } from "@/components/identInk";

// THE ONE NODE ROW (design session 2026-09-26, `node-rows.html` D): a node level is the last step
// in every explorer — under a composition in Hypergraph, under a provider · city cohort in
// Geography, under a snapshot in Snapshots (its signers) — and the three used to differ in id
// length, in what the tag said and in whether there was a glyph. Every one of them now builds its
// rows here, so they agree by construction (user: "ensure they are consistent").
//
//   glyph   · the network's TICKER in its hue, LEFT-aligned in a widened first column (user,
//             2026-09-29: "remove the colored bullet … color-code the network ticker"; then "left
//             align the ticker … maybe even 1st column"). Every node level sets `glyphW:
//             NODE_GLYPH_W`, so the ids start on one edge whatever the ticker's length.
//   name    · the node id, mono, ONE length everywhere
//             On EVERY node row (user, 2026-09-29: it showed only where a level mixed networks),
//             and a CO-LOCATED node shows every network at its IP ("UP should show both DAG and
//             UP") — `coLocatedNetworks`, the one home the node card's Co-located row reads.
//   tag     · the node's LAYER chips (the same `RoleChips` the composition rows wear), then its
//             STATE as a small dot in the state's bucket colour
//
// The state dot is colour, and identity is never colour alone (the design system's rule), so the
// state's word rides the dot as its accessible name and the row's title spells everything out:
// the id in its short form, the network, the layers, the state.

/** The state as a dot in its bucket colour — and in its SHAPE: ready is a filled disc, any other
 *  state a hollow ring, so the mark is never colour alone (review, 2026-09-26). The word is the
 *  dot's accessible name and its hover. */
export function StateDot({ state }: { state?: string | null }) {
  const s = nodeStatus(state);
  const ready = s.bucket === "ready";
  return (
    <span
      role="img"
      aria-label={s.label}
      className={cn("inline-block size-1.5 flex-none rounded-full", !ready && "border-[1.5px]")}
      style={
        {
          background: ready ? s.color : "transparent",
          borderColor: ready ? undefined : s.color,
          boxShadow: `0 0 0 2px color-mix(in oklch, ${s.color} 24%, transparent)`,
        } as CSSProperties
      }
    />
  );
}

/** The node level's glyph column — room for two short tickers ("DAG UP") or one long one
 *  ("USDC.dag") at the tag size; anything longer truncates. */
export const NODE_GLYPH_W = 56;

/** A network's ticker — the DAG core's is "DAG". Shared with the raw node roster. */
export const tickerOf = (id: string): string => metagraphById(id)?.ticker ?? (id === "dag" ? "DAG" : id);

/** One length for every node id, in every explorer. */
// Twelve (was 14 until the ticker moved into its own first column, 2026-09-29): beside that column
// and the widest tag (three chips and the dot) the id still shows whole — cut once, never twice.
export const NODE_ID_GLYPHS = 12;
/** The id's SHORT form, for a cell too narrow for the twelve — a row with three layer pills in a
 *  rail at its narrowest. */
const NODE_ID_GLYPHS_SHORT = 8;

/** THE ID IS CUT ONCE, WHATEVER ITS CELL (2026-10-03). `midHash` cuts the id in the middle; a cell
 *  narrower than that form then cut it AGAIN at the end ("c54ccbe……"), which lost the tail the
 *  first cut exists to keep. The cell is a size container and prints the form that fits it: the
 *  twelve-glyph id from 12.5ch up, the eight-glyph one below. `ch` in a container query is the
 *  CONTAINER's own (the mono face at the row's size), so the threshold follows the fluid type.
 *  Safe as a container because the name cell is a `minmax(0,1fr)` track — it never needed its
 *  content's intrinsic width (the trap `bandParts` records). */
function NodeId({ id }: { id: string }) {
  return (
    <span className="@container block w-full">
      <span className="hidden @[12.5ch]:inline">{midHash(id, NODE_ID_GLYPHS)}</span>
      <span className="@[12.5ch]:hidden">{midHash(id, NODE_ID_GLYPHS_SHORT)}</span>
    </span>
  );
}

export function nodeRowSpec(args: {
  key: string;
  row: NodeRow;
  /** The row's network hue. The ticker is derived from the row itself, so no caller can leave it out. */
  hue: string;
  /** The full catalog (store `metaList`, the DAG core prepended) — co-location is read against
   *  ALL of it, never a filtered list, so a committed filter cannot hide a co-tenant. */
  metaList: readonly MetaInfo[];
  on: boolean;
  onClick: () => void;
  pair: ExplorerRowSpec["pair"];
}): ExplorerRowSpec {
  const { row, hue } = args;
  const netId = row.pick.kind === "metanode" && row.pick.meta ? row.pick.meta.id : "dag";
  const ticker = tickerOf(netId);
  const ip = "node" in row.pick ? (row.pick as { node?: { ip?: string | null } }).node?.ip : null;
  const also = coLocatedNetworks(ip, netId, args.metaList);
  const id = row.id ?? row.label;
  const codes = layerCodesOf([row]);
  return {
    key: args.key,
    glyph: (
      <span className="min-w-0 truncate text-label font-medium">
        <span className={IDENT_INK} style={{ color: hue }}>{ticker}</span>
        {also.map((m) => (
          <span key={m.id} className={IDENT_INK} style={{ color: identityHudCss(m.id) }}> {tickerOf(m.id)}</span>
        ))}
      </span>
    ),
    name: <NodeId id={id} />,
    nameMono: true,
    tag: (
      <>
        {codes.length > 0 && <RoleChips codes={codes} tight />}
        {/* The dot stands CLEAR of the last pill (user, 2026-10-03: "almost no padding between
            the pills and the status bullet") — its 2px halo ate half of the cell's 4px gap. */}
        <span className={cn("inline-flex", codes.length > 0 && "ml-1")}><StateDot state={row.state} /></span>
      </>
    ),
    on: args.on,
    // Every node row's subject boxes the Node card (Explorer's committed-row re-box).
    rung: "node",
    hue,
    // The hover names the row's facts in words; the id stays in its SHORT form (a full 128-glyph
    // id was "a very long text" — user, 2026-09-26). The whole id is the Node card's, one click on.
    onClick: args.onClick,
    pair: args.pair,
  };
}

/** A signer that resolves to no node: the same row, faint, with the honest word for its tag and
 *  no affordance — there is no node to commit. */
export function unknownNodeRowSpec(args: { key: string; id: string; label: string; hue: string }): ExplorerRowSpec {
  return {
    key: args.key,
    name: midHash(args.id, NODE_ID_GLYPHS),
    nameMono: true,
    tag: <span className="italic">{args.label}</span>,
    faint: true,
  };
}
