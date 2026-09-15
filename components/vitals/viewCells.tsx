"use client";

// THE VITALS BAND'S PER-VIEW CELL SETS — what each 3D view says in the bottom lane: hyper leads
// with the composition DONUT (four counts that are shares of one fleet — the one honest home for
// a donut), geo with its footprint numbers plus the nodes-by-country micro-bar row, and the
// ledger with its rate cards beside the tick bar-chart that used to be the LiveStrip.
//
// Split out of VitalsBand.tsx (2026-09-15) along the seam its own component names already drew.
// The band SHELL (which view is showing, the rim, the sheet body) stays there; the shared plate
// and micro-instruments are in ./bandParts. This file is the CONTENT — the half that changes
// when a view learns to say something new.

import { BandCard, MicroBars, DonutTotal, TypeGlyph, TYPE_ORDER, compositionCounts, staleFor, windowSpan, windowNote } from "@/components/vitals/bandParts";
import { useStore } from "@/src/store/store";
import { metagraphById, getAnchor } from "@/src/data/network";
import { displayNetwork } from "@/src/data/unlisted";
import { metaType, rolesOf, IdentityDot, RoleChips } from "@/components/inspector/parts";
import { machineKey } from "@/src/data/composition";
import { identityHudCss } from "@/src/palette/identity";
import { METAGRAPHS } from "@/src/net/current";
import { statusItems } from "@/src/data/nodeStatus";
import Sparkline from "@/components/Sparkline";
import Odometer from "@/components/Odometer";
import { NodeStars } from "@/components/state/StateAtoms";
import { isGlobalActivityScope } from "@/src/data/api";
import { POLL } from "@/src/engine/config";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import useTrendsWindow from "@/components/useTrendsWindow";
import { sliceWindow, trimNewestPartial, type TrendsWindowData } from "@/src/data/trendWindow";
import { ageWords } from "@/src/util/relativeAge";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

