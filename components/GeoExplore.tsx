"use client";

import { useMemo, useState } from "react";

import Explorer, { type ExplorerLevelSpec } from "@/components/explorer/Explorer";
import { IdentityDot } from "@/components/inspector/parts";
import { subjectPairing } from "@/components/useSubjectPairing";
import {
  COHORT_MEASURE_OPTIONS,
  GEO_MEASURE_OPTIONS,
  cohortMeasure,
  countryMeasure,
  type CohortMeasure,
  type GeoMeasure,
} from "@/src/data/geoMeasure";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { filterAccent, metagraphById } from "@/src/data/network";
import type { NodeRow } from "@/src/data/types";
import type { CohortSel } from "@/src/engine/domain/focusLadder";
import { cohortToggleActions, countryToggleActions, filterToggleActions, nodeSelectActions, sameCohort } from "@/src/engine/domain/pickActions";
import { identityHudCss } from "@/src/palette/identity";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { ccMark, midHash } from "@/src/util/format";

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
  const lb = useStore((s) => s.leaderboard);
  const country = useStore((s) => s.country);
  const cohort = useStore((s) => s.cohort);
  const selNodes = useStore((s) => s.selNodes);
  const inspect = useStore((s) => s.inspect);
  const filter = useStore((s) => s.filter);
  const geoMeasure = useStore((s) => s.geoMeasure);
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
  const [cohortPick, setCohortPick] = useState<CohortMeasure>("nodes");

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
      empty: quietEmpty ? (
        <>
          <span className="block text-body text-foreground">No locatable nodes</span>
          {tickerOrName} has no nodes we can place on the map right now. It still appears in the Hypergraph.
        </>
      ) : undefined,
      rows: measured.map(({ c, v }) => ({
        key: c.cc,
        glyph: <span className="font-mono text-micro text-muted-foreground">{ccMark(c.cc)}</span>,
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
      measure: { options: COHORT_MEASURE_OPTIONS, value: cohortPick, onPick: (id) => setCohortPick(id as CohortMeasure) },
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
          name: ch.city ?? "Unlocated",
          tag: ch.isp ?? undefined,
          share: v / maxRows,
          hue: accent,
          figure: v.toLocaleString(),
          on,
          title: `${ch.city ?? "Unlocated"}${ch.isp ? ` · ${ch.isp}` : ""} · ${ch.rows.length} node${ch.rows.length === 1 ? "" : "s"}`,
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
        label: `${openCohort.city ?? "Unlocated"}${openCohort.isp ? ` · ${openCohort.isp}` : ""}`,
        title: `${openCohort.city ?? "Unlocated"}${openCohort.isp ? ` · ${openCohort.isp}` : ""}`,
      },
      meaning: "Each node in this cohort",
      measure: null,
      hasFigure: false,
      rows: openCohort.rows.map((r, i) => {
        const on = nodeOn(r);
        const id = r.id ?? r.label;
        const netId = r.pick.kind === "metanode" && r.pick.meta ? r.pick.meta.id : "dag";
        const hue = identityHudCss(netId);
        const ticker = metagraphById(netId)?.ticker ?? (netId === "dag" ? "DAG" : netId);
        return {
          key: id + i,
          name: midHash(id, 22),
          nameMono: true,
          // A cohort mixes networks, so the tag names the node's: its dot and ticker, then its state.
          tag: (
            <>
              <IdentityDot hue={hue} />
              {ticker}
              {r.state ? ` · ${r.state.charAt(0).toUpperCase() + r.state.slice(1)}` : ""}
            </>
          ),
          on,
          hue,
          title: `${id} · ${ticker}${r.state ? ` · ${r.state}` : ""}`,
          onClick: () => selectNode(r.pick, on),
          pair: subjectPairing(hoverNodeId, hoverKeyOf(r.pick), setHoverNodeId, hue),
        };
      }),
    });
  }

  return (
    <Explorer
      id="geoexplore"
      title="Country breakdown"
      hint={quietEmpty ? null : "Every country hosting nodes. Open one to explore where its nodes sit."}
      // The scope dot releases the FILTER (the top bar's own toggle rule) — the drill and the cohort
      // are the reader's place and stay.
      scope={filter !== "all" ? { hue: identityHudCss(filter), label: activeCfg?.name ?? (filter === "dag" ? "DAG" : filter), onRelease: () => applyClickActions(filterToggleActions(filter, filter)) } : null}
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
