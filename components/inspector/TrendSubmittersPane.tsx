"use client";

import { useMemo } from "react";
import { SUBMITTERS_ICON } from "@/components/icons";
import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import TrendChart from "@/components/docs/TrendChart";
import { CUT_ROW, Fact, FactGroup, Lead, SectionLabel, TABLE_ROW, TableHead, UnitMarks, figWidth, shareWords } from "@/components/inspector/parts";
import { countWords, measuredFloor, noSubmitterLine, organisationChart, querySpan, submittersCardState, submittersScope } from "@/components/inspector/trendSubmitters";
import { SELECTED_ROW, selectionHue } from "@/components/selection";
import useSubmitters from "@/components/useSubmitters";
import { subjectPairing, useHoverRelease } from "@/components/useSubjectPairing";
import useTrendsSlice from "@/components/useTrendsSlice";
import { cn } from "@/lib/utils";
import { SUBMITTERS } from "@/src/data/submitters";
import { windowSpan } from "@/src/data/trendWindow";
import { displayNetwork } from "@/src/data/unlisted";
import { trendPlaneActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { bucketStamp } from "@/src/util/localTime";
import type { SubmittersWindow } from "@/app/api/submitters/assemble";

// THE DATA SUBMITTERS CARD (History, 2026-11-27) — who sent a network's data blocks over the span on
// screen: Digital Evidence's ORGANISATIONS (named, broken down) or Dor's DEVICES (counted, never named
// or broken down). It reads the RANGE card's span — the brushed range, else the window pill's — and
// the network the deck stands on (`cardNetwork`, the one rule the Range card's lead reads), so it sits
// under the Range in the lane: a reading of the same span, not a subject of its own.
//
// A CARD SLOT, NOT A LADDER RUNG (the Range's and the Moment's precedent): no camera pose, no ×, and
// it always stands in History. Which body it draws is pure (`trendSubmitters.ts`): under All, one row
// per network that names its submitters, each row bringing that network's plane forward through the
// one executor (rule 2, the Moment card's rows' own builder); a network with no submitters table says
// so in one sentence (`noSubmitterLine`, R21) and is never fetched for; DED draws the range's total batches with its
// organisations as bands (ruling R4), Dor its devices per bucket.
//
// ⚠️ RULE 10: a bucket outside the sampler's measured span is null (the route's own rule), so a range
// reaching before measuring began draws a gap and says "Not measured before <date>" under it.

const WHO = "Data submitters card";
const DAY_MS = 86_400_000;
const NETS = Object.keys(SUBMITTERS);
const carriesData = (id: string) => Object.hasOwn(SUBMITTERS, id);
/** The unit word the chart's head carries, at the window's own tier. */
const perStep = (stepMs: number) => (stepMs >= DAY_MS ? " per day" : " per hour");

export default function TrendSubmittersPane({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const range = useStore((s) => s.trendRange);
  const filter = useStore((s) => s.filter);
  const focus = useStore((s) => s.trendFocus);
  const front = useStore((s) => s.trendFront);
  const windowId = useStore((s) => s.trendWindow);

  // THE SPAN ON SCREEN — the Range card's: the brushed range, else the pill's trailing span, else
  // (the All window has no fixed span) the measured axis, from the same slice the Range card reads.
  const trailing = windowSpan(windowId, range, Date.now());
  const slice = useTrendsSlice(trailing ? null : windowId, null, WHO);
  const axis = slice.buckets;
  const span = trailing ?? (axis.length ? { fromMs: axis[0]!, toMs: axis[axis.length - 1]! + slice.stepMs } : null);
  const q = span ? querySpan(span) : null;
  const spanKey = range ? `${range.fromMs}-${range.toMs}` : `window:${windowId}`;
  const pulseKey = useEdgePulse(spanKey);

  const state = submittersCardState(submittersScope(filter, focus, front), carriesData);
  const net = state.mode === "all" ? null : state.net;
  const shown = displayNetwork(net);
  const fetched = state.mode === "organisations" || state.mode === "devices";
  const { data, error } = useSubmitters(fetched && q ? { net: state.net, ...q } : null, WHO);

  return (
    <RailPane entry={collapsed}>
      <CardHead
        eyebrow="Data submitters"
        title={
          <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
            <SUBMITTERS_ICON aria-hidden className="size-4 flex-none" style={{ color: shown?.hue ?? "var(--primary)" }} />
            <span className="truncate">{shown?.name ?? (net ? net : "All networks")}</span>
          </span>
        }
        titleKey={`${net ?? "all"}|${spanKey}`}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div>
          {state.mode === "all" && <NetworkRows q={q} filter={filter} />}
          {state.mode === "none" && <Lead>{noSubmitterLine(shown?.name ?? state.net)}</Lead>}
          {fetched && <WindowBody org={state.mode === "organisations"} data={data} error={error} hue={shown?.hue ?? "var(--primary)"} />}
        </div>
      )}
      <PulseEdge pulseKey={pulseKey} rail="right" off={collapsed} />
    </RailPane>
  );
}