export function HyperCells({ accent }: { accent: string }) {
  const filter = useStore((s) => s.filter);
  const metaList = useStore((s) => s.metaList);
  // No `selNodes` subscription any more: the NODES card was its only reader, and dropping it also
  // drops a per-publish re-render of this whole cell from the band.
  const cfg = metagraphById(filter);
  const scoped = !!cfg || displayNetwork(filter)?.virtual === true;
  // Memoized on the DATA inputs: the band re-renders on every scene-yield flip and feed
  // publish, and these fleet folds don't change with them (review, 2026-08-31).
  const { counts, types, layers, statusRows } = useMemo(() => {
    const counts = compositionCounts(metaList, filter);

    // Metagraphs by TYPE — the DAG core is not a metagraph (one node model: it is the
    // metagraph-shaped CORE), so it stays out of this count; a committed filter scopes to it.
    // metaType is the STRUCTURED read (parts.tsx) — never a match on networkKind's prose,
    // which a copy edit could reword without any type error reaching this bucket loop.
    const metas = metaList.filter((m) => m.id !== "dag" && (!cfg || m.id === cfg.id));
    const types: Record<string, number> = { data: 0, currency: 0, "data + currency": 0, unknown: 0 };
    for (const m of metas) {
      const t = metaType(m.id, m.nodes);
      if (t in types) types[t]!++; // "hypergraph" can't occur — the dag row is filtered above
    }

    // The layers' populations: one count per PROCESS layer across the selection's machines —
    // rolesOf is the one fallback home (a role list, else the single primary layer).
    const layers: Record<string, number> = { l0: 0, cl1: 0, dl1: 0 };
    const layerScope = cfg ? metaList.filter((m) => m.id === cfg.id) : displayNetwork(filter)?.virtual === true ? [] : metaList;
    // The fleet's lifecycle STATES, per node record like the dossier's own status schedule
    // (statusItems is the one row derivation for both) — same scope as the layer read.
    const states: (string | null | undefined)[] = [];
    for (const m of layerScope) for (const n of m.nodes) states.push(n.state);
    for (const m of layerScope) {
      const seen = new Set<string>();
      for (const n of m.nodes) {
        const k = machineKey(n.ip, n.id ?? JSON.stringify(n)); // one home with compositionCounts/compositionGroups
        if (seen.has(k)) continue;
        seen.add(k);
        for (const r of rolesOf(n)) if (r in layers) layers[r]!++;
      }
    }
    return { counts, types, layers, statusRows: statusItems(states) };
  }, [metaList, filter, cfg]);

  // A COMMITTED SCOPE flips the card from a DISTRIBUTION to a CHARACTERISTIC (user, 2026-08-30:
  // "'currency 1' and a bar ... is more a single characteristic than a count"): one network has a
  // type, not a type breakdown, so the eyebrow goes singular and the value is the type — icon +
  // word. The DAG answers networkKind's own "hypergraph" (the hyper view's Orbit), the unlisted
  // set the honest "mixed set". "all" keeps the count with one icon+count entry per type — icons
  // over bars (user, same day): a type is a KIND, not a magnitude, so a glyph says it better
  // than a share bar, and the same glyphs then serve the filtered card unchanged.
  const singleWord =
    filter === "dag" ? "hypergraph"
    : displayNetwork(filter)?.virtual === true ? "mixed set"
    : cfg ? (TYPE_ORDER.find((t) => types[t]! > 0) ?? "unknown")
    : null;

  // THE LAYER ROWS, built once: they are the detail of the TYPE card under a commit and a card of
  // their own unfiltered (see below).
  const layerRows = [
    { key: "l0", label: <RoleChips compact codes={["L0"]} />, count: layers.l0! },
    { key: "cl1", label: <RoleChips compact codes={["cL1"]} />, count: layers.cl1! },
    { key: "dl1", label: <RoleChips compact codes={["dL1"]} />, count: layers.dl1! },
  ];

  return (
    <>
      {singleWord != null ? (
        // TYPE AND LAYERS ARE ONE CARD UNDER A COMMIT (user, 2026-09-01: "the type is the 'total'
        // and left section, while the layers are the details that confirm that type — e.g. a 'data'
        // type has a number of L0 and dL1 layers and 0 cL1"). That is the two-segment grammar
        // exactly: a lead that states the characteristic, and a breakdown that EVIDENCES it. Split
        // across two cards the reader had to carry the type in their head to the card beside it;
        // merged, the claim and its proof are one reading. Unfiltered there is no single type to
        // lead with, so the layers keep a card of their own.
        <BandCard
          label={cfg ? "Metagraph type" : "Network type"}
          lead={
            // SUBTLE on purpose (user): a characteristic is a quiet reading, not a headline —
            // the number cards keep the bold mono, a word does not.
            <span className="flex items-center gap-1.5">
              <TypeGlyph t={singleWord} className="size-3.5" color={accent} />
              <span className="font-mono text-caption text-foreground whitespace-nowrap">{singleWord}</span>
            </span>
          }
        >
          <MicroBars accent={accent} labelW={34} rows={layerRows} />
        </BandCard>
      ) : (
      <BandCard label="Metagraphs"
        lead={<DonutTotal counts={types} accent={accent} hues={{ unknown: "var(--muted-foreground)" }} total={TYPE_ORDER.reduce((n, t) => n + types[t]!, 0)} />}>
        {/* THE COMPOSITION CARD'S OWN SHAPE (user, 2026-08-30: "the same design (1 total value +
            4 subsets) — the one used for node composition looks best"): the two cards are sibling
            share-of-whole readings, so they wear one donut + dot-legend design. The type GLYPHS
            keep their home on the filtered face, where the card states a single characteristic. */}
        {/* "unknown" stays the WORD (user asked about "inactive", 2026-09-03 — but the bucket is
            "zero LOCATABLE machines to read roles from", not zero activity: BIOFI sits here while
            anchoring hundreds of snapshots an hour, so "inactive" would fabricate an activity
            claim, rule 10). It takes the neutral instead: not one more type in the vocabulary. */}
        <MicroBars accent={accent} labelW={58}
          rows={TYPE_ORDER.map((t) => ({ key: t, label: t === "data + currency" ? "both" : t, count: types[t]!, hue: t === "unknown" ? "var(--muted-foreground)" : undefined }))} />
      </BandCard>
      )}
      {/* NO SEPARATE "NODES" CARD (user, 2026-08-31). The composition counts PARTITION the fleet,
          so their sum is the fleet size — the donut's hole was already printing the very number
          the neighbouring card printed, twice on one row. The card that keeps it is the one that
          also says how it splits. */}
      <BandCard label="Node composition"
        lead={<DonutTotal counts={counts} accent={accent} total={Object.values(counts).reduce((a, b) => a + b, 0)} />}>
        {/* Geo's treatment, adopted here (user, 2026-08-31: "in hyper view, geo looks better"):
            the dot legend named each slice but said nothing about SIZE, so the ring carried the
            proportions alone and the numbers sat in a grid beside it. Bars carry both — and
            `steps` keeps them keyed to their own segment. */}
        <MicroBars accent={accent} labelW={72} dashZero={scoped}
          rows={Object.entries(counts).map(([label, n]) => ({ key: label, label, count: n }))} />
      </BandCard>
      {/* NODE STATUS (user, 2026-09-10) — the fleet's liveliness at a glance, a reading the
          band never carried: under "all" (the starting point) it is unique to this row, and
          under a commit it mirrors the dossier's own "by node status" schedule by design (two
          scopes, one derivation — statusItems). Detail-only like the layers card: its total
          is the fleet, which the composition donut beside it already leads with. Colour is
          the status lane's own bucket tokens; every row is named (never colour-alone). */}
      <BandCard label="Node status">
        <MicroBars accent={accent} labelW={52}
          rows={statusRows.map((it) => ({ key: it.label, label: it.label, count: it.count, hue: it.color }))} />
      </BandCard>
      {/* Unfiltered only — under a commit these rows are the type card's own evidence, above. */}
      {singleWord == null && (
        <BandCard label="Network layers"
          // ⚠️ A PROTOCOL CONSTANT, NOT A MEASUREMENT (user, 2026-09-01: "the protocol has 3
          // layers, so we can just mention it, no count"). Every other lead in this band is a
          // live reading, so two things keep this one honest in the same slot. It is derived from
          // `layerRows.length` rather than typed as a literal, so the headline can never disagree
          // with the rows that evidence it. And it is NOT an `Odometer`: that component exists to
          // roll a number as it changes, and a value that cannot change must not wear the
          // vocabulary of one that does — a `3` that visibly settles would claim it had just been
          // measured. Plain text says "this is what the protocol IS", and the bars beside it say
          // how the fleet fills it, which is exactly the lead/detail grammar.
          lead={<span className="font-mono font-bold text-foreground tabular-nums">{layerRows.length}</span>}>
          <MicroBars accent={accent} labelW={34} rows={layerRows} />
        </BandCard>
      )}
    </>
  );
}

