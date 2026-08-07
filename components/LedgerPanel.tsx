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
import { metaSnapSelectActions, snapshotSelectActions, sameMetaSnap } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { DisclosureChevron, DisclosureRow, ROW_NEST, ROW_OUTSET } from "@/components/ExploreRows";
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers";
import { buildAnchorLog, type AnchorLogRow } from "@/src/data/anchorLog";
import { SLOT_N } from "@/src/engine/domain/ledgerModel";
import { fmtKB } from "@/src/util/format";
import type { GlobalSnapshot } from "@/src/data/types";

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

/** One metagraph's anchored snapshots inside the visible window. */
interface MetaGroup {
  id: string;
  name: string;
  hue: string;
  rows: AnchorLogRow[];
  /** Distinct global ordinals this metagraph anchored into (the gl0 browse level). */
  globals: GlobalSnapshot[];
}

function groupByMeta(rows: AnchorLogRow[]): MetaGroup[] {
  const by = new Map<string, MetaGroup>();
  for (const r of rows) {
    let g = by.get(r.metaId);
    if (!g) {
      const cfg = metagraphById(r.metaId);
      g = { id: r.metaId, name: cfg?.name ?? r.metaId, hue: identityHudHex(r.metaId), rows: [], globals: [] };
      by.set(r.metaId, g);
    }
    g.rows.push(r);
    if (!g.globals.some((x) => x.ordinal === r.global.ordinal)) g.globals.push(r.global);
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
      {selected && <SelectedRowMark className="flex-none" />}
    </button>
  );
}

export default function LedgerPanel() {
  const filter = useStore((s) => s.filter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const hoverSnapOrd = useStore((s) => s.hoverSnapOrd);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const snap = useStore((s) => s.snap);
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
  const [openFloor, setOpenFloor] = useState<string | null>("msnap");
  const [openMeta, setOpenMeta] = useState<string | null>(null); // `${floorId}|${metaId or "all"}`

  const accent = filterAccent(filter);

  const floorHeader = (id: "msnap" | "gl0", count: number) => {
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
          {/* The floor's STACK-LEVEL badge — mirrored by the 3D floor labels so row and plane
              pair at a glance (the one piece of layer chrome that survives: it names a place,
              not a selectable subject). */}
          <span
            aria-hidden
            className="flex-none min-w-[18px] h-[18px] px-1 rounded-xs border border-border text-muted-foreground flex items-center justify-center text-micro tabular-nums leading-none"
          >
            {copy.level}
          </span>
          <span className="flex-1 min-w-0 truncate text-body text-foreground">{copy.name}</span>
          <span className="flex-none flex items-center gap-1.5">
            <span className="tabular-nums text-label font-semibold text-muted-foreground">{count}</span>
            <DisclosureChevron open={open} />
          </span>
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
        <span className="flex-1 min-w-0 text-body text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          {name}
        </span>
        <span className="ml-auto flex-none tabular-nums text-body font-semibold">{count}</span>
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
        {/* ── [2] Metagraph snapshots → metagraphs → snapshot ids ── */}
        {floorHeader("msnap", rows.length)}
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
                                label={`#${r.ordinal.toLocaleString()}`}
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

        {/* ── [1] Global snapshots → All networks + metagraphs → global ordinals ── */}
        {floorHeader("gl0", snaps.length)}
        {openFloor === "gl0" && (
          <div className={cn("mb-1.5 ml-[9px] py-0.5 pl-3", ROW_NEST)} onMouseLeave={() => setHoverSnapOrd(null)}>
            {orderedSnaps.length === 0 ? (
              empty
            ) : (
              <>
                {/* The whole heartbeat first: every visible tick, no network lens. */}
                <DisclosureRow
                  open={openMeta === "gl0|all"}
                  holdsSel={false}
                  title={`All networks · ${snaps.length} global snapshot${snaps.length === 1 ? "" : "s"}`}
                  onToggle={() => setOpenMeta(openMeta === "gl0|all" ? null : "gl0|all")}
                >
                  <span className="flex-1 min-w-0 text-body text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                    All networks
                  </span>
                  <span className="ml-auto flex-none tabular-nums text-body font-semibold">{snaps.length}</span>
                </DisclosureRow>
                {openMeta === "gl0|all" && (
                  <div className="mb-1 ml-[7px] pl-2 border-l border-border">
                    {orderedSnaps.map((d) => (
                      <SnapRow
                        key={d.ordinal}
                        label={`#${d.ordinal.toLocaleString()}`}
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
                        onClick={() =>
                          applyClickActions(
                            snapshotSelectActions(
                              { kind: "snapshot", title: `Global snapshot #${d.ordinal}`, data: d },
                              latestRelevant("all")?.ordinal === d.ordinal,
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                )}
                {/* Then the network lens: the globals each metagraph anchored into. */}
                {groups.map((g) => (
                  <div key={g.id}>
                    {metaRow("gl0", g.id, g.name, g.hue, g.globals.length, false)}
                    {openMeta === `gl0|${g.id}` && (
                      <div className="mb-1 ml-[7px] pl-2 border-l border-border">
                        {g.globals.map((d) => (
                          <SnapRow
                            key={d.ordinal}
                            label={`#${d.ordinal.toLocaleString()}`}
                            metric={String(g.rows.filter((r) => r.global.ordinal === d.ordinal).length)}
                            selected={d.ordinal === activeSnapOrd}
                            hoverOrd={hoverSnapOrd}
                            pairOrd={d.ordinal}
                            setHoverOrd={setHoverSnapOrd}
                            accent={g.hue}
                            title={`Global snapshot #${d.ordinal} · ${g.name} anchored ${g.rows.filter((r) => r.global.ordinal === d.ordinal).length} snapshot(s) into it`}
                            onClick={() =>
                              applyClickActions(
                                snapshotSelectActions(
                                  { kind: "snapshot", title: `Global snapshot #${d.ordinal}`, data: d },
                                  latestRelevant("all")?.ordinal === d.ordinal,
                                ),
                              )
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </ExplorerShell>
  );
}
