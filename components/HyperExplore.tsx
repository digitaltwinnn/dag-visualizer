"use client";

import { useMemo } from "react";

import Explorer, { type ExplorerLevelSpec } from "@/components/explorer/Explorer";
import { NODE_GLYPH_W, nodeRowSpec } from "@/components/explorer/nodeRow";
import { IdentityDot, RoleChips } from "@/components/inspector/parts";
import { subjectPairing } from "@/components/useSubjectPairing";
import { compositionClause, compositionGroups } from "@/src/data/composition";
import { networkOfRow } from "@/src/data/geoMeasure";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { HYPER_MEASURE_OPTIONS, groupMeasure, networkMeasure, type HyperMeasure } from "@/src/data/hyperMeasure";
import { metagraphById } from "@/src/data/network";
import type { NodeRow } from "@/src/data/types";
import { compositionToggleActions, filterToggleActions, nodeSelectActions } from "@/src/engine/domain/pickActions";
import { identityHudCss } from "@/src/palette/identity";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { useNoSignal } from "@/components/useNoSignal";

// THE HYPERGRAPH'S EXPLORER — a DESCRIPTION for the one `Explorer` component (design session
// 2026-09-26; read `docs/superpowers/design/2026-09-26-explorer-card/README.md` first). This file
// decides only what a view may: which levels are open, what each row is and commits, what each level
// measures, and the words. The layout is the component's.
//
// THE LEVELS follow the ladder (`domain/focusLadder`): networks → a network's compositions → a
// composition's nodes. Which level is on screen is READ FROM THE STORE — the committed filter and
// composition — never from local open/closed state, so a click on the hub in the scene, a row here
// and a card on the right rail all land the same level (rule 2's one write path, through
// `applyClickActions`). A crumb click RELEASES every rung finer than it, through the same table.
//
// Rule 9 is intact: every row previews on the channel its subject already pairs on (`hoverFilter`
// for a network, `hoverGroup` + `hoverCohort` for a composition, `hoverNodeId` for a node), and
// none of them commits.

