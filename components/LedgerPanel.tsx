"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import ExplorerShell from "@/components/ExplorerShell";
import { SelectedRowMark, selectedRow, selectionHue } from "@/components/selection";
import { subjectPairing } from "@/components/useSubjectPairing";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { getNetwork, getAnchor, filterAccent, metagraphById, shortHash, resolveSigner, SIGNER_GROUPS, SIGNER_UNKNOWN } from "@/src/data/network";
import { ledgerLens, storyCount, tickInStory } from "@/src/data/ledgerStory";
import { displayNetwork, unlistedLog, UNLISTED_ID, UNLISTED_HUE, LISTED_IDS } from "@/src/data/unlisted";
import type { GlobalSnapshot, NodeRow, SnapshotExact } from "@/src/data/types";
import { metaSnapHoverKey } from "@/src/data/types";
import { latestRelevant } from "@/src/data/follow";
import { identityHudHex } from "@/src/palette/identity";
import { IdentityDot } from "@/components/inspector/parts";
import { useStore } from "@/src/store/store";
import { metaSnapSelectActions, snapshotSelectActions, sameMetaSnap, followToggleActions, nodeSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { DepthCaption, DisclosureChevron, DisclosureRow, NodePickerRow, ROW_NEST, ROW_OUTSET } from "@/components/ExploreRows";
import { NoSignalDot } from "@/components/state/StateAtoms";
import { buildAnchorLog, type AnchorLogRow } from "@/src/data/anchorLog";
import { SLOT_N } from "@/src/engine/domain/ledgerModel";
import { fmtKB } from "@/src/util/format";

// The Snapshots view's left-rail tool — ONE AXIS: TIME (user, 2026-08-09). A single uniform tree
// whose DEPTH means exactly one thing everywhere, and where every depth commits its own subject:
//
//   global tick      → pins that tick (snapshotSelectActions) and discloses its contributors
//     metagraph      → commits the BAND, the (metagraph, tick) pair, and discloses its snapshots
//       snapshot id  → commits the metagraph snapshot itself (metaSnapSelectActions)
//
// It reads the same direction as everything else speaking about these subjects: the chamber's
// geometry (a global byte bar ← its bands ← the lane tiles that fed it), the facts rail's chain
// (global snapshot ABOVE the metagraph snapshot it anchors) and the strip (one bar per tick).
//
// The PER-NETWORK axis used to be a SECOND top-level group ("Metagraph snapshots" → metagraph →
// its ordinals across the whole window). It went (user, 2026-08-09 — "the two dropdown sections
// have a different dropdown structure, it feels very unintuitive"): the two trees were transposes
// of each other, so rows meant different things at the same depth, the committing depth flipped
// between them, and both bottomed out on the same (metagraph, tick) pair from opposite ends. The
// network axis is the COMMITTED FILTER instead — one home per concern: a filter narrows this list
// to that network's own story and marks every row in its hue, which is the gesture the view is
// already built around (live metagraph mode). A metagraph's ordinals only mean anything relative
// to the tick they anchored into, which the retired tree hid in a tooltip; here that tick is the
// row above them. Don't grow the second axis back as a tree.
//
// Everything selectable routes through the tested pickActions builders + the ONE executor, so an
// explorer row and a 3D click can never drift. The browse window is the chamber's own visible
// trail (SLOT_N ticks — the same buffer LiveStrip plots), so "what the list shows" is exactly
// "what the 3D scene shows".

/** A COMMITTED FILTER IS A LENS, and inside a tick the lens decides what is drillable: with a
 *  network committed, every OTHER network's group is preview-only (user, 2026-08-10). The tick still
 *  lists them — rule 10 doesn't let a lens edit the facts, and they really did anchor here — but a
 *  row under a tick must never reach past the filter and change it, which is the same boundary the
 *  card's pager keeps by staying inside this metagraph × this tick. Unfiltered, nothing is out.
 *  Takes the id rather than the group so the unlisted row shares it: one rule, no special case. */
function outOfLens(filter: string, id: string): boolean {
  // Through the ledger's own lens (ledgerStory.ledgerLens): committed DAG reads as the whole
  // chamber, so nothing is out — every tick belongs to the base ledger (user, 2026-08-13).
  const f = ledgerLens(filter);
  return f !== "all" && f !== id;
}

/** One metagraph's anchored snapshots inside a window (the whole trail, or one tick). */
interface MetaGroup {
  id: string;
  name: string;
  hue: string;
  rows: AnchorLogRow[];
}

function groupByMeta(rows: AnchorLogRow[]): MetaGroup[] {
  const by = new Map<string, MetaGroup>();
  for (const r of rows) {
    let g = by.get(r.metaId);
    if (!g) {
      const cfg = metagraphById(r.metaId);
      g = { id: r.metaId, name: cfg?.name ?? r.metaId, hue: identityHudHex(r.metaId), rows: [] };
      by.set(r.metaId, g);
    }
    g.rows.push(r);
  }
  return [...by.values()].sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
}

/** A leaf row: one snapshot id (a metagraph snapshot, or a global ordinal).
 *
 *  Generic over its PAIRING KEY, because the two depths pair on different subjects: a tick row
 *  pairs on the global ordinal (`hoverSnapOrd`, a number), a metagraph-snapshot row on
 *  `metaSnapHoverKey` (a string). Keying the leaves to their tick lit every sibling that anchored
 *  into it (user, 2026-08-09) — the key type is what keeps the two channels from being confused. */
function SnapRow<K extends string | number>({
  label,
  metric,
  selected,
  hoverOrd,
  pairOrd,
  setHoverOrd,
  accent,
  title,
  onClick,
  sub,
  mark,
  outset,
  disclose,
}: {
  label: string;
  metric: string;
  selected: boolean;
  hoverOrd: K | null;
  pairOrd: K;
  setHoverOrd: (v: K | null) => void;
  accent: string;
  title: string;
  onClick: () => void;
  /** Trailing muted mono marker (the cohort id-row idiom): real per-row info — the unlisted
   *  rows carry their channel's short ADDRESS here, because the group interleaves several
   *  channels' independent ordinal sequences and the bare numbers read as out-of-order
   *  (user, 2026-08-08). */
  sub?: string;
  /** The committed network's anchor count in this tick, in its hue — absent = the network is
   *  not in this tick's story (and clicking would release the filter; user, 2026-08-07). */
  mark?: { hue: string; count: number } | null;
  /** TOP-LEVEL row (the tick rows, since the axis collapse made them the card's own first level):
   *  takes the right-edge contract's outset instead of a plain `w-full` — ExploreRows' ROW_OUTSET
   *  and ROW_NEST are the only two places allowed to own it. */
  outset?: boolean;
  /** Disclosure affordance: this row also opens a child list, so it ends with the chevron (or the
   *  ✓ when it holds a selection while closed) instead of a bare reserved slot. */
  disclose?: { open: boolean; holdsSel?: boolean };
}) {
  const pair = subjectPairing(hoverOrd, pairOrd, setHoverOrd, accent);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-expanded={disclose ? disclose.open : undefined}
      onMouseEnter={pair.onMouseEnter}
      onMouseMove={pair.onMouseMove}
      onMouseLeave={pair.onMouseLeave}
      onFocus={pair.onFocus}
      onBlur={pair.onBlur}
      className={cn(
        "nb-row group flex items-center gap-2 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left transition-colors duration-[140ms] py-1",
        outset ? ROW_OUTSET : "w-full pl-2 pr-2",
        "hover:bg-wash-hover",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
        // A row that HOLDS the selection (a group header over the selected snapshot) wears the
        // wash at ANCESTOR strength — the finest rung is the child below it (user, 2026-08-16:
        // the header set the hue vars but no wash class, so it stayed uncolored). Its own
        // selection keeps the full mark.
        (selected || disclose?.holdsSel) && selectedRow(!!selected),
        pair.paired && pair.className,
      )}
      // The selection follows the subject's identity (selection.tsx · selectionHue): `accent` is
      // already the row's own hue — the group's for a leaf, the unlisted gray, the filter accent
      // for a tick row — so the committed wash/ring and the ✓ speak in it too.
      style={{ ...((selected || disclose?.holdsSel) ? selectionHue(accent) : undefined), ...pair.style }}
    >
      {/* With a `sub`, the LABEL is the row's identity and must never ellipsize — the flexible
          column is the address instead (it's already an abbreviation, so a further clip still
          reads as one). Without a sub the label takes the flex, as every other row does. */}
      <span
        className={cn(
          "text-body tabular-nums text-foreground whitespace-nowrap overflow-hidden text-ellipsis",
          sub ? "flex-none" : "flex-1 min-w-0",
        )}
      >
        {label}
      </span>
      {sub && (
        <span className="flex-1 min-w-0 text-right font-mono text-micro text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          {sub}
        </span>
      )}
      {mark && (
        <span className="flex-none tabular-nums text-label font-semibold" style={{ color: mark.hue }}>
          {mark.count}
        </span>
      )}
      <span className="flex-none tabular-nums text-label font-semibold text-muted-foreground">{metric}</span>
      {/* The trailing slot is ALWAYS reserved (the GeoExplore idiom) so the metric column never
          shifts when a row gains the selection mark (user, 2026-08-07). A disclosing row spends
          that same slot on its chevron — one column, one width, every depth. */}
      <span className="flex-none w-3.5 flex items-center justify-center">
        {disclose ? (
          // A row that both SELECTS and DISCLOSES spends the one slot by state — the rule the
          // `holdsSel` arm already followed, now applied to the row's own selection too (2026-08-09,
          // when the snapshot leaves gained a signer disclosure): OPEN, the children below state
          // the selection, so the slot shows the chevron that closes them; CLOSED, the ✓ is the
          // only trace the selection has left. Without this a leaf that commits AND opens in one
          // click showed a ✓ and no way to see it was open.
          (selected || disclose.holdsSel) && !disclose.open ? <SelectedRowMark hue={accent} /> : <DisclosureChevron open={disclose.open} />
        ) : selected ? (
          <SelectedRowMark hue={accent} />
        ) : null}
      </span>
    </button>
  );
}