/** One network's organisations or devices over the span. */
function WindowBody({ org, data, error, hue }: { org: boolean; data: SubmittersWindow | null; error: boolean; hue: string }) {
  const chart = useMemo(() => (data && data.kind === "organisation" ? organisationChart(data, hue) : null), [data, hue]);
  // Dor's counts are HyperLogLog estimates (R19): the line and its figure say "about".
  const deviceLines = useMemo(() => (data && data.kind === "device" ? [{ label: "Devices (about)", points: data.distinct, hue }] : null), [data, hue]);
  const floor = data ? measuredFloor(data, (ms) => bucketStamp(ms, data.stepMs)) : null;
  const note = data ? (data.measured ? undefined : "not measured yet") : error ? "read failed" : "acquiring…";
  return (
    <>
      <TrendChart
        name={org ? "Batches" : "Devices (about)"}
        unit={data ? perStep(data.stepMs) : undefined}
        lines={chart?.lines ?? deviceLines ?? []}
        stack={chart?.stack}
        // The share table below is the bands' key (each row its band's hue and name).
        legend={false}
        buckets={data?.buckets ?? []}
        stepMs={data?.stepMs}
        note={note}
        syncId="trend-submitters"
        touchBrush={false}
        lineWidth={1.25}
        plotHeight={96}
        className="mt-1"
      />
      {floor && data?.measured && <p className="mt-1 text-label text-muted-foreground">{floor}</p>}
      {data && chart && chart.shares.length > 0 && (
        <div className="mt-2 mb-2">
          {/* EACH ORGANISATION'S SHARE OF THE RANGE — the chart's own partition, so a row is a band. */}
          <SectionLabel label="Share of batches" total={chart.shares.reduce((n, r) => n + r.updates, 0).toLocaleString()} className="mb-0.5" />
          <div className="flex flex-col text-label" style={figWidth(chart.shares.map((r) => pct(r.share)))}>
            <TableHead name="Name" figure="%" />
            {chart.shares.map((r) => (
              <div key={r.key} className={cn(CUT_ROW, TABLE_ROW)}>
                <span className="min-w-0 inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full flex-none" style={{ background: r.hue }} />
                  <span className="min-w-0 truncate text-foreground-dim">{r.label}</span>
                </span>
                <UnitMarks count={0} color={r.hue} units={false} frac={r.share} />
                <span className="font-mono tabular-nums text-right text-foreground">{pct(r.share)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data && data.rangeDistinct != null && (
        <FactGroup>
          {org ? (
            <Fact label="Organisations">
              <span className="tabular-nums">{`${data.rangeDistinct.toLocaleString()} active of ${data.seenTotal.toLocaleString()} seen`}</span>
            </Fact>
          ) : (
            // One sentence — the devices are counted, never named, so there is nothing to label; an
            // estimate, so it says "about" (R19).
            <p className="text-label text-foreground-dim tabular-nums">{`${countWords(data.rangeDistinct, "device", data.estimate)} checked in`}</p>
          )}
        </FactGroup>
      )}
    </>
  );
}

/** A share as the cards print one ("12%", "under 1%"). */
const pct = (share: number): string => shareWords(share, 1) ?? "—";

/** UNDER ALL: one row per network that names its submitters, its count over the span, the row
 *  bringing its plane forward. Under a filter the stack holds one plane, so a focus could name a
 *  chart that is not there (`noteDayActions`' rule) — the rows are then plain rows. */
function NetworkRows({ q, filter }: { q: { fromMs: number; toMs: number } | null; filter: string }) {
  const focus = useStore((s) => s.trendFocus);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHover = useHoverRelease(hoverFilter, NETS, useStore((s) => s.setHoverFilter));
  return (
    <>
      <div className="flex flex-col">
        {NETS.map((id) => (
          <NetworkRow key={id} id={id} q={q} on={focus === id} interactive={filter === "all"} pair={subjectPairing(hoverFilter, id, setHover, displayNetwork(id)?.hue ?? "var(--primary)")} />
        ))}
      </div>
    </>
  );
}

function NetworkRow({ id, q, on, interactive, pair }: { id: string; q: { fromMs: number; toMs: number } | null; on: boolean; interactive: boolean; pair: ReturnType<typeof subjectPairing> }) {
  const { data, error } = useSubmitters(q ? { net: id, ...q } : null, WHO);
  const net = displayNetwork(id);
  const hue = net?.hue ?? "var(--primary)";
  const count = data?.rangeDistinct;
  const figure =
    count != null
      ? countWords(count, SUBMITTERS[id]!.kind, data!.estimate)
      : data
        ? "not measured"
        : error
          ? "read failed"
          : "…";
  // A count over a window not wholly measured is a floor: the row's second line says how, in the
  // card's own words (`measuredFloor`, R23). A row with no count already reads "not measured".
  const floor = count != null ? measuredFloor(data!, (ms) => bucketStamp(ms, data!.stepMs)) : null;
  const body = (
    <span className="flex flex-col w-full">
      <span className="flex items-baseline justify-between gap-2 w-full">
        <span className="min-w-0 inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full flex-none" style={{ background: hue }} />
          <span className="min-w-0 truncate text-foreground-dim">{net?.name ?? id}</span>
        </span>
        <span className={cn("flex-none tabular-nums", count != null ? "text-foreground" : "text-muted-foreground")}>{figure}</span>
      </span>
      {floor && <span className="text-label text-muted-foreground">{floor}</span>}
    </span>
  );
  if (!interactive) return <div className={cn("text-label", TABLE_ROW)}>{body}</div>;
  return (
    <button
      type="button"
      aria-pressed={on}
      // The plane focus through the ONE executor (rule 2) — the Moment card's rows' own builder.
      onClick={() => applyClickActions(trendPlaneActions(id, useStore.getState().trendFocus))}
      className={cn(
        "nb-row block w-[calc(100%+8px)] -mx-1 px-1 rounded-sm cursor-pointer text-left text-label bg-transparent border-0",
        TABLE_ROW,
        "hover:bg-wash-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
        on && SELECTED_ROW,
        pair.paired && pair.className,
      )}
      style={{ ...(on ? selectionHue(hue) : undefined), ...pair.style }}
      onMouseEnter={pair.onMouseEnter}
      onMouseMove={pair.onMouseMove}
      onMouseLeave={pair.onMouseLeave}
      onFocus={pair.onFocus}
      onBlur={pair.onBlur}
    >
      {body}
    </button>
  );
}