export default function HyperExplore({ defaultCollapsed }: { defaultCollapsed?: boolean } = {}) {
  const dead = useNoSignal();
  const metaList = useStore((s) => s.metaList);
  const filter = useStore((s) => s.filter);
  const selNodes = useStore((s) => s.selNodes);
  const allNodes = useStore((s) => s.allNodes);
  const hyperMeasure = useStore((s) => s.hyperMeasure);
  const setHyperMeasure = useStore((s) => s.setHyperMeasure);
  const inspect = useStore((s) => s.inspect);
  const composition = useStore((s) => s.composition);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const setHoverCohort = useStore((s) => s.setHoverCohort);
  const hoverGroup = useStore((s) => s.hoverGroup);
  const setHoverGroup = useStore((s) => s.setHoverGroup);

  // The three writes, all through the decision table and the one executor (rule 2).
  const toggleNetwork = (id: string) => applyClickActions(filterToggleActions(id, filter));
  const toggleComposition = (compKey: string) =>
    applyClickActions(compositionToggleActions({ netId: filter, key: compKey }, { composition, hasInspect: !!inspect, filter }));
  const selectNode = (pick: NodeRow["pick"], selected: boolean, compKey: string) =>
    applyClickActions(
      nodeSelectActions(pick, {
        mode: "hyper",
        currentFilter: filter,
        deselect: selected,
        // FULL-ANCESTRY: a node select commits its parent group too, so a deselect steps back
        // onto the composition rung.
        compositionSel: { netId: filter, key: compKey },
      }),
    );

  const sel = inspect && "node" in inspect ? inspect.node : null;
  const selIp = sel?.ip ?? null;

  // ---- level 0: the networks, measured by the heading's pick ----------------------------------
  const measured = useMemo(() => {
    const byNet = new Map<string, NodeRow[]>();
    for (const r of allNodes) {
      const n = networkOfRow(r);
      if (n) (byNet.get(n) ?? byNet.set(n, []).get(n)!).push(r);
    }
    return metaList
      .map((m) => ({ m, v: networkMeasure(hyperMeasure, m, byNet.get(m.id) ?? []) }))
      // Sorted by the measure, fleet size as the tiebreak: the order is what the eye reads off a
      // ranked list. A selection never re-orders it (design: "selection stays in place").
      .sort((a, b) => b.v - a.v || b.m.nodes.length - a.m.nodes.length);
  }, [metaList, allNodes, hyperMeasure]);
  const maxV = Math.max(1, measured[0]?.v ?? 0);

  const netCfg = filter !== "all" ? metagraphById(filter) : null;
  const netName = netCfg?.name ?? (filter === "dag" ? "DAG" : filter);
  const netHue = filter !== "all" ? identityHudCss(filter) : null;
  const groups = useMemo(() => (filter !== "all" ? compositionGroups(selNodes) : []), [filter, selNodes]);
  const openGroup = composition && composition.netId === filter ? groups.find((g) => g.key === composition.key) ?? null : null;

  const levels: ExplorerLevelSpec[] = [
    {
      key: "networks",
      crumb: { label: "Networks", onRelease: () => toggleNetwork(filter) },
      measure: { options: HYPER_MEASURE_OPTIONS, value: hyperMeasure, onPick: (id) => setHyperMeasure(id as HyperMeasure) },
      hasFigure: true,
      // No tags at this level, so the name takes the tag home's room (the longest catalog name
      // fits without an ellipsis).
      nameW: 128,
      rows: measured.map(({ m, v }) => {
        const cfg = metagraphById(m.id);
        const name = cfg?.name ?? m.id;
        const hue = identityHudCss(m.id);
        return {
          key: m.id,
          glyph: <IdentityDot hue={hue} />,
          name,
          share: v / maxV,
          hue,
          // A network that has never answered has no count to state — a dash, not a 0 (rule 10;
          // `useNoSignal`). The row still lists: the catalog is ours and the network exists.
          figure: dead ? "—" : v.toLocaleString(),
          faint: dead || m.nodes.length === 0,
          title: `${name} · ${m.nodes.length} node${m.nodes.length === 1 ? "" : "s"}`,
          onClick: () => toggleNetwork(m.id),
          pair: subjectPairing(hoverFilter, m.id, setHoverFilter, hue),
        };
      }),
    },
  ];

  if (filter !== "all") {
    // The network level's pick CARRIES DOWN (user, 2026-09-26): a composition row shows the same
    // measure over its own rows, so "Countries" stays "Countries" when you step in.
    const groupValues = groups.map((g) => groupMeasure(hyperMeasure, g.rows));
    const maxRows = Math.max(1, ...groupValues);
    levels.push({
      key: "compositions",
      crumb: {
        label: (
          <>
            <IdentityDot hue={netHue!} />
            {netName}
          </>
        ),
        onRelease: () => (openGroup ? toggleComposition(openGroup.key) : undefined),
      },
      meaning: "Which layers each node runs",
      measure: { options: HYPER_MEASURE_OPTIONS, value: hyperMeasure, onPick: (id) => setHyperMeasure(id as HyperMeasure) },
      hasFigure: true,
      nameW: 52,
      // Honest instrument state — mirrors the 3D: a metagraph with no reported nodes renders a
      // hub and nothing else.
      empty: "No nodes reported.",
      rows: groups.map((g, i) => {
        const key = `${filter}|${g.key}`;
        const pair = subjectPairing(hoverGroup, key, setHoverGroup, netHue!);
        const v = groupValues[i]!;
        return {
          key: g.key,
          name: g.label,
          tag: <RoleChips codes={g.codes} tight />,
          share: v / maxRows,
          hue: netHue,
          figure: v.toLocaleString(),
          title: `${g.label} · ${g.rows.length} node${g.rows.length === 1 ? "" : "s"}`,
          onClick: () => toggleComposition(g.key),
          pair: {
            ...pair,
            // The group's members glow in the scene while its row is hovered (rule 9).
            onMouseEnter: () => {
              pair.onMouseEnter();
              setHoverCohort(g.rows.map((r) => hoverKeyOf(r.pick)).filter((k): k is string => !!k));
            },
            onMouseLeave: () => {
              pair.onMouseLeave();
              setHoverCohort(null);
            },
          },
        };
      }),
    });
  }

  if (openGroup) {
    const clause = compositionClause(openGroup.codes);
    levels.push({
      key: "nodes",
      crumb: { label: openGroup.label },
      meaning: clause ? `Nodes that ${clause}` : "Each node running this composition",
      glyphW: NODE_GLYPH_W,
      measure: null,
      hasFigure: false,
      // The one node row (`explorer/nodeRow.tsx`), led by its network's ticker.
      rows: openGroup.rows.map((r, i) => {
        const on = selIp != null && "node" in r.pick && r.pick.node?.ip === selIp;
        const hue = identityHudCss(r.pick.kind === "metanode" && r.pick.meta ? r.pick.meta.id : "dag");
        return nodeRowSpec({
          metaList,
          key: (r.id ?? r.label) + i,
          row: r,
          hue,
          on,
          onClick: () => selectNode(r.pick, on, openGroup.key),
          pair: subjectPairing(hoverNodeId, hoverKeyOf(r.pick), setHoverNodeId, hue),
        });
      }),
    });
  }

  return (
    <Explorer
      id="hyperexplore"
      title="Networks"
      hint="Every network on the hypergraph. Open one for the roles its nodes play."
      levels={levels}
      defaultCollapsed={defaultCollapsed}
      onLeave={() => {
        setHoverFilter(null);
        setHoverNodeId(null);
        setHoverCohort(null);
        setHoverGroup(null);
      }}
    />
  );
}