// geo — the footprint cells (3): the fleet total, then two MERGED readings that each carry their
// own total in a donut hole — countries over nodes-by-country, providers over top-providers.
// Single hue — one measure per chart, magnitude only.
export function GeoCells({ accent }: { accent: string }) {
  const lb = useStore((s) => s.leaderboard);
  const selNodes = useStore((s) => s.selNodes);
  const countries = lb?.countries ?? [];
  const total = selNodes.length;
  const { ispCounts, topIsps, located } = useMemo(() => {
    const ispCounts = new Map<string, number>();
    let located = 0;
    for (const r of selNodes) {
      const isp = "geo" in r.pick ? r.pick.geo?.isp : undefined;
      if (isp) ispCounts.set(isp, (ispCounts.get(isp) ?? 0) + 1);
      // PLACED = the row resolved to a country, which is exactly the test the country ring below
      // is built on. Reading the same field is the point: the two cards can then never disagree
      // about how many nodes this view is actually able to draw.
      if (r.cc) located++;
    }
    return { ispCounts, topIsps: [...ispCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3), located };
  }, [selNodes]);
  const topCountries = countries.slice(0, 3);
  const restC = countries.slice(3).reduce((s, c) => s + c.count, 0);
  // ⚠️ THE REMAINDER MUST SHARE THE RING'S OWN BASIS. Against `total` (every selected node) this
  // swept nodes with NO reported provider into `other`, so the ring described a population the
  // hole's `ispCounts.size` never counted — the slices' proportions were of one set and the number
  // beside them of another. Summing ispCounts keeps both on the nodes that actually report one.
  // (The country ring was already right: its remainder is summed from `countries`.)
  const ispTotal = [...ispCounts.values()].reduce((a, b) => a + b, 0);
  const restI = ispTotal - topIsps.reduce((s, [, n]) => s + n, 0);

  // THE TOTAL MOVES INTO ITS OWN BREAKDOWN (user, 2026-08-31): "countries" and "providers" were
  // bare number cards sitting next to the very lists that break those numbers down, so the row
  // said each thing twice. Merged, each card is one reading — how MANY, and how they SPREAD —
  // wearing the composition card's own donut + rows design, which is already this band's shape
  // for a share-of-whole (user, 2026-08-30: "the one used for node composition looks best").
  //
  // ⚠️ THE RING MUST PARTITION THE FLEET, so the remainder is a SEGMENT, not a footnote. Ringing
  // only the top three would draw them as the whole population — three slices summing to 100%
  // while a third of the nodes sit outside the chart. `other` carries them at the faintest step,
  // and its presence is what makes the visible slices' proportions true.
  const countryRing: Record<string, number> = Object.fromEntries(topCountries.map((c) => [c.cc, c.count]));
  if (restC > 0) countryRing.other = restC;
  const ispRing: Record<string, number> = Object.fromEntries(topIsps);
  if (restI > 0) ispRing.other = restI;

  return (
    <>
      {/* THE FLEET, AND WHETHER GEO CAN ACTUALLY DRAW IT (user, 2026-09-01: the lone numeral
          "looks very boring, is there a nicer way to present the 1 number?"). A card with no
          breakdown is the boring case by construction — the band's grammar is lead + detail — and
          this is the one breakdown that belongs to THIS view rather than to its neighbours: a node
          the lookup could not place sits in no country ring and no provider ring, so the split is
          also the basis both cards beside it silently assume. Rule 10: an unplaced node is an
          instrument state, not a rounding error, and stating it is how the fleet total and the
          rings are allowed to differ honestly. `unplaced` reading 0 is itself a reading — the
          fleet is fully drawn — and MicroBars renders no bar for it, only the numeral. */}
      <BandCard label="Nodes"
        lead={<span className="font-mono font-bold text-foreground tabular-nums"><Odometer int value={total || null} /></span>}>
        {/* "unplaced" takes the neutral, like hyper's "unknown" type bucket: a node the lookup
            could not place claims no location, so its bar should not wear the accent the located
            split does (user, 2026-09-03). */}
        <MicroBars accent={accent} labelW={56} rows={[
          { key: "located", label: "located", count: located },
          { key: "unplaced", label: "unplaced", count: Math.max(0, total - located), hue: "var(--muted-foreground)" },
        ]} />
      </BandCard>
      {/* "Top countries", not "Nodes by country" (user, 2026-09-01): the card shows the top three
          plus an `other` remainder, so the old name promised the whole distribution and the row
          beside it now states the fleet total anyway. No "+N more" note either (user, 2026-09-11):
          "top" already implies there can be more, and the ring's `other` segment carries the
          remainder honestly.
          The hole counts COUNTRIES, the ring spreads NODES across them — two different questions,
          which is why the centre is passed rather than left as the sum. */}
      {topCountries.length > 0 && (
        <BandCard label="Top countries"
          lead={<DonutTotal counts={countryRing} accent={accent} total={countries.length} />}>
          <MicroBars accent={accent} labelW={18} rows={topCountries.map((c) => ({ key: c.cc, label: c.cc, count: c.count }))} />
        </BandCard>
      )}
      {topIsps.length > 0 && (
        <BandCard label="Top providers"
          lead={<DonutTotal counts={ispRing} accent={accent} total={ispCounts.size} />}>
          {/* labelW 92 → 150 (user, 2026-08-30): the card had spare width while "Hetzner
              Online GmbH" truncated — the name is the row's identity, so it gets the room. */}
          <MicroBars accent={accent} labelW={150} rows={topIsps.map(([isp, n]) => ({ key: isp, label: isp, count: n }))} />
        </BandCard>
      )}
    </>
  );
}

// The wide card is the STORE's chart (2026-09-08, user: "an overview who anchored the most over
// time" — replacing the declicked per-tick bar-chart, whose subject the store structurally
// cannot carry: its finest tier is a 5-minute bucket and a tick is ~28s, so keeping the label
// while changing the resolution would have changed the meaning silently. The card changed
// SUBJECT instead: one bar per store bucket over the rim's picked window). TickBars' honesty
// rules carry over where they apply:
//
//   · THE SEGMENTS MUST SUM TO THE BAR. The store samples the catalog, so the shortfall
//     against g.anchors is the UNLISTED networks' anchoring — drawn as its own neutral
//     segment rather than dropped (the donuts' `other` rule).
//   · ORDER IS THE CATALOG'S, never per-bucket size: a segment that changes place bucket to
//     bucket cannot be followed.
//   · A MEASURED ZERO DRAWS NOTHING — an honest gap, never a stub.
//   · IDENTITY IS NEVER COLOUR-ALONE: the METAGRAPHS ANCHORING card to the left is the
//     legend, ranked over the SAME window (its own header says why).
//
// And one rule is NEW here, because the live buffers never had the state: an UNMEASURED
// bucket (null — a sampling hole) is not a zero. It draws a 2px NEUTRAL baseline stub — the
// muted "nothing to read here" vocabulary — never the accent: an accent stub is exactly the
// small-but-nonzero fabrication the zero rule exists to avoid, but drawing nothing would
// claim "no anchors" about an hour nobody measured.
//
// Filtered, a bar is that network's own anchors per bucket on its OWN scale in its identity
// hue — the tick chart's scoped rule, at the store's resolution.
const STACK_ORDER: string[] = METAGRAPHS.map((m) => m.id);

type Snaps = ReturnType<typeof useSnapshotFeed>["snaps"];
interface StackSeg { key: string; n: number; color: string }