const NO_SIGNERS: readonly string[] = [];

/** The signer ids of ONE metagraph snapshot, from the tick's EXACT read — the same source the
 *  metagraph-snapshot card's own signer list falls back to (`ChannelSnapRow.signers`), so the two
 *  can't disagree. No new fetch, and never the ~2.5 MB deep read: the explorer must not turn an
 *  explicit-gesture route into a browse. A tick older than the L0 node's retention has no exact
 *  read at all and yields nothing — the row then simply doesn't disclose (see the leaf), because an
 *  empty dropdown claims a fact we don't have.
 *
 *  The ordinal-0 fallback is the same one the card uses: a payload the quick decoder couldn't read
 *  carries ordinal 0, and the address match still finds its proofs. */
function signersOf(ex: SnapshotExact | undefined, metaId: string, ordinal: number): readonly string[] {
  if (!ex) return NO_SIGNERS;
  const r =
    ex.rows.find((x) => x.metaId === metaId && x.ordinal === ordinal) ??
    ex.rows.find((x) => x.metaId === metaId && x.ordinal === 0);
  return r?.signers ?? NO_SIGNERS;
}

/** The signing validators of ONE metagraph snapshot — the tree's finest depth (user, 2026-08-09:
 *  "use the 'signed by' information to also add a dropdown row under the metagraph snapshots to
 *  show these nodes"). It is the same machines the metagraph-snapshot CARD lists, reached by
 *  browsing instead of by selecting, so the pair of routes agrees by construction: both resolve a
 *  truncated signer id through `matchSignerRow` (the one home for that prefix match) and both pair
 *  on `hoverNodeId`.
 *
 *  A resolved signer renders as the SHARED `NodePickerRow` every explorer uses for a node, so the
 *  machine that sealed this snapshot looks and behaves exactly like the same machine in geo or
 *  hyper: it glows its chip in the tray on hover, commits the node card on a click (through the
 *  tested table + the one executor), and re-clicking deselects.
 *
 *  An UNRESOLVED signer degrades through the one shared rule (`resolveSigner` + `SIGNER_UNKNOWN` in
 *  src/data/network.ts, which the snapshot card's own signer rows read too): it stays a SIGNATURE
 *  that states what isn't known and offers no affordance, because there is no node to commit — no
 *  IP, no geolocation, no roles, no status, so a card would be a card of ghosts. Every unlisted
 *  channel's signers take that branch by construction; a listed network's can too. */
