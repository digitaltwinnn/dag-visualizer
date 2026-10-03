"use client";

import { cohortLabel } from "@/components/railSiblings";
import { useMemo } from "react";

import Explorer, { type ExplorerLevelSpec } from "@/components/explorer/Explorer";
import { NODE_GLYPH_W, nodeRowSpec } from "@/components/explorer/nodeRow";
import { subjectPairing } from "@/components/useSubjectPairing";
import {
  COHORT_MEASURE_OPTIONS,
  GEO_MEASURE_OPTIONS,
  cohortMeasure,
  COHORT_MEASURES,
  countryMeasure,
  type GeoMeasure,
} from "@/src/data/geoMeasure";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { filterAccent, metagraphById } from "@/src/data/network";
import type { NodeRow } from "@/src/data/types";
import type { CohortSel } from "@/src/engine/domain/focusLadder";
import { cohortToggleActions, countryToggleActions, nodeSelectActions, sameCohort } from "@/src/engine/domain/pickActions";
import { identityHudCss } from "@/src/palette/identity";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { NO_SIGNAL_COPY, useNoSignal } from "@/components/useNoSignal";
import { ccMark } from "@/src/util/format";
import { levelMeasure } from "@/src/data/explorerMeasure";

// THE GEOGRAPHY'S EXPLORER — a DESCRIPTION for the one `Explorer` component (design session
// 2026-09-26; read `docs/superpowers/design/2026-09-26-explorer-card/README.md` first). This file
// decides only what a view may: which levels are open, what each row is and commits, what each level
// measures, and the words. The layout is the component's.
//
// THE LEVELS follow the ladder: countries → a country's city × provider COHORTS → a cohort's nodes.
// Which level is on screen is READ FROM THE STORE — the drilled country and the committed cohort —
// so a click on the land in the scene, a row here and a card on the right rail all land the same
// level (rule 2, through `applyClickActions`). A crumb click releases every rung finer than it.
//
// A node in Geography NEVER commits its network (2026-09-26, `f1fadc1`): a geo node is a place
// first. The rows' figures follow the committed filter's lens — under a network the list is that
// network's nodes, and the bars wear the filter's accent since a place has no hue of its own.
//
// Rule 9: every row previews on its subject's own channel (`hoverCountry` for a country, `hoverGroup`
// + `hoverCohort` for a cohort, `hoverNodeId` for a node), and none commits.

