"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import ExplorerShell from "@/components/ExplorerShell";
import { SelectedRowMark, selectedRow } from "@/components/selection";
import { subjectPairing } from "@/components/useSubjectPairing";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { getNetwork, filterAccent, metagraphById } from "@/src/data/network";
import { latestRelevant } from "@/src/data/follow";
import { identityHudHex } from "@/src/palette/identity";
import { IdentityDot } from "@/components/inspector/parts";
import { useStore } from "@/src/store/store";
import { bandSelectActions, metaSnapSelectActions, snapshotSelectActions, sameMetaSnap, followToggleActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { DisclosureChevron, DisclosureRow, ROW_NEST, ROW_OUTSET } from "@/components/ExploreRows";
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers";
import { NoSignalDot } from "@/components/state/StateAtoms";
import { buildAnchorLog, type AnchorLogRow } from "@/src/data/anchorLog";
import { SLOT_N } from "@/src/engine/domain/ledgerModel";
import { fmtKB } from "@/src/util/format";

// The Snapshots view's left-rail tool — SNAPSHOTS-FIRST navigation (user, 2026-08-06, replacing
// the layer/rail navigation: floors and node containers are pure visual aid now). The explorer's
// two top-level groups are the two snapshot ARTIFACTS themselves, mirroring the chamber's floors:
//
//   [2] Metagraph snapshots → metagraphs → that metagraph's snapshot ids
//       (a snapshot id row IS the clickable tile — the same metaSnapSelectActions)
//   [1] Global snapshots → All networks + metagraphs → global snapshot ordinals
//       (an ordinal row pins that global — the same snapshotSelectActions the strip runs)
//
// Everything selectable routes through the tested pickActions builders + the ONE executor, so an
// explorer row and a 3D click can never drift. The browse window is the chamber's own visible
// trail (SLOT_N ticks — the same buffer LiveStrip plots), so "what the list shows" is exactly
// "what the 3D scene shows".

const FLOOR_COPY = Object.fromEntries(LEDGER_LAYERS.map((l) => [l.id, l]));

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

/** A leaf row: one snapshot id (a metagraph snapshot, or a global ordinal). */
function SnapRow({
  label,
  metric,
  selected,
  hoverOrd,
  pairOrd,
  setHoverOrd,
  accent,
  title,
  onClick,
}: {
  label: string;
  metric: string;
  selected: boolean;
  hoverOrd: number | null;
  pairOrd: number;
  setHoverOrd: (ord: number | null) => void;
  accent: string;
  title: string;
  onClick: () => void;
}) {
  const pair = subjectPairing(hoverOrd, pairOrd, setHoverOrd, accent);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={pair.onMouseEnter}
      onMouseLeave={pair.onMouseLeave}
      className={cn(
        "nb-row flex items-center gap-2 w-full py-1 pl-2 pr-2 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left transition-colors duration-[140ms]",
        "hover:bg-wash-hover",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
        selected && selectedRow(true),
        pair.paired && pair.className,
      )}
      style={pair.style}
    >
      <span className="flex-1 min-w-0 text-body tabular-nums text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
      </span>
      <span className="flex-none tabular-nums text-label font-semibold text-muted-foreground">{metric}</span>
      {/* The trailing slot is ALWAYS reserved (the GeoExplore idiom) so the metric column never
          shifts when a row gains the selection mark (user, 2026-08-07). */}
      <span className="flex-none w-3.5 flex items-center justify-center">
        {selected && <SelectedRowMark />}
      </span>
    </button>
  );
}