function SignerList({
  ids,
  metaId,
  selNodes,
  filter,
  selIp,
  selLayer,
  hoverNodeId,
  setHoverNodeId,
}: {
  ids: readonly string[];
  metaId: string;
  selNodes: NodeRow[];
  filter: string;
  selIp: string | null;
  selLayer: string | null;
  hoverNodeId: string | null;
  setHoverNodeId: (id: string | null) => void;
}) {
  return (
    <div className="mb-1 ml-[7px] pl-2 border-l border-border">
      {/* WHICH cluster this list is — the cards' own phrase ("Signed by N L0 validators"), whose
          words come from the one home SIGNER_GROUPS (user, 2026-08-16 — redesigned from the
          `label · count · layer` interpunct line into the DepthCaption register). The explorer is
          where the constant count is most puzzling (DOR discloses 3 rows under a 20-machine
          network), so the depth names the producing layer before the rows. Only the snapshot PROOF
          is reachable here: `signersOf` reads the tick's exact read, and the data-block signers
          exist only in the ~2.5 MB deep read, which browsing must never trigger. */}
      <DepthCaption title={SIGNER_GROUPS.proof.title}>
        <span>Signed by</span>
        <span className="tabular-nums font-semibold text-foreground-dim">{ids.length}</span>
        <span>{SIGNER_GROUPS.proof.who}</span>
      </DepthCaption>
      {ids.map((sid) => {
        const r = resolveSigner(selNodes, metaId, sid);
        if (!r.known) {
          const w = SIGNER_UNKNOWN[r.reason];
          return (
            // Not a button: there is no node to commit, so there is no affordance either. Same
            // columns as the picker row above it, so the list still reads as one column of
            // signatures — the left cell just states what the right-hand id belongs to.
            <div
              key={sid}
              title={w.title}
              className="flex items-baseline gap-2 w-full py-1 pl-2 pr-7 my-px text-label text-muted-foreground"
            >
              <span className="flex-none italic">{w.label}</span>
              <span className="min-w-0 flex-1 text-right font-mono tabular-nums overflow-hidden text-ellipsis whitespace-nowrap">
                {sid}
              </span>
            </div>
          );
        }
        const row = r.row;
        // One machine can hold rows in two layers (a hybrid), so the selection matches on IP AND
        // layer — geo's rule, because the mark must land on the row that was actually picked.
        const on = selIp != null && row.layer === selLayer && "node" in row.pick && row.pick.node?.ip === selIp;
        return (
          <NodePickerRow
            key={sid}
            row={row}
            selected={on}
            hoverNodeId={hoverNodeId}
            setHoverNodeId={setHoverNodeId}
            onSelect={() =>
              applyClickActions(nodeSelectActions(row.pick, { mode: "ledger", currentFilter: filter, deselect: on }))
            }
          />
        );
      })}
    </div>
  );
}