export default function GeoExplore({ defaultCollapsed }: { defaultCollapsed?: boolean } = {}) {
  const dead = useNoSignal();
  const lb = useStore((s) => s.leaderboard);
  const country = useStore((s) => s.country);
  const cohort = useStore((s) => s.cohort);
  const selNodes = useStore((s) => s.selNodes);
  const inspect = useStore((s) => s.inspect);
  const filter = useStore((s) => s.filter);
  const geoMeasure = useStore((s) => s.geoMeasure);
  const metaList = useStore((s) => s.metaList); // co-location reads the full catalog (nodeRowSpec)
  const setGeoMeasure = useStore((s) => s.setGeoMeasure);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const setHoverCountry = useStore((s) => s.setHoverCountry);
  const setHoverCohort = useStore((s) => s.setHoverCohort);
  const hoverCountry = useStore((s) => s.hoverCountry);
  const hoverGroup = useStore((s) => s.hoverGroup);
  const setHoverGroup = useStore((s) => s.setHoverGroup);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  // The cohort level's own measure — a level remembers its pick; this one is the card's, not the
  // app's, so it lives here rather than in the store.
  // One pick for both levels (user, 2026-09-29 — `src/data/explorerMeasure.ts`): the cohort level
  // shows `geoMeasure` where it can state it (Providers it cannot — a cohort IS one provider).
  const cohortPick = levelMeasure(COHORT_MEASURES, geoMeasure);

  // The selected node, matched by IP AND layer: one machine can sit in both the l0 and l1
  // clusters (same IP, two rows), so IP alone highlighted both.
  const sel = inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
  const selIp = sel?.node?.ip ?? null;
  const selLayer = sel ? (sel.kind === "metanode" ? sel.node?.layer ?? null : sel.kind) : null;
  const nodeOn = (r: NodeRow) => selIp != null && r.layer === selLayer && "node" in r.pick && r.pick.node?.ip === selIp;

  // The writes — the same tested tables the scene clicks run, through the one executor.
  const drill = (cc: string) => applyClickActions(countryToggleActions(cc, { country, hasInspect: !!sel, cohort }));
  const commitCohort = (target: CohortSel) => applyClickActions(cohortToggleActions(target, { cohort, hasInspect: !!sel }));
  const selectNode = (pick: NodeRow["pick"], selected: boolean) =>
    applyClickActions(nodeSelectActions(pick, { mode: "geo", currentFilter: filter, deselect: selected }));

  const list = lb?.countries ?? [];
  const isMetaFilter = filter !== "all" && filter !== "dag";
  const quietEmpty = isMetaFilter && list.length === 0;
  const accent = filterAccent(filter);
  const activeCfg = metagraphById(filter);
  const tickerOrName = activeCfg ? activeCfg.ticker || activeCfg.name : "This metagraph";

  // The selection's nodes grouped by country NAME — the join key both the leaderboard and the node
  // list derive from `geo.country` (`cc` can be absent, the name can't); sorted alphabetically by
  // the displayed primary with the id as the tiebreak, so co-located nodes keep one order.
  const nodesByCountry = useMemo(() => {
    const m = new Map<string, NodeRow[]>();
    for (const r of selNodes) {
      const key = r.country || "Unknown";
      (m.get(key) ?? m.set(key, []).get(key)!).push(r);
    }
    for (const rows of m.values())
      rows.sort(
        (a, b) =>
          (a.city || a.label).localeCompare(b.city || b.label, undefined, { sensitivity: "base" }) ||
          (a.id || "").localeCompare(b.id || ""),
      );
    return m;
  }, [selNodes]);

  // ---- level 0: the countries, measured by the heading's pick ----------------------------------
  const measured = useMemo(() => {
    const valued = list.map((c) => ({ c, v: countryMeasure(geoMeasure, c.count, nodesByCountry.get(c.country) ?? []) }));
    // Sorted by the measure, node count as the tiebreak: the order is what the eye reads off a
    // ranked list. A selection never re-orders it.
    valued.sort((a, b) => b.v - a.v || b.c.count - a.c.count);
    return valued;
  }, [list, geoMeasure, nodesByCountry]);
  const maxV = Math.max(1, measured[0]?.v ?? 0);

  // ---- the drilled country and its cohorts --------------------------------------------------
  const drilled = country ? list.find((c) => c.cc === country) ?? null : null;
  const drilledRows = drilled ? nodesByCountry.get(drilled.country) ?? [] : [];
  // COHORT ROWS: a country's nodes collapse into one row per city × provider, biggest first.
  type Cohort = { key: string; city: string | null; isp: string | null; rows: NodeRow[] };
  const cohorts = useMemo((): Cohort[] => {
    const by = new Map<string, Cohort>();
    for (const r of drilledRows) {
      const geo = "geo" in r.pick ? r.pick.geo : undefined;
      const city = r.city || null;
      const isp = geo?.isp || null;
      const key = `${city ?? ""}|${isp ?? ""}`;
      (by.get(key) ?? by.set(key, { key, city, isp, rows: [] }).get(key)!).rows.push(r);
    }
    return [...by.values()].sort((a, b) => b.rows.length - a.rows.length || (a.city ?? "￿").localeCompare(b.city ?? "￿"));
  }, [drilledRows]);
  const openCohort = drilled && cohort && cohort.cc === drilled.cc ? cohorts.find((ch) => sameCohort(cohort, { cc: drilled.cc, city: ch.city, isp: ch.isp })) ?? null : null;

  const levels: ExplorerLevelSpec[] = [
    {
      key: "countries",
      crumb: { label: "Countries", onRelease: () => (country ? drill(country) : undefined) },
      measure: { options: GEO_MEASURE_OPTIONS, value: geoMeasure, onPick: (id) => setGeoMeasure(id as GeoMeasure) },
      hasFigure: true,
      // No tags at this level, so the name takes the tag home's room.
      nameW: 128,
      // Quiet-empty (a real metagraph with no locatable nodes): one honest message, no rows.
      // A network that has never answered: the list is empty because nothing was READ, which is a
      // different fact from "no nodes" — and it used to be an empty card body with no words at
      // all (test pass, 2026-10-03).
      empty: dead ? (
        NO_SIGNAL_COPY
      ) : quietEmpty ? (
        <>
          <span className="block text-body text-foreground">No locatable nodes</span>
          {tickerOrName} has no nodes we can place on the map right now. It still appears in the Hypergraph.
        </>
      ) : undefined,
      rows: measured.map(({ c, v }) => ({
        key: c.cc,
        glyph: <span className="font-mono text-label text-muted-foreground">{ccMark(c.cc)}</span>,
        name: c.country,
        share: v / maxV,
        hue: accent,
        figure: v.toLocaleString(),
        on: c.cc === country,
        title: `${c.country} · ${c.count} node${c.count === 1 ? "" : "s"}`,
        onClick: () => drill(c.cc),
        // The country's border on the globe previews while the row is hovered, and the scene's
        // own country hover washes this row — one channel, the filter's accent.
        pair: subjectPairing(hoverCountry, c.cc, setHoverCountry, accent),
      })),
    },
  ];

  if (drilled) {
    const maxRows = Math.max(1, ...cohorts.map((ch) => cohortMeasure(cohortPick, ch.rows)));
    levels.push({
      key: "cohorts",
      crumb: {
        // The name alone (user, 2026-09-26: the crumb "does not need both DE and Germany").
        label: drilled.country,
        onRelease: () => (openCohort ? commitCohort({ cc: drilled.cc, city: openCohort.city, isp: openCohort.isp }) : undefined),
      },
      meaning: "Where the nodes sit, and who hosts them",
      measure: { options: COHORT_MEASURE_OPTIONS, value: cohortPick, onPick: (id) => setGeoMeasure(id as GeoMeasure) },
      hasFigure: true,
      nameW: 76,
      empty: "No locatable nodes here yet.",
      rows: cohorts.map((ch) => {
        const v = cohortMeasure(cohortPick, ch.rows);
        const on = sameCohort(cohort, { cc: drilled.cc, city: ch.city, isp: ch.isp });
        const key = `${drilled.cc}|${ch.city}|${ch.isp}`;
        const pair = subjectPairing(hoverGroup, key, setHoverGroup, accent);
        return {
          key: ch.key,
          // PROVIDER FIRST (user, 2026-09-29): the rung, its card and its eyebrow are all
          // "Provider", so the row names the provider and the city tells two of one provider
          // apart within the country. Same order in the crumb, the rail's pager and the card.
          name: ch.isp ?? "Unknown provider",
          tag: ch.city ?? "Unlocated",
          share: v / maxRows,
          hue: accent,
          figure: v.toLocaleString(),
          on,
          title: `${cohortLabel(ch)} · ${ch.rows.length} node${ch.rows.length === 1 ? "" : "s"}`,
          // A cohort of ONE is its node: the click selects the node outright (full ancestry
          // commits the cohort with it), so the reader never opens a list of one.
          onClick: () => {
            if (ch.rows.length === 1) {
              const r = ch.rows[0]!;
              selectNode(r.pick, nodeOn(r) && on);
            } else {
              commitCohort({ cc: drilled.cc, city: ch.city, isp: ch.isp });
            }
          },
          pair: {
            ...pair,
            onMouseEnter: () => {
              pair.onMouseEnter();
              setHoverCohort(ch.rows.map((r) => hoverKeyOf(r.pick)).filter((k): k is string => !!k));
              setHoverCountry(drilled.cc);
            },
            onMouseLeave: () => {
              pair.onMouseLeave();
              setHoverCohort(null);
              setHoverCountry(null);
            },
          },
        };
      }),
    });
  }

  if (drilled && openCohort) {
    levels.push({
      key: "nodes",
      crumb: {
        label: cohortLabel(openCohort),
        title: cohortLabel(openCohort),
      },
      meaning: "Each node at this provider",
      glyphW: NODE_GLYPH_W,
      measure: null,
      hasFigure: false,
      // The one node row (`explorer/nodeRow.tsx`), ticker included, as in every explorer.
      rows: openCohort.rows.map((r, i) => {
        const on = nodeOn(r);
        const netId = r.pick.kind === "metanode" && r.pick.meta ? r.pick.meta.id : "dag";
        const hue = identityHudCss(netId);
        return nodeRowSpec({
          metaList,
          key: (r.id ?? r.label) + i,
          row: r,
          hue,
          on,
          onClick: () => selectNode(r.pick, on),
          pair: subjectPairing(hoverNodeId, hoverKeyOf(r.pick), setHoverNodeId, hue),
        });
      }),
    });
  }

  return (
    <Explorer
      id="geoexplore"
      title="Countries"
      hint={quietEmpty ? null : "Every country hosting nodes. Open one to explore where its nodes sit."}
      levels={levels}
      defaultCollapsed={defaultCollapsed}
      onLeave={() => {
        setHoverNodeId(null);
        setHoverCountry(null);
        setHoverGroup(null);
        setHoverCohort(null);
      }}
    />
  );
}