function StackBars({ accent, isMeta, filter, data }: { accent: string; isMeta: boolean; filter: string; data: TrendsWindowData | null }) {
  if (!data) {
    return <span className="flex items-center justify-center w-full self-center text-micro text-muted-foreground" aria-hidden>acquiring…</span>;
  }
  const anchors = data.series["g.anchors"] ?? [];
  const ticks = data.series["g.ticks"] ?? [];
  const bars = data.buckets.map((ts, i) => {
    const covered = ticks[i] != null;
    if (isMeta) {
      return { v: covered ? (data.series[`m.${filter}.snaps`]?.[i] ?? 0) : null, ts, segs: null as StackSeg[] | null };
    }
    let segs: StackSeg[] | null = null;
    let total = covered ? (anchors[i] ?? 0) : null;
    if (total != null && total > 0) {
      segs = [];
      let named = 0;
      for (const id of STACK_ORDER) {
        const n = data.series[`m.${id}.snaps`]?.[i];
        if (n) { segs.push({ key: id, n, color: identityHudCss(id) }); named += n; }
      }
      // THE REMAINDER IS "UNATTRIBUTED", NEVER "UNLISTED" (review, 2026-09-09): the store
      // advances each chain's cursor independently, so a lagging catalog chain's anchors
      // land here beside the genuinely-unlisted ones — the neutral says only "not
      // attributable from the store", the tick chart's own old rule. And the bar must
      // CONTAIN its segments: live edge skew can put named above the global total, so the
      // bar takes the larger (a negative remainder must not silently vanish while the
      // segments clip past 100%).
      total = Math.max(total, named);
      const rest = total - named;
      if (rest > 0) segs.push({ key: "__unattributed", n: rest, color: "var(--muted-foreground)" });
    }
    return { v: total, ts, segs };
  });
  const max = Math.max(1, ...bars.map((b) => b.v ?? 0));
  const anyMeasured = bars.some((b) => b.v != null);
  // "none" is a whole-window claim and may only be said over a fully-measured window
  // (review, 2026-09-09: with 23 of 24 buckets unmeasured and one measured zero, the old
  // test asserted "no anchors in this window" from one hour — the TickBars rule this chart
  // inherits: the window IS full and the answer in it is zero).
  const allZero = bars.length > 0 && bars.every((b) => b.v === 0);
  if (bars.length === 0 || !anyMeasured) {
    // Message ONLY — rendering the null stubs beside it squeezed the words into the same
    // flex row (review); an entirely-unmeasured window has nothing honest to draw.
    // NOT "acquiring…" (user, 2026-09-09, watching the backfill's cron lock-out): the payload
    // DID arrive — the window simply holds no samples, a real outage that can stand for
    // hours. "Acquiring" is the fetch-in-flight word above and quietly promises resolution;
    // a measured silence states itself.
    return <span className="flex items-center justify-center w-full self-center text-micro text-muted-foreground" aria-hidden>not sampled in this window</span>;
  }
  // MONTHLY BARS CARRY A MONTH AXIS (user, 2026-09-09: "a subtle legend at 1Y — jan. feb."):
  // the 1Y window is the one where position-in-window stops being readable as "when" (a bar
  // is a whole calendar month, not a rolling bucket), so each slot names its month below.
  // Detected off monthlySum's own nominal stepMs — no new prop to drift. Every OTHER month,
  // anchored at the newest so the right edge always reads (the /trends right-edge skip rule);
  // twelve full labels at text-micro collide in the card's ~16px slots. The label row mirrors
  // the bar row's slot geometry exactly (flex-1 / max-w / gap), so labels sit under their bars.
  const monthly = data.stepMs === 2_592_000_000;
  // A WEEK'S BARS CARRY THEIR WEEKDAYS (user, 2026-09-11 — the month axis's own reasoning one
  // zoom down: seven identical daily bars had no identity, and "mon · tue …" is what a week's
  // bars are actually about). Daily step + at most seven slots IS the 7D window — 30D shares
  // the step but never the count. Every bar labels; seven three-letter micros fit the slots.
  const weekly = data.stepMs === 86_400_000 && data.buckets.length <= 7;
  return (
    <div className="flex flex-col h-full min-h-12 w-full self-stretch" aria-hidden>
      {/* justify-CENTER (user, 2026-09-11: "7D takes less than half the space and is right
          aligned"): the 22px slot cap means sparse windows — 7D's seven bars, 1Y's twelve —
          cannot fill the row, and end-alignment parked them in a corner. Full windows shrink
          their slots to fit, so the justification is a no-op everywhere else; time still
          reads left-old → right-new inside the cluster. */}
      <div className="flex items-end justify-center gap-[2px] flex-1 min-h-0 pb-0.5">
        {allZero && <span className="text-micro text-muted-foreground self-center">no anchors in this window</span>}
        {bars.map((b) => {
          if (b.v == null) {
            // Unmeasured — the neutral stub (see the header). It keeps its flex slot so the
            // window's rhythm (position = time) survives the hole.
            return <span key={b.ts} className="flex-1 max-w-[22px] h-[2px] rounded-t-[2px]" style={{ background: "var(--border)", opacity: 0.6 }} />;
          }
          return (
            <span
              key={b.ts}
              // `flex-col-reverse`: segments are written in catalog order and stack UP from the
              // baseline, so the first listed network is the foot of every bar in the window.
              className="flex-1 max-w-[22px] rounded-t-[2px] overflow-hidden flex flex-col-reverse"
              style={{
                height: b.v > 0 ? `${Math.max(8, (b.v / max) * 100)}%` : "0",
                // A stacked bar's colour comes from its segments; a scoped one paints whole.
                background: b.v > 0 && !b.segs ? accent : "none",
                // ONE weight for every bar (user, 2026-09-08): the tick chart's glowing head
                // meant "the newest live tick"; here the last bar is just the newest COMPLETE
                // bucket — nothing an emphasis would be ABOUT.
                opacity: b.v > 0 ? 0.7 : 0,
              }}
            >
              {b.segs?.map((sg) => (
                <span key={sg.key} className="w-full flex-none" style={{ height: `${(sg.n / b.v!) * 100}%`, background: sg.color }} />
              ))}
            </span>
          );
        })}
      </div>
      {(monthly || weekly) && (
        <div className="flex justify-center gap-[2px] leading-none">
          {bars.map((b, i) => (
            <span key={b.ts} className="flex-1 max-w-[22px] text-center text-micro text-muted-foreground/70 lowercase whitespace-nowrap">
              {weekly
                ? new Date(b.ts).toLocaleString("en", { weekday: "short", timeZone: "UTC" })
                : (bars.length - 1 - i) % 2 === 0
                  ? new Date(b.ts).toLocaleString("en", { month: "short", timeZone: "UTC" })
                  : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ledger — the activity cells: the two rates as number + sparkline cards (slot 2 swaps with the
// scope exactly as the bar's vitals did: filtered, "anchors" would be a different quantity, so
// the network's DAG fees show instead), and the tick chart as one wide card.
export function LedgerCells({ accent, filter, paused }: { accent: string; filter: string; paused: boolean }) {
  const activity = useStore((s) => s.activity);
  // ONE feed subscription for the whole row (review, 2026-08-31) — the roster's live
  // fallback still reads it while the store hasn't answered.
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots);
  // THE LINES AND BARS ARE MEASURED, THE NUMBERS ARE LIVE (2026-09-08 — the trends store's
  // first HUD surface, then the rim round the same day). The charts plot the store's series
  // over the rim's picked window; the lead numerals stay the live rates — the band is a live
  // instrument, and the freshest fact wins the headline. Two fetches cover every window:
  // the 7d payload is the HOURLY tier (its newest-24h slice = exact per-hour sums), the 90d
  // payload the DAILY tier (7d/30d slices = exact per-day sums). No client re-bucketing —
  // a client sum over part-null buckets would have to invent a floor rule the store already
  // solved.
  // ⚠️ ONE WINDOW, NOT A PICK (user, 2026-09-13). The band carried a six-segment range rim
  // (1H…ALL) that only the ledger's cells could honour, which is why the Trends LINK beside it
  // could only appear there too — and the link is the useful half in every view. So the range
  // control is gone and the band states ONE window; the ranges themselves live one rung down,
  // on /trends, where the charts are built to be ranged (convention 12: the band is the live
  // instrument, /trends the measured history). 24H is the band's window because it is the one
  // reach that reads as "the network right now" beside live numerals.
  //
  // It rides the 7d payload — the store's HOURLY tier, whose newest-24h slice is exact per-hour
  // sums. No client re-bucketing: a client sum over part-null buckets would have to invent a
  // floor rule the store already solved.
  // `paused` while the HUD is stepped aside (2026-09-13): the band stays MOUNTED through the
  // SCENE toggle so it can slide out, and a mounted-but-hidden band that kept polling would
  // make the pulse strip's "while shown" words a lie about this feed.
  const t7 = useTrendsWindow(paused ? null : "7d");
  const windowed = useMemo<TrendsWindowData | null>(
    // trimNewestPartial FIRST (the payload's own clock drops the still-filling bucket — the
    // CDN finding), then the window cut.
    () => (t7.data ? sliceWindow(trimNewestPartial(t7.data), 24 * 3_600_000) : null),
    [t7.data],
  );
  // NO outage fallback to the live buffers — considered after the review and declined
  // (user, 2026-09-09: "keep the code simple, no complex fallback logic"). A store outage
  // leaves the measured cards on their acquiring state while the hook retries; the pulse
  // strip's api-trends row is where the outage itself is stated.
  // The bars and the lines share the windowed buckets exactly — one window, one payload, so
  // the chart and the roster that legends it can never rank over different reaches.
  const barData = windowed;
  const span = "last 24 hours";
  const stepWord =
    windowed?.stepMs === 300_000 ? "in five-minute buckets"
    : windowed?.stepMs === 3_600_000 ? "hour by hour"
    : "day by day";
  const scoped = !isGlobalActivityScope(filter);
  const cfg = metagraphById(filter);
  const isMeta = !!cfg && filter !== "all" && filter !== "dag";
  const basis = windowNote(activity, scoped ? "snapshots" : "global ticks");
  /** A measured series by field name — and an ABSENT name is still a reading. `assemble` only
   *  emits names that appeared in the window's hashes, so a catalog chain that anchored
   *  nothing in the window has no `m.{id}.snaps` at all; its honest series is 0 wherever the
   *  sampler covered the bucket (`g.ticks`, the coverage marker) and a gap where it didn't. */
  const measured = (name: string): (number | null)[] | undefined => {
    if (!windowed) return undefined;
    return windowed.series[name] ?? windowed.series["g.ticks"]?.map((v) => (v != null ? 0 : null));
  };
  interface SparkSpec { data: (number | null)[] | undefined; value: number | undefined; unit: string; span: string; sr: string; offRim: boolean }
  // THE LEAD FOLLOWS THE RIM TOO (user, 2026-09-08, the third round of the same stumble —
  // "should a 1Y selection say /hour?"): a live per-hour numeral beside a year-long line kept
  // inviting the two to be read together, whatever the words said. The numeral is now the
  // WINDOW'S MEASURED MEAN in the window's own tier unit — /hour on the hourly tier, /day on
  // the daily — so every element of the card describes the one window the rim states. It is
  // also a measurement where the old lead was an extrapolation (rule 10 smiles). The live
  // per-hour rate lost from the lead survives where live already lives: the fallback card,
  // whose whole surface IS the live window.
  // ONE unit whatever the window (user, 2026-09-08, closing the round: "it's not the actual
  // bucket that matters — show a consistent value derived from the appropriate bucket"): the
  // mean is stated PER DAY on every window, so flipping the rim compares like with like —
  // 24H answers "the last day", 30D and 1Y answer "a typical day of that stretch". The tier
  // only decides what the mean is computed FROM (hourly sums × 24, daily sums × 1).
  const meanOf = (data: (number | null)[] | undefined, scale = 1): number | undefined => {
    const vals = (data ?? []).filter((v): v is number => v != null);
    if (!vals.length || !windowed) return undefined;
    const m = (vals.reduce((a, b) => a + b, 0) / vals.length) * (86_400_000 / windowed.stepMs) * scale;
    return m >= 100 ? Math.round(m) : Math.round(m * 10) / 10;
  };
  /** The measured line where the store carries this scope (the catalog chains and the global
   *  chain), else the live buffer's extrapolated shape — the unlisted networks are sampled by
   *  nothing, and an "acquiring…" that never resolves is the fabricated promise rule 10
   *  forbids. `feeScale` turns the store's datum fee into $DAG (1e8 datum per DAG). */
  const sparkOf = (name: string | null, live: number[] | undefined, liveValue: number | undefined, feeScale = false): SparkSpec => {
    if (name != null) {
      const data = measured(name);
      return {
        data,
        value: meanOf(data, feeScale ? 1e-8 : 1),
        // "avg" is part of the unit line on purpose (user, 2026-09-08: "is that the average
        // across the whole year or the latest?" — the mean-ness was sr-only, invisible to the
        // eye asking). The fallback keeps its bare "per hour": its lead is a current rate.
        // Prose units, not the "/day" glyph — the trends page's own 2026-09-09 ruling, one
        // vocabulary across both surfaces.
        unit: "avg per day",
        span,
        sr: `Measured from the chain's own records (${span}, ${stepWord}); the rate is the window's mean, stated per day.`,
        offRim: false,
      };
    }
    return {
      data: live,
      value: liveValue,
      unit: "per hour",
      span: activity ? windowSpan(activity) : "",
      sr: basis ?? "",
      offRim: true, // the live buffer's window is NOT the rim's — this card must say so
    };
  };
  /** THE QUESTION DOESN'T APPLY — the node card's `n/a` rule reaching the band (user, 2026-09-14:
   *  "does DAG pay snapshot fees, that's what is implied now?"). It does not: a global snapshot
   *  carries no `fee` field at all, because the DAG core has nothing to anchor INTO — it is the
   *  thing anchored into. So under a committed DAG the fees slot had been printing 251/day as if
   *  that were the core's outgoing, when it is every metagraph's outgoing flowing the other way.
   *
   *  `n/a`, not a muted zero and not the summed figure relabelled: a 0 would claim the core could
   *  pay and didn't, and the sum is a real number answering a question nobody asked at this scope.
   *  The reason line carries the fact that makes the absence interesting — this is the end fees
   *  arrive at — and the summed reading is one filter step away, under All, where it belongs. */
  const notApplicable = (label: string, reason: string, title: string) => (
    <BandCard
      key={label}
      label={label}
      title={title}
      lead={
        <span className="flex flex-col items-start">
          <span className="font-mono font-bold text-muted-foreground tabular-nums whitespace-nowrap">n/a</span>
        </span>
      }
    >
      <span className="flex items-center self-stretch text-micro text-muted-foreground">{reason}</span>
    </BandCard>
  );
  const rate = (label: string, spark: SparkSpec, note?: string, title?: string) => {
    // NO ENDPOINT AXIS. It existed for the 1Y/ALL windows, where months repeat across the year
    // boundary and position-in-window stopped reading as "when" (user, 2026-09-09). Over a
    // single 24-hour window position IS when, and the card's own words state the reach — the
    // deep windows that needed the axis are /trends' business now.
    const line = (
      <span className="flex-1 min-w-0 self-center">
        <Sparkline data={spark.data} color={accent} height={42} maxPoints={20} stretch />
      </span>
    );
    // A STOPPED CHAIN REPORTS WHEN, NOT HOW FAST — and now also SHOWS it (user, 2026-09-08:
    // the idle-card idea). The lead states idle and how long, in the Fees-paid stacked
    // grammar; the measured line still draws, because a chain that stopped inside the picked
    // window shows exactly WHERE it stopped — zoom out and the stop is the story. The live
    // fallback line has nothing to show for an idle chain (its buffer is the silence), so
    // that branch keeps the words alone.
    const stale = staleFor(activity);
    if (stale != null) {
      return (
        <BandCard
          key={label}
          label={label}
          title={title}
          aside={spark.data != null ? spark.span || undefined : undefined}
          lead={
            <span className="flex flex-col items-start">
              <span className="font-mono font-bold text-muted-foreground tabular-nums whitespace-nowrap">idle</span>
              <span className="text-label text-muted-foreground whitespace-nowrap">{ageWords(stale)}</span>
            </span>
          }
        >
          {spark.data != null ? (
            line
          ) : (
            <span className="flex items-center self-stretch text-micro text-muted-foreground">
              no snapshots for {ageWords(stale)}
            </span>
          )}
          <span className="sr-only">No snapshots for {ageWords(stale)}. {spark.sr}</span>
        </BandCard>
      );
    }
    return (
    <BandCard
      label={label}
      title={title}
      // THE LABEL NAMES THE QUANTITY, THE NUMERAL CARRIES ITS OWN UNIT (user, 2026-09-08,
      // two rounds: "ANCHORS/HOUR" over a year-long line put the lead's unit on the whole
      // card, and an aside saying "live · /hour" was hard to read and repeated on every
      // window — it described the numeral, not the card). The unit rides UNDER the number
      // as a muted underline (the idle card's own stacked-lead grammar), so it qualifies
      // exactly the thing it belongs to; the header carries no aside and the rim alone
      // spoke for the charts' range.
      //
      // ⚠️ AND NOW EVERY CARD STATES ITS OWN REACH (user, 2026-09-14: "the vitals card now also
      // need to indicate what range they show"). The rim WAS the range statement, so retiring it
      // left the measured cards silent about a window they very much have — a chart with no
      // stated reach beside live numerals invites both to be read as "now", which is the
      // confusion the rim's own 2026-09-08 rounds were spent on. `spark.span` already carries
      // the right words per card and needs no new rule: the measured cards say the band's
      // window, and the live fallback keeps saying its own — which is the one case where the
      // two genuinely differ, and the reason this is one expression rather than a constant.
      aside={spark.span || undefined}
      lead={
        <span className="flex flex-col items-start">
          {/* NodeStars while the window's mean is still in flight (user, 2026-09-08: the
              dash "doesn't say it's working on it") — the acquiring rule's slot form: a
              real number is arriving into this slot, and the stars hold its width; the
              label and unit line already name what is coming. */}
          <span className="font-mono font-bold text-foreground tabular-nums whitespace-nowrap">
            {spark.value != null ? <Odometer value={spark.value} /> : <NodeStars count={3} />}
          </span>
          <span className="text-label text-muted-foreground leading-none">{spark.unit}</span>
        </span>
      }
    >
      {/* stretch: the fixed 64px chart left the card's right half empty (user, 2026-08-30).
          It also YIELDS FIRST when the row is tight, and `min-w-0` is how: a sparkline is the only
          part of a rate card that is decoration — the numeral and its extrapolation basis are the
          reading (rule 10) — so it contributes NOTHING to the card's intrinsic width and gives its
          space back before the basis note can be clipped off the plate. That is also what lets the
          stacked chart, the row's headline instrument, keep its own 220px floor at tablet width. */}
      {/* `accent`, NOT a hardcoded `var(--primary)` (user, 2026-09-01: the ledger's vitals should be
          "metagraph color-aware — only anchors per global snapshot currently does that"). This was
          the band's own rule already: structural cyan at rest, the identity hue under a committed
          filter, resolved once in useVitalsScope and handed to EVERY chart as `accent`. The donut,
          the bars and the tick chart all took it; the sparkline alone had been wired to the literal,
          so a committed network re-tinted three of the row's four instruments and left this one
          cyan. Not a rule-3 exception — rule 3 forbids repointing the structural TOKEN, and this
          passes an identity hue to a chart, which is what the band has always done under a scope. */}
      {/* `maxPoints`: even the widest window (30 daily buckets) stays under a readable ceiling,
          and the 7d hourly window's 168 segments over a 40px-tall line read as hair rather than
          as a trend (the "too dense" rule, user, 2026-09-01). Bucketed to 20 by mean — the SAME
          window at a lower frequency, which is what keeps it honest against the window printed
          in the card's own header. */}
      {/* The window words live in the eyebrow's aside (user, 2026-09-08, after one round with
          them captioned under the line): the header carries the reading's window, so the body
          is the chart's alone — full width AND full height (the 1Y range row above is chart
          furniture, not a window statement, so it does not reopen that round). */}
      {line}
      {spark.sr && <span className="sr-only">{spark.sr}</span>}
      {note && <span className="sr-only">{note}</span>}
    </BandCard>
    );
  };
  // WHO anchors, HOW MUCH, HOW OFTEN, then the attribution picture (user ordering, 2026-08-30):
  // the roster leads, the anchor rate beside it, the cadence, and the chart closes the row.
  return (
    <>
      <AnchoringNetworks windowed={barData} snaps={snaps} filter={filter} />
      {/* ⚠️ ONE QUANTITY, ONE LABEL, SCOPED BY THE FILTER — the slot no longer changes what it
          measures (user, 2026-09-14: "filter DAG, vitals stop showing fees but now anchors count
          instead; keep it consistent"). It used to swap between a FEE and a COUNT, which is not a
          scope change at all: committing the DAG core and committing a metagraph are the same
          gesture, and the reader got two unrelated readings out of it with nothing saying why.
          ⚠️ AND THE LABEL DOES NOT MOVE EITHER. A first pass split it into "fees paid" / "fees
          collected", which dramatised the scope into a change of wording — and the two are not
          two things: `g.feeFloor` is byte-identical to the sum of every `m.*.fee` (checked against
          the live store, 1818.13 DAG both ways over 7 days; DOR alone is 1023.6 of it). Unscoped
          it is every chain summed, which is also what the base ledger takes in; scoped it is that
          chain's share. That is exactly the SNAPSHOTS card's grammar one slot over — one label,
          narrowed by the filter — and the band should not invent a second grammar for fees.
          ⚠️ NOT "transaction fees" (user asked, 2026-09-14). Neither side has ever shown one. A
          DAG transfer's fee is a different quantity entirely and ~1,100x smaller: measured off
          /transactions, ~0.93 DAG a day against this slot's ~259. It belongs in its own reading.
          ⚠️ AND THE DAG CORE IS NOT A THIRD SCOPE OF THE SAME READING — it is the one scope where
          the question does not apply, which is why it branches FIRST and off `filter` rather than
          off `scoped` (`isGlobalActivityScope` folds "all" and "dag" together, and here they are
          opposites: "all" is everyone's outgoing, "dag" is the end it arrives at). See
          `notApplicable`.
          Anchors lose nothing by leaving: the roster to the left counts who anchored and the chart
          to the right plots how much, both over this same window. This slot was their third home.
          ⚠️ THE TWO SCOPES ARE NOT EQUALLY EXACT, though, and the card says so. A network's own
          fees are every fee it paid; the summed figure covers only the chains the sampler sees —
          the public catalog — so it is a FLOOR, the same lower bound the snapshot card marks. It
          cannot be silent about that (rule 10), and a caveat about the reading has nowhere to sit
          but the card's title. */}
      {filter === "dag"
        ? notApplicable(
            "Snapshot fees",
            "the base ledger is paid these, it pays none",
            "A snapshot fee is what a metagraph pays to anchor into the global chain. The DAG core has nothing to anchor into — it is the chain they anchor into — so a global snapshot carries no fee at all. What flows IN is every network's fees summed; commit All to read it.",
          )
        : scoped
          ? rate("Snapshot fees", sparkOf(cfg ? `m.${cfg.id}.fee` : null, activity?.feesSeries, activity?.feesPerHour, true),
                 "$DAG this network pays to anchor its snapshots into the global chain.",
                 "What this network pays in $DAG to anchor its snapshots into the global chain. Its own fees, in full.")
          : rate("Snapshot fees", sparkOf("g.feeFloor", activity?.feesSeries, activity?.feesPerHour, true),
                 "$DAG paid to anchor snapshots into the global chain, every network summed. A floor: it counts only the metagraphs in the public catalog.",
                 "What every network pays in $DAG to anchor its snapshots into the global chain, summed — so this is also what the base ledger takes in. A lower bound: only the metagraphs in the public catalog are counted, so the real figure is higher.")}
      {rate("Snapshots", sparkOf(scoped ? (cfg ? `m.${cfg.id}.snaps` : null) : "g.ticks", activity?.cadenceSeries, activity?.snapsPerHour))}
      {/* The chart states the same reach its rows do — it plots the very buckets the rate cards
          average, so a silent chart beside two captioned ones would read as a different window. */}
      <BandCard label="Anchors by metagraph" aside={span} className="min-w-[220px]">
        <StackBars accent={accent} isMeta={isMeta} filter={filter} data={barData} />
      </BandCard>
    </>
  );
}

// The distinct metagraphs seen anchoring — RANKED, OVER THE SAME WINDOW AS THE CHART IT
// LEGENDS (2026-09-08). This card is the stacked chart's legend (identity is never
// colour-alone, and the band takes no pointer events so there can be no tooltip), so the two
// must read one window or a hue in the chart could have no dot beside it. Ranked
// busiest-first — "who anchored the most" is the card's question now — which is the ranked-
// breakdown exemption to the fixed-order rule (top countries' own precedent: sorting IS the
// reading where the builder ranks). The unlisted remainder has no dot anywhere, honestly: the
// chart's neutral segment is its whole identity, because the store samples the catalog.
// While the store hasn't answered, the LIVE window's exact id set stands in (the anchor
// index), with no window words — the honest silence. A committed filter stays a LENS: the
// count is the window's whole truth, the dim says which network you are looking through.
function AnchoringNetworks({ windowed, snaps, filter }: { windowed: TrendsWindowData | null; snaps: Snaps; filter: string }) {
  // Memoized on the payload: the ranking's input changes per 5-minute fetch while the
  // component re-renders on every activity tick (review's efficiency pass).
  const ranked = useMemo(() => {
    if (!windowed) return null;
    const totals = new Map<string, number>();
    for (const [name, series] of Object.entries(windowed.series)) {
      const m = /^m\.(.+)\.snaps$/.exec(name);
      if (!m) continue;
      const sum = series.reduce<number>((a, v) => a + (v ?? 0), 0);
      if (sum > 0) totals.set(m[1], sum);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [windowed]);
  let list: string[];
  if (ranked) {
    list = ranked;
  } else {
    const ids = new Set<string>();
    for (const d of snaps) {
      const mc = getAnchor(d.timestamp)?.metaCounts;
      if (mc) for (const id of mc.keys()) ids.add(id);
    }
    list = [...ids];
  }
  return (
    // AN EQUAL SHARE LIKE EVERY OTHER CELL (2026-09-13). This card is why the tiers existed —
    // a fixed run of dots left ~200px of quiet plate beside them — but quiet plate inside an
    // even lane reads as breathing room, while an uneven lane reads as cards that disagree
    // about how wide they should be. The dots keep their own `max-w` wrap below, so the slack
    // collects around the roster rather than stretching it.
    <BandCard
      label="Metagraphs anchoring"
      lead={<span className="font-mono font-bold text-foreground tabular-nums"><Odometer int value={list.length || null} /></span>}
    >
      {/* ⚠️ THE LENS DIMS, IT DOES NOT EDIT (user, 2026-09-01: "if we filter, should we then also
          dim the filtered bullets?"). Yes — this roster was the one surface in the band ignoring the
          committed filter while every chart beside it re-tinted. But the COUNT above stays the
          honest total: five networks really did anchor in this window, and a lens is not allowed to
          change that (the explorer draws the same line — a tick still LISTS every contributor under
          a commit, it just makes only one of them drillable). So the number says how many anchored
          and the dim says which one you are looking through.
          `opacity-45` is the app's existing "present, but not your subject" step — the same one the
          filter picker's 0-count rows and hyper's 0-node networks wear. */}
      {/* TWO CHANNELS FOR ONE LENS: the others step back, the subject steps FORWARD (user,
          2026-09-01). Dimming alone left the committed network the same size as the four it was
          being distinguished from — the eye had to find the bright one among five identical marks
          rather than being handed it. `items-center` keeps the row's baseline steady while one dot
          grows, so nothing below it shifts. */}
      {/* ⚠️ EVERY BULLET IS NAMED, AND THE RUN IS CENTRED (user, 2026-09-14: "metagraphs anchoring
          can be centre-aligned and each bullet has room for a label"). The dots were bare and
          capped at 120px because the card was `sm` and had no width to spend; on an equal share it
          has plenty, and a bare dot made this the one roster in the app naming its subjects by
          colour alone — which is the rule the sr-only line below existed to paper over. The TICKER
          is the label: it is what the rest of the band already calls a network ("following DOR"),
          and it stays short enough that four or five pairs wrap cleanly at a third of the plate.
          ⚠️ THE CAP DROPS 12 → 8 with the labels: twelve NAMED entries is a list, not a legend,
          and the honest total is the lead numeral beside them, not the length of this run. */}
      <span className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 flex-1 min-w-0">
        {list.slice(0, 8).map((id) => {
          const on = filter !== "all" && id === filter;
          const label = metagraphById(id)?.ticker ?? displayNetwork(id)?.ticker ?? null;
          return (
            <span key={id} className={cn("inline-flex items-center gap-1 min-w-0", filter !== "all" && !on && "opacity-45")}>
              <IdentityDot hue={identityHudCss(id)} className={on ? "w-3.5 h-3.5" : undefined} />
              {/* No hand-written fallback label — `displayNetwork` is the one home for what an
                  uncatalogued channel is CALLED (unlistedBoundary.test.ts enforces that the id
                  literal has two homes, and this is not one of them). With no name to give, the
                  dot stands alone rather than being captioned with a guess. */}
              {label && (
                <span className={cn("text-micro truncate", on ? "text-foreground" : "text-muted-foreground")}>
                  {label}
                </span>
              )}
            </span>
          );
        })}
      </span>
      {/* Identity is never colour-alone, and the lens has to reach the spoken form too, or a
          screen reader hears five equal names where the eye sees one subject among four others. */}
      <span className="sr-only">
        {list
          .map((id) => {
            const name = metagraphById(id)?.name ?? id;
            return filter !== "all" && id === filter ? `${name} (filtered)` : name;
          })
          .join(", ")}
      </span>
    </BandCard>
  );
}

/** The one scope read both presentations share (review, 2026-08-31 — the band and the phone
 *  strip row are billed as THE SAME cards, so their store reads and accent rule live once).
 *  Rule 3: structural cyan is the charts' resting hue; a committed filter re-points the accent
 *  at the identity hue (the strip's old rule, kept). */