export default function LedgerPanel() {
  const filter = useStore((s) => s.filter);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const hoverSnapOrd = useStore((s) => s.hoverSnapOrd);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  // ONE snapshot's own hover channel — the leaves pair on this, the tick rows on hoverSnapOrd.
  const hoverMetaSnap = useStore((s) => s.hoverMetaSnap);
  const setHoverMetaSnap = useStore((s) => s.setHoverMetaSnap);
  const snap = useStore((s) => s.snap);
  const following = useStore((s) => s.following);
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const live = useStore((s) => s.live);
  const metaSnap = useStore((s) => s.metaSnap);
  const snapshotExact = useStore((s) => s.snapshotExact);
  // The signer depth resolves truncated ids against the view's published node list and pairs on
  // the node channel — the same three reads geo's node rows make, for the same shared row.
  const selNodes = useStore((s) => s.selNodes);
  const inspect = useStore((s) => s.inspect);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const selNode = inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
  const selIp = selNode?.node?.ip ?? null;
  const selLayer = selNode ? (selNode.kind === "metanode" ? selNode.node?.layer ?? null : selNode.kind) : null;
  // The visible window: the same live buffer LiveStrip reads, capped to the chamber's own
  // visible-slot count so "visible ticks" matches the 3D trail.
  const { snaps } = useSnapshotFeed(SLOT_N);
  const net = getNetwork();
  const visibleTs = new Set(snaps.map((s) => s.timestamp));
  // Every anchored metagraph snapshot in the window, newest first (rebuilt per event-driven
  // render, same as the raw layer's AnchorLogTable — the buffers mutate in place).
  const rows = net ? buildAnchorLog(net.metaSnaps, net.globalSnapshots, "all").filter((r) => visibleTs.has(r.ts)) : [];
  // The UNLISTED channels (user, 2026-08-07 — navigable like any network): the one-home row
  // source (src/data/unlisted.ts — the exact reads, the only honest source), windowed here.
  const unlistedEntries = unlistedLog([...snaps].reverse(), snapshotExact);
  // Under a NETWORK filter the global list shows ONLY that network's story — the ticks it
  // anchored into, the LiveStrip's filtered idiom (user, 2026-08-07: one mental model, no
  // two-outcome clicks in the explorer; the scene keeps all ticks and the filter-releases rule
  // as its safety net). "all"/"dag" list every tick — through the ledger's lens, because
  // `displayNetwork("dag")` RESOLVES (metagraphById answers for the core through the identity
  // map, the same trap ledgerStory's own guard notes), which made a committed DAG narrow the
  // list to a story that can never have members (found live 2026-08-13: "Waiting for
  // snapshots…" with a full buffer behind it).
  const filterNet = displayNetwork(ledgerLens(filter));
  // The ONE story rule (src/data/ledgerStory.ts) — the same membership the strip/scene read.
  const tickFilterCount = (d: GlobalSnapshot): number =>
    storyCount(filter, getAnchor(d.timestamp), snapshotExact[d.ordinal]) ?? 0;
  const orderedSnaps = [...snaps]
    .reverse() // newest first, the log convention
    .filter((d) => !filterNet || tickFilterCount(d) > 0);
  const activeSnapOrd = snap?.data.ordinal ?? null;

  // Disclosure state: single-open at each of the two disclosing depths, plain local UI state.
  // The tick rows are the card's own first level now, so there is no group to open first (user,
  // 2026-08-09) — the list IS the card body, and the LIVE control above it stays the view's
  // opening statement.
  const [openTick, setOpenTick] = useState<number | null>(null);
  const [openContrib, setOpenContrib] = useState<string | null>(null); // `${tickOrdinal}|${metaId}`
  // The third disclosing depth: ONE snapshot's signers. Keyed by the full triple, because a
  // snapshot ordinal alone collides — every undecodable unlisted channel carries ordinal 0.
  const [openSigners, setOpenSigners] = useState<string | null>(null); // `${tick}|${metaId}|${ord}`
  // Deliberately NO auto-open here. The retired per-network tree auto-disclosed the committed
  // filter's row, which was safe because that row was a fixed subject; the equivalent on this
  // axis would be "open the newest tick", and the newest tick CHANGES every few seconds — an
  // auto-open would fight the heartbeat, reopening itself under the pointer. The filter's effect
  // on this list is to narrow it to that network's story, which needs no disclosure.

  const accent = filterAccent(filter);

  const empty = <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">Waiting for snapshots…</p>;

  return (
    <ExplorerShell
      id="ledger-view"
      title="Snapshots"
      // No ordering clause (user, 2026-08-12): the list shows its own order. See the hint-shape
      // note in GeoExplore.tsx, which is the shared rule.
      hint="Recent snapshots. Open one for the networks that anchored into it."
      onLeave={() => {
        // Container-level hover backstop (the LaneRow lesson, 2026-08-02): leaving the whole card
        // body clears every hover channel its rows write, regardless of which row set it or
        // whether that row is still mounted to clear it itself.
        setHoverFilter(null);
        setHoverSnapOrd(null);
        setHoverMetaSnap(null);
      }}
    >
      <div className="flex flex-col gap-0.5">
        {/* ── the LIVE control (user, 2026-08-07): the ONE explicit way to see and toggle the
            follow state. LIVE = the beating cyan dot while the chamber follows the heartbeat;
            PINNED = the pinned ordinal, click to return to live. Hovering ANY snapshot — a row
            here, a strip bar, a scene tile (the shared hoverSnapOrd channel) — PREVIEWS the
            pinned state it would enter (dashed frame, hollow dot). The write goes through the
            tested followToggleActions + the one executor, like every selection. */}
        {(() => {
          if (!live)
            return (
              <span className="flex items-center gap-2 mb-1 py-1.5 px-2 rounded-sm border border-border text-label text-muted-foreground">
                <NoSignalDot /> no signal
              </span>
            );
          const liveOrd = latestSnapshot?.ordinal ?? null;
          const previewOrd = hoverSnapOrd != null && hoverSnapOrd !== liveOrd ? hoverSnapOrd : null;
          // THREE resting states: FOLLOWING (beating dot), PINNED (a clicked snapshot holds the
          // front), and IDLE (entering the view follows nothing — live-follow is opt-in,
          // 2026-08-02). A hover previews the pinned state it would enter, dashed.
          const pinned = !following && snap != null;
          const beating = following && previewOrd == null;
          const label = previewOrd != null ? "Pinned" : following ? "Live" : pinned ? "Pinned" : "Live";
          // Filtered live mode follows the NETWORK's newest anchored row — the ticker alone
          // says it (user, 2026-08-16: "just say 'following DOR'" — the word "anchors" restated
          // what the whole view is about).
          const liveTicker = displayNetwork(filter)?.ticker ?? null;
          const sub =
            previewOrd != null
              ? previewOrd.toLocaleString()
              : following
                ? liveTicker
                  ? `following ${liveTicker}`
                  : "following new snapshots"
                : pinned
                  ? `${snap!.data.ordinal.toLocaleString()} · click for live`
                  : "off · click to follow";
          return (
            <button
              type="button"
              aria-pressed={following}
              title={
                following
                  ? "Following the live snapshot — click to pin the one on screen"
                  : "Follow the live snapshot"
              }
              onClick={() => {
                // From IDLE there is nothing pinned to hand back — follow the latest instead.
                const shown =
                  snap ??
                  (latestSnapshot
                    ? ({ kind: "snapshot", title: `Global snapshot #${latestSnapshot.ordinal}`, data: latestSnapshot } as const)
                    : null);
                if (shown) applyClickActions(followToggleActions(shown, following));
              }}
              className={cn(
                "nb-row group flex items-center gap-2 w-full mb-1 py-1.5 px-2 rounded-sm border text-left cursor-pointer transition-colors duration-150",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                beating && "border-primary/25 bg-wash-faint hover:bg-wash-soft",
                // PINNED is a COMMITTED state, very much active (user, 2026-08-07 — the plain
                // grey read as disabled): it wears the one committed-selection language, the
                // sel wash + ring, like a selected row.
                pinned && previewOrd == null && cn("border-transparent", selectedRow(true)),
                !beating && !(pinned && previewOrd == null) && "border-border hover:bg-wash-hover",
                previewOrd != null && "border-dashed",
              )}
              // The pinned mark speaks the committed network's hue (user, 2026-08-13 — the same
              // rule as every committed row), exactly as its beating-dot sibling already does:
              // the filter-face idiom, structural cyan under "all".
              style={pinned && previewOrd == null ? selectionHue(accent) : undefined}
            >
              {beating ? (
                // The beating dot wears the FOLLOWED subject's identity (user, 2026-08-07 — the
                // filter-face idiom: identity dot beside structural text); cyan on "all".
                <span
                  className="flex-none w-2 h-2 rounded-full animate-dot-beat motion-reduce:animate-none"
                  style={{
                    background: displayNetwork(filter)?.hue ?? accent,
                    boxShadow: `0 0 0 3px color-mix(in oklch, ${displayNetwork(filter)?.hue ?? accent} 30%, transparent)`,
                  }}
                />
              ) : (
                <span className={cn("flex-none w-2 h-2 rounded-full border", pinned && previewOrd == null ? "border-primary/80" : "border-muted-foreground/70")} />
              )}
              <span className={cn("text-micro tracking-caps uppercase", beating ? "text-primary" : pinned && previewOrd == null ? "text-foreground" : "text-muted-foreground")}>
                {label}
              </span>
              <span className={cn("ml-auto min-w-0 truncate tabular-nums text-label", pinned && previewOrd == null ? "text-foreground-dim" : "text-muted-foreground")}>{sub}</span>
            </button>
          );
        })()}

        {/* ── the resting division between the INSTRUMENT and the LIST (user, 2026-08-09: the two
            "sit too close"). The follow control is the view's one instrument — it states and
            toggles a state, it isn't a browse target — and 6px of gap alone read as if it were
            the list's first row. One weight for anything simply THERE (the card-head rule's
            hairline), and inset to the same 16px `--panel-pad-x` that rule uses: the body's own
            padding is 14px, so the 2px side margin is what LINES THE TWO UP. Space is symmetric
            (10px each side, counting the button's mb-1 and the container's gap-0.5). */}
        <div className="border-b border-border mx-[2px] mt-1 mb-2" aria-hidden />

        {/* ── the ONE tree: global tick → the networks that anchored into it → their own
            snapshots. Every depth COMMITS its own subject through the tested builders, and
            disclosure rides the same click (the commit-is-disclosure idiom, hyper's composition
            group one rung up). Coarse→fine, the direction the chamber, the facts rail and the
            strip all read. */}
        <div
          onMouseLeave={() => {
            setHoverSnapOrd(null);
            setHoverMetaSnap(null);
          }}
          onBlur={() => {
            setHoverSnapOrd(null);
            setHoverMetaSnap(null);
          }}
        >
          {orderedSnaps.length === 0
            ? empty
            : orderedSnaps.map((d) => {
                const tickGroups = groupByMeta(rows.filter((r) => r.global.ordinal === d.ordinal));
                // The tick's uncataloged anchors: the exact read's authoritative COUNT, and the
                // per-channel entries that same read yields (identical source, so the entry list
                // can't disagree with the count).
                const tickUnlisted = snapshotExact[d.ordinal]?.unlistedCount ?? 0;
                const tickEntries = unlistedEntries.filter((e) => e.global.ordinal === d.ordinal);
                const isOpen = openTick === d.ordinal;
                const globalPick = {
                  kind: "snapshot",
                  title: `Global snapshot #${d.ordinal}`,
                  data: d,
                } as const;
                // The filter releases if ITS network isn't in this tick's story (ledgerStory).
                const tickHasFilter = tickInStory(filter, getAnchor(d.timestamp), snapshotExact[d.ordinal]);
                return (
                  <div key={d.ordinal}>
                    {/* The tick row SELECTS (pin / live re-follow — the same tested table the
                        strip's bars run) AND discloses its contributors in the same click. */}
                    <SnapRow
                      outset
                      mark={filterNet ? { hue: filterNet.hue, count: tickFilterCount(d) } : null}
                      label={d.ordinal.toLocaleString()}
                      // The one honest per-tick byte figure: the exact read's measured KB;
                      // absent = a dash, never derived from count or fee (the honesty rule).
                      metric={
                        snapshotExact[d.ordinal]?.totalSizeKB != null
                          ? fmtKB(snapshotExact[d.ordinal]!.totalSizeKB)
                          : "—"
                      }
                      selected={d.ordinal === activeSnapOrd}
                      disclose={{ open: isOpen, holdsSel: metaSnap?.globalOrdinal === d.ordinal }}
                      hoverOrd={hoverSnapOrd}
                      pairOrd={d.ordinal}
                      setHoverOrd={setHoverSnapOrd}
                      accent={accent}
                      title={`Global snapshot ${d.ordinal.toLocaleString()} · ${d.metagraphSnapshotCount ?? 0} anchored`}
                      onClick={() => {
                        applyClickActions(
                          snapshotSelectActions(globalPick, latestRelevant("all")?.ordinal === d.ordinal, {
                            pinnedOrdinal: !following && snap ? snap.data.ordinal : null,
                            metaSnap,
                            filter,
                            tickHasFilter,
                          }),
                        );
                        setOpenTick(isOpen ? null : d.ordinal);
                      }}
                    />
                    {isOpen && (
                      <div className={cn("mb-1.5 ml-[9px] py-0.5 pl-3", ROW_NEST)}>
                        {/* Depth caption (user, 2026-08-16): the child grouping's one new concept —
                            these rows are the tick's anchors split BY NETWORK. */}
                        {(tickGroups.length > 0 || tickUnlisted > 0) && (
                          <DepthCaption>Snapshots by network</DepthCaption>
                        )}
                        {tickGroups.length === 0 && tickUnlisted === 0 ? (
                          // The polled buffer identified none of this tick's anchors (yet), and
                          // the exact read counted no uncataloged ones — say so, never fabricate.
                          <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">
                            No identified metagraph snapshots in this tick.
                          </p>
                        ) : (
                          tickGroups.map((g) => {
                            const key = `${d.ordinal}|${g.id}`;
                            const lensedOut = outOfLens(filter, g.id);
                            const gOpen = openContrib === key && !lensedOut;
                            return (
                              <div key={g.id}>
                                <DisclosureRow
                                  open={gOpen}
                                  // The row itself IS a committed subject when its band is the
                                  // live selection: this network's filter on this tick, with no
                                  // finer metagraph snapshot pinned under it.
                                  on={filter === g.id && activeSnapOrd === d.ordinal && metaSnap == null}
                                  holdsSel={metaSnap?.metaId === g.id && metaSnap.globalOrdinal === d.ordinal}
                                  title={`${g.name} · ${g.rows.length} snapshot${g.rows.length === 1 ? "" : "s"} anchored into ${d.ordinal.toLocaleString()}`}
                                  // A NETWORK UNDER A TICK IS A GROUP HEADER, NOT A COMMIT (user,
                                  // 2026-08-10: "a click directly changes the filter which I feel
                                  // will often happen accidentally not purposefully"). It ran
                                  // `bandSelectActions`, so opening a tick's contributors to see
                                  // who anchored — the browse this tree exists for — silently
                                  // re-committed the app-wide filter, dimming every view and
                                  // outliving the visit. The user's own PAGER rule already says
                                  // this one surface over: a step must not move a COARSER rung,
                                  // which is why the card's swipe stays inside this metagraph and
                                  // this tick. A group header is coarser still.
                                  //
                                  // So it opens and it PREVIEWS (`hoverFilter` below still paints
                                  // the chamber, which is the whole answer to "what is this
                                  // network's story here" without committing to it). Committing
                                  // stays with the deliberate clicks: a SNAPSHOT row inside, which
                                  // filter-firsts through `metaSnapSelectActions`, the byte-bar
                                  // band in the scene — where there is no disclosure, so a click
                                  // must mean something — or the top bar's own picker.
                                  onToggle={() => setOpenContrib(gOpen ? null : key)}
                                  // …and under a COMMITTED FILTER the other networks stop being
                                  // browsable at all (user, 2026-08-10: "a click here commits and
                                  // this feels unintended because we lose the metagraph filter").
                                  // The tick still LISTS them, because they really did anchor here
                                  // and rule 10 doesn't let the lens edit the facts — but only the
                                  // committed network is drillable, so nothing under a tick can
                                  // reach past the filter and change it. That is the same boundary
                                  // the scene draws with its coloured dim and the pager draws by
                                  // staying inside this metagraph × this tick. The hover survives
                                  // untouched: `hoverFilter` below still paints that lane in the
                                  // chamber, which is the whole "where is it" answer the user
                                  // called nice, and previewing has never been committing.
                                  previewOnly={lensedOut}
                                  // The row's hover IS the network's filter preview, so it takes
                                  // the identity-hued pairing the hyper explorer's network rows
                                  // wear (user, 2026-08-13): same channel it always wrote
                                  // (`hoverFilter` paints the lane in the chamber), now paired,
                                  // so the row washes in the metagraph's own hue and a scene-side
                                  // hover of that lane lights this row back.
                                  groupKey={g.id}
                                  hoverGroup={hoverFilter}
                                  setHoverGroup={setHoverFilter}
                                  hue={g.hue}
                                >
                                  <IdentityDot hue={g.hue} />
                                  <span className="flex-1 min-w-0 text-body whitespace-nowrap overflow-hidden text-ellipsis">
                                    {g.name}
                                  </span>
                                  <span className="flex-none tabular-nums text-label font-semibold text-muted-foreground">
                                    {g.rows.length}
                                  </span>
                                </DisclosureRow>
                                {gOpen && (
                                  // Level 2+: INDENT ONLY — re-applying ROW_NEST here would
                                  // compound its negative margin to +12px (the right-edge rule).
                                  <div className="mb-1 ml-[7px] pl-2 border-l border-border">
                                    {g.rows.map((r) => {
                                      const sel = {
                                        metaId: r.metaId,
                                        ordinal: r.ordinal,
                                        hash: r.hash,
                                        globalOrdinal: r.global.ordinal,
                                        ts: r.ts,
                                      };
                                      const sKey = `${d.ordinal}|${r.metaId}|${r.ordinal}`;
                                      const signers = signersOf(snapshotExact[d.ordinal], r.metaId, r.ordinal);
                                      const sOpen = openSigners === sKey;
                                      return (
                                        <div key={r.ordinal}>
                                          <SnapRow
                                            label={r.ordinal.toLocaleString()}
                                            metric={fmtKB(r.sizeInKB)}
                                            selected={sameMetaSnap(metaSnap, sel)}
                                            hoverOrd={hoverMetaSnap}
                                            pairOrd={metaSnapHoverKey(r.metaId, r.ordinal)}
                                            setHoverOrd={setHoverMetaSnap}
                                            accent={g.hue}
                                            title={`${g.name} snapshot ${r.ordinal.toLocaleString()} · anchored into global ${r.global.ordinal.toLocaleString()}${signers.length ? ` · signed by ${signers.length} ${SIGNER_GROUPS.proof.who}` : ""}`}
                                            // The AFFORDANCE FOLLOWS THE DATA: no exact read for
                                            // this tick (pruned, or not yet fetched) means no
                                            // signers are knowable, so the row simply doesn't
                                            // disclose. A chevron onto an empty list would claim
                                            // a fact we don't have.
                                            disclose={signers.length > 0 ? { open: sOpen } : undefined}
                                            onClick={() => {
                                              applyClickActions(
                                                metaSnapSelectActions(sel, globalPick, { filter, metaSnap, following }),
                                              );
                                              if (signers.length > 0) setOpenSigners(sOpen ? null : sKey);
                                            }}
                                          />
                                          {sOpen && signers.length > 0 && (
                                            <SignerList
                                              ids={signers}
                                              metaId={r.metaId}
                                              selNodes={selNodes}
                                              filter={filter}
                                              selIp={selIp}
                                              selLayer={selLayer}
                                              hoverNodeId={hoverNodeId}
                                              setHoverNodeId={setHoverNodeId}
                                            />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                        {/* The UNLISTED contributor (one-home design, src/data/unlisted.ts):
                            neutral gray, because no single identity can speak for a mixed set.
                            Same depth, same grammar, same band click as the listed rows. */}
                        {tickUnlisted > 0 && (
                          <div>
                            <DisclosureRow
                              open={openContrib === `${d.ordinal}|${UNLISTED_ID}` && !outOfLens(filter, UNLISTED_ID)}
                              on={filter === UNLISTED_ID && activeSnapOrd === d.ordinal && metaSnap == null}
                              holdsSel={
                                metaSnap != null &&
                                !LISTED_IDS.has(metaSnap.metaId) &&
                                metaSnap.globalOrdinal === d.ordinal
                              }
                              title={`${tickUnlisted} uncataloged snapshot${tickUnlisted === 1 ? "" : "s"} anchored into ${d.ordinal.toLocaleString()}`}
                              onToggle={() => {
                                // Disclose only, like every listed group header above it.
                                const key = `${d.ordinal}|${UNLISTED_ID}`;
                                setOpenContrib(openContrib === key ? null : key);
                              }}
                              // …and out of the lens under any other committed filter, like them
                              // too. `unlisted` is a first-class network here as everywhere: the
                              // one home makes it the common case, never a special case.
                              previewOnly={outOfLens(filter, UNLISTED_ID)}
                              onHoverEnter={() => setHoverFilter(UNLISTED_ID)}
                              onHoverLeave={() => setHoverFilter(null)}
                            >
                              <IdentityDot hue={UNLISTED_HUE} />
                              <span className="flex-1 min-w-0 text-body italic whitespace-nowrap overflow-hidden text-ellipsis">
                                unlisted
                              </span>
                              <span className="flex-none tabular-nums text-label font-semibold text-muted-foreground">
                                {tickUnlisted}
                              </span>
                            </DisclosureRow>
                            {openContrib === `${d.ordinal}|${UNLISTED_ID}` && (
                              <div className="mb-1 ml-[7px] pl-2 border-l border-border">
                                {tickEntries.map((r, i) => {
                                  const sel = {
                                    metaId: r.metaId,
                                    ordinal: r.ordinal,
                                    hash: "",
                                    globalOrdinal: r.global.ordinal,
                                    ts: r.ts,
                                  };
                                  const sKey = `${d.ordinal}|${r.metaId}|${r.ordinal}`;
                                  const signers = signersOf(snapshotExact[d.ordinal], r.metaId, r.ordinal);
                                  const sOpen = openSigners === sKey;
                                  return (
                                    <div key={`${r.metaId}:${i}`}>
                                      <SnapRow
                                        label={r.ordinal > 0 ? r.ordinal.toLocaleString() : `${r.metaId.slice(0, 10)}…`}
                                        // Each unlisted row's ordinal belongs to ITS OWN channel's
                                        // sequence — one tick can carry several chains, so the short
                                        // address says which chain a number counts on (2026-08-08).
                                        sub={r.ordinal > 0 ? shortHash(r.metaId) : undefined}
                                        metric={fmtKB(r.sizeInKB)}
                                        selected={sameMetaSnap(metaSnap, sel)}
                                        hoverOrd={hoverMetaSnap}
                                        pairOrd={metaSnapHoverKey(r.metaId, r.ordinal)}
                                        setHoverOrd={setHoverMetaSnap}
                                        accent={UNLISTED_HUE}
                                        title={`Unlisted channel ${r.metaId} · anchored into global ${r.global.ordinal.toLocaleString()}${signers.length ? ` · signed by ${signers.length} ${SIGNER_GROUPS.proof.who}` : ""}`}
                                        disclose={signers.length > 0 ? { open: sOpen } : undefined}
                                        onClick={() => {
                                          applyClickActions(
                                            metaSnapSelectActions(sel, globalPick, { filter, metaSnap, following }),
                                          );
                                          if (signers.length > 0) setOpenSigners(sOpen ? null : sKey);
                                        }}
                                      />
                                      {sOpen && signers.length > 0 && (
                                        // An unlisted channel's signers resolve to nothing by
                                        // construction — the live node set only knows the catalog —
                                        // so every row here takes `resolveSigner`'s `network` arm.
                                        // Nothing about this list is unlisted-specific: it is the
                                        // same component with the same rule as the listed one above.
                                        <SignerList
                                          ids={signers}
                                          metaId={r.metaId}
                                          selNodes={selNodes}
                                          filter={filter}
                                          selIp={selIp}
                                          selLayer={selLayer}
                                          hoverNodeId={hoverNodeId}
                                          setHoverNodeId={setHoverNodeId}
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
        </div>
      </div>
    </ExplorerShell>
  );
}