export default function LedgerPanel() {
  const filter = useStore((s) => s.filter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const hoverSnapOrd = useStore((s) => s.hoverSnapOrd);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const snap = useStore((s) => s.snap);
  const following = useStore((s) => s.following);
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const live = useStore((s) => s.live);
  const metaSnap = useStore((s) => s.metaSnap);
  const snapshotExact = useStore((s) => s.snapshotExact);
  // The visible window: the same live buffer LiveStrip reads, capped to the chamber's own
  // visible-slot count so "visible ticks" matches the 3D trail.
  const { snaps } = useSnapshotFeed(SLOT_N);
  const net = getNetwork();
  const visibleTs = new Set(snaps.map((s) => s.timestamp));
  // Every anchored metagraph snapshot in the window, newest first (rebuilt per event-driven
  // render, same as the raw layer's AnchorLogTable — the buffers mutate in place).
  const rows = net ? buildAnchorLog(net.metaSnaps, net.globalSnapshots, "all").filter((r) => visibleTs.has(r.ts)) : [];
  const groups = groupByMeta(rows);
  const orderedSnaps = [...snaps].reverse(); // newest first, the log convention
  const activeSnapOrd = snap?.data.ordinal ?? null;

  // Disclosure state: one open group per level, plain local UI state — nothing here commits a
  // selection (the layer rung is retired), so there is no store channel to derive from.
  // Both groups start CLOSED (user, 2026-08-07) — the LIVE control + the chamber itself are
  // the view's opening statement; the lists are there when you reach for them.
  const [openFloor, setOpenFloor] = useState<string | null>(null);
  const [openMeta, setOpenMeta] = useState<string | null>(null); // `${floorId}|${metaId or "all"}`

  const accent = filterAccent(filter);

  const floorHeader = (id: "msnap" | "gl0") => {
    const copy = FLOOR_COPY[id];
    const open = openFloor === id;
    return (
      <button
        type="button"
        onClick={() => setOpenFloor(open ? null : id)}
        aria-expanded={open}
        className={cn(
          "nb-row group relative text-left border border-transparent cursor-pointer rounded-sm py-1.5 bg-transparent transition-[background] duration-150",
          ROW_OUTSET,
          "hover:bg-wash-hover",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          {/* (The stack-level [n] badge is retired, user 2026-08-07 — the name alone carries the
              group; the 3D labels dropped their digit box the same day.) */}
          <span className="flex-1 min-w-0 truncate text-body text-foreground">{copy.name}</span>
          {/* No count here (user, 2026-08-07): the old figure was only the DOWNLOADED window —
              a buffer size, not a network fact — so the name stands alone; the per-metagraph
              rows inside keep their in-window counts, scoped where they're honest. */}
          <DisclosureChevron open={open} />
        </span>
      </button>
    );
  };

  // A METAGRAPH browse row (both floors' middle level): disclosure + hoverFilter preview. It
  // deliberately commits nothing — the leaf snapshot rows below carry the real (tested) selects.
  const metaRow = (floorId: string, id: string, name: string, hue: string, count: number, holdsSel: boolean) => {
    const key = `${floorId}|${id}`;
    const isOpen = openMeta === key;
    return (
      <DisclosureRow
        key={key}
        open={isOpen}
        holdsSel={holdsSel}
        title={`${name} · ${count} snapshot${count === 1 ? "" : "s"}`}
        onToggle={() => setOpenMeta(isOpen ? null : key)}
        onHoverEnter={() => setHoverFilter(id)}
        onHoverLeave={() => setHoverFilter(null)}
      >
        <IdentityDot hue={hue} />
        {/* No visible count (user, 2026-08-07 — window-scoped figures read as network facts);
            the count stays in the tooltip, scoped by its own wording. */}
        <span className="flex-1 min-w-0 text-body text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          {name}
        </span>
      </DisclosureRow>
    );
  };

  const empty = <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">Waiting for snapshots…</p>;

  return (
    <ExplorerShell
      id="ledger-view"
      title="Snapshots"
      hint="The two snapshot artifacts the chamber draws — browse a network's own snapshots, or the global snapshots they anchor into."
      onLeave={() => {
        // Container-level hover backstop (the LaneRow lesson, 2026-08-02): leaving the whole card
        // body clears every hover channel its rows write, regardless of which row set it or
        // whether that row is still mounted to clear it itself.
        setHoverFilter(null);
        setHoverSnapOrd(null);
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
          const sub =
            previewOrd != null
              ? previewOrd.toLocaleString()
              : following
                ? "following new snapshots"
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
            >
              {beating ? (
                <span className="flex-none w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_30%,transparent)] animate-dot-beat motion-reduce:animate-none" />
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

        {/* ── [2] Metagraph snapshots → metagraphs → snapshot ids ── */}
        {floorHeader("msnap")}
        {openFloor === "msnap" && (
          <div className={cn("mb-1.5 ml-[9px] py-0.5 pl-3", ROW_NEST)} onMouseLeave={() => setHoverSnapOrd(null)}>
            {groups.length === 0
              ? empty
              : groups.map((g) => {
                  const holdsSel = metaSnap?.metaId === g.id;
                  return (
                    <div key={g.id}>
                      {metaRow("msnap", g.id, g.name, g.hue, g.rows.length, holdsSel)}
                      {openMeta === `msnap|${g.id}` && (
                        <div className="mb-1 ml-[7px] pl-2 border-l border-border">
                          {g.rows.map((r) => {
                            const sel = { metaId: r.metaId, ordinal: r.ordinal, hash: r.hash, globalOrdinal: r.global.ordinal, ts: r.ts };
                            const isSel = sameMetaSnap(metaSnap, sel);
                            return (
                              <SnapRow
                                key={r.ordinal}
                                label={r.ordinal.toLocaleString()}
                                metric={fmtKB(r.sizeInKB)}
                                selected={isSel}
                                hoverOrd={hoverSnapOrd}
                                pairOrd={r.global.ordinal}
                                setHoverOrd={setHoverSnapOrd}
                                accent={g.hue}
                                title={`${g.name} snapshot #${r.ordinal} · anchored into global #${r.global.ordinal}`}
                                onClick={() =>
                                  applyClickActions(
                                    metaSnapSelectActions(
                                      sel,
                                      { kind: "snapshot", title: `Global snapshot #${r.global.ordinal}`, data: r.global },
                                      { filter, metaSnap },
                                    ),
                                  )
                                }
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
          </div>
        )}

        {/* ── [1] Global snapshots → tick rows → the metagraphs that anchored into each ──
            (user, 2026-08-07: the snapshot leads, the networks are its children — the mirror of
            the msnap group, where the network leads and its snapshots are the children). */}
        {floorHeader("gl0")}
        {openFloor === "gl0" && (
          <div className={cn("mb-1.5 ml-[9px] py-0.5 pl-3", ROW_NEST)} onMouseLeave={() => setHoverSnapOrd(null)}>
            {orderedSnaps.length === 0
              ? empty
              : orderedSnaps.map((d) => {
                  const tickRows = rows.filter((r) => r.global.ordinal === d.ordinal);
                  const tickGroups = groupByMeta(tickRows);
                  const isOpen = openMeta === `gl0|${d.ordinal}`;
                  const globalPick = {
                    kind: "snapshot",
                    title: `Global snapshot #${d.ordinal}`,
                    data: d,
                  } as const;
                  return (
                    <div key={d.ordinal}>
                      {/* The tick row SELECTS (pin / live re-follow — the same tested table the
                          strip's bars run) AND discloses its contributors in the same click,
                          the commit-is-disclosure idiom. */}
                      <SnapRow
                        label={d.ordinal.toLocaleString()}
                        // The one honest per-tick byte figure: the exact read's measured KB;
                        // absent = a dash, never derived from count or fee (the honesty rule).
                        metric={
                          snapshotExact[d.ordinal]?.totalSizeKB != null
                            ? fmtKB(snapshotExact[d.ordinal]!.totalSizeKB)
                            : "—"
                        }
                        selected={d.ordinal === activeSnapOrd}
                        hoverOrd={hoverSnapOrd}
                        pairOrd={d.ordinal}
                        setHoverOrd={setHoverSnapOrd}
                        accent={accent}
                        title={`Global snapshot #${d.ordinal} · ${d.metagraphSnapshotCount ?? 0} anchored`}
                        onClick={() => {
                          applyClickActions(
                            snapshotSelectActions(globalPick, latestRelevant("all")?.ordinal === d.ordinal, {
                              pinnedOrdinal: !following && snap ? snap.data.ordinal : null,
                              metaSnap,
                            }),
                          );
                          setOpenMeta(isOpen ? null : `gl0|${d.ordinal}`);
                        }}
                      />
                      {isOpen && (
                        <div className="mb-1 ml-[7px] pl-2 border-l border-border">
                          {tickGroups.length === 0 ? (
                            // The polled buffer identified none of this tick's anchors (yet, or
                            // it batched only unlisted channels) — say so, never fabricate rows.
                            <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">
                              No identified metagraph snapshots in this tick.
                            </p>
                          ) : (
                            tickGroups.map((g) => {
                              const pair = `${g.id}`;
                              return (
                                <button
                                  key={pair}
                                  type="button"
                                  title={`${g.name} · ${g.rows.length} snapshot${g.rows.length === 1 ? "" : "s"} anchored into #${d.ordinal}`}
                                  onClick={() =>
                                    // A metagraph under a tick is the BAND: the (metagraph, tick)
                                    // pair — same tested semantics as clicking its band in the bar.
                                    applyClickActions(bandSelectActions(g.id, globalPick, { filter, metaSnap }))
                                  }
                                  onMouseEnter={() => setHoverFilter(g.id)}
                                  onMouseLeave={() => setHoverFilter(null)}
                                  className={cn(
                                    "nb-row flex items-center gap-2 w-full py-1 pl-2 pr-2 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left transition-colors duration-[140ms]",
                                    "hover:bg-wash-hover",
                                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                                  )}
                                >
                                  <IdentityDot hue={g.hue} />
                                  <span className="flex-1 min-w-0 text-body text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                                    {g.name}
                                  </span>
                                  <span className="flex-none tabular-nums text-label font-semibold text-muted-foreground">
                                    {g.rows.length}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
          </div>
        )}
      </div>
    </ExplorerShell>
  );
}
