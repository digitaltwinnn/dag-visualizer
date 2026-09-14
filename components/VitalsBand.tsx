"use client";

import { useStore, type Mode } from "@/src/store/store";
import RollSwap, { BAR_EASE } from "@/components/RollSwap";
import { metagraphById, filterAccent, getAnchor } from "@/src/data/network";
import { displayNetwork } from "@/src/data/unlisted";
import { metaType, rolesOf, IdentityDot, RoleChips } from "@/components/inspector/parts";
import { compositionRows, machineKey } from "@/src/data/composition";
import type { NodeInfo } from "@/src/data/types";
import { identityHudCss } from "@/src/palette/identity";
import { METATYPE_ICONS, VIEW_ICONS } from "@/components/icons";
import { METAGRAPHS } from "@/src/net/current";
import { statusItems } from "@/src/data/nodeStatus";
import Sparkline from "@/components/Sparkline";
import Odometer from "@/components/Odometer";
import { NoSignalDot, NodeStars } from "@/components/state/StateAtoms";
import { isGlobalActivityScope, type Activity } from "@/src/data/api";
import { POLL } from "@/src/engine/config";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import useTrendsWindow from "@/components/useTrendsWindow";
import { sliceWindow, trimNewestPartial, type TrendsWindowData } from "@/src/data/trendWindow";
import { DOC_ICONS } from "@/components/icons";
import { useSceneYield } from "@/components/RailShade";
import { ageWords } from "@/src/util/relativeAge";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

// THE VITALS BAND — the bottom instrument lane (2026-08-30, replacing the bar's vitals region;
// docs/superpowers/plans/2026-08-30-vitals-bottom-band.md). One slim full-width row of read-only
// info cards, per 3D view: hyper leads with a composition DONUT (the four counts are shares of
// one fleet — the one honest home for a donut), geo with its footprint numbers plus a
// nodes-by-country micro-bar row, and the ledger with its two rate cards (number + sparkline)
// beside the declicked tick bar-chart that used to be the LiveStrip.
//
// READ-ONLY BY CONSTRUCTION: the band writes no store state and takes no pointer events at all
// (`pointer-events-none` on the root — the user's rule: "no clicking etc required on any
// visualization here at the bottom"). Every route the old strip's clicks served survives
// elsewhere: the explorer rows and the global card's pager commit ticks.
//
// Colour follows rule 3: micro-charts in structural cyan; the identity hue appears only under a
// committed filter, exactly the strip's old rule — resolved once per band (useVitalsScope) and
// handed to every chart as its `accent` prop. Identity is never colour-alone: every donut
// segment is named by its legend row, every country bar by its code, every rate by its eyebrow
// (dataviz discipline).

// The donut's segment opacity STEPS over the one accent hue (the house device: calm and dim
// variants are the same token at low opacity, never a bespoke tone). Fixed order, fixed step per
// label — a filter that empties a segment must not repaint the survivors.
//
// ⚠️ THE RING'S ALONE. `MicroBars` mirrored this ladder until 2026-09-01, which is what made two
// cards in one row read as two hues — see the MicroBars header. Adjacent arcs of one colour need
// separating; labelled rows separated by their own gaps do not.
const DONUT_STEPS = [1, 0.66, 0.42, 0.24] as const;

// The composition counting (moved home from the retired topbar/Vitals cluster, 2026-08-30 —
// this module is its one consumer now that the phone strip renders the band's own cards).
// Cluster entries are deduped to machines first (a hybrid appears once per cluster it runs),
// then counted by their composition label; the keys are EVERY label the vocabulary can produce,
// so they SUM to the selection.
export function compositionCounts(
  metaList: { id: string; nodes: NodeInfo[] }[],
  filter: string,
): Record<string, number> {
  const cfg = metagraphById(filter);
  const counts: Record<string, number> = { Hybrid: 0, Consensus: 0, Currency: 0, Data: 0 };
  const isUnlisted = displayNetwork(filter)?.virtual === true;
  const cores = cfg ? metaList.filter((m) => m.id === cfg.id) : isUnlisted ? [] : metaList;
  for (const mg of cores) {
    const machines = new Map<string, NodeInfo>();
    for (const n of mg.nodes) {
      const k = machineKey(n.ip, n.id ?? JSON.stringify(n)); // THE dedup key — one home with compositionGroups
      if (!machines.has(k)) machines.set(k, n);
    }
    for (const row of compositionRows([...machines.values()]))
      if (row.label in counts) counts[row.label]! += row.count;
  }
  return counts;
}

/** ⚠️ A PER-HOUR RATE CLAIMS THE PRESENT TENSE BY ITS OWN UNITS, so it is only sayable while
 *  something actually arrived within the hour it is counting (user, 2026-09-01: "why does BIOFI (no
 *  identified nodes) say it has 358 snapshots/hour? looks wrong"). It did: BIOFI stopped producing
 *  on 2026-08-16, and the buffer still held its final snapshots — made quickly, so a short span
 *  over a full buffer extrapolated to a confident rate that was two weeks out of date.
 *
 *  The threshold is the unit, not a taste: `/hour` needs a sample inside the hour. Past that the
 *  card states WHEN it last saw one, which is the real fact and the more useful one — a chain that
 *  has stopped is exactly what a reader wants told, and "0/hour" would answer a question they did
 *  not ask while hiding the date. */
const RATE_STALE_MS = 3600_000;
function staleFor(a: Activity | null | undefined): number | null {
  return a && a.staleMs != null && a.staleMs > RATE_STALE_MS ? a.staleMs : null;
}
/** The visible face of the extrapolation basis — "last ~6 min", not a bare "~6 min" (user,
 *  2026-09-04: "what does ~6 min mean?" — the app's own designer had to ask, because the full
 *  sentence below is sr-only and the sighted fragment carried no label). "last" is the one word
 *  that makes it self-explanatory: a rate over the LAST N minutes is the live window the app
 *  holds (the rolling snapshot buffer — boot backfill + live ticks, capped at POLL.maxSnapshots),
 *  measured first-to-last timestamp rather than assumed (api.getActivity's note). */
function windowSpan(a: Activity): string {
  const mins = a.spanHr * 60;
  return mins < 1 ? `last ${Math.round(mins * 60)}s` : `last ~${Math.round(mins)} min`;
}
function windowNote(a: Activity | null | undefined, unit: string): string | undefined {
  if (!a) return undefined;
  return `Rate extrapolated from ${a.samples} ${unit} over the ${windowSpan(a)} — the live window of snapshots the app holds.`;
}

/** The band's one cell recipe: a quiet plate (spineless — cards carry no resting edge signal),
 *  eyebrow in the bar's own caps register, body below. A GROWING card is `flex-1 basis-0` so the
 *  row distributes evenly across the full width (user, 2026-08-30 — a centred clump read as
 *  leftover; equal cards read as one designed instrument strip); a wider instrument passes its
 *  own flex via className, and a card whose content cannot spend width opts out with `grow`.
 *
 *  A band card in TWO SEGMENTS: the LEAD (the headline total this card exists to say) and the
 *  DETAIL (its breakdown), divided by a hairline (user pick, 2026-09-01 — over spacing alone).
 *
 *  ⚠️ EVERY CARD TAKES AN EQUAL SHARE OF THE PLATE (user, 2026-09-13: "instead of S/M/L type of
 *  vitals card sizes, just make use of the width available in the bottom section and spread
 *  evenly"). This replaces a three-tier `size` vocabulary (sm/md/lg, 2026-09-01) that in turn
 *  replaced six hand-picked flex values — each round tuned how EAGERLY a card took leftover
 *  width, and each left a different card looking starved beside a bloated neighbour, because a
 *  tier is a guess about content made once and then read at every viewport.
 *
 *  An equal share is not a guess: the plate is divided by the number of cells the view has, and
 *  the row reads as one instrument lane rather than as sections that each negotiated their own
 *  width. `basis-0` is what makes it EQUAL — with the old `auto` basis a card's content set its
 *  starting width and the share only divided the surplus, which is why a one-number roster and a
 *  32-bar chart could never sit in comparable columns.
 *
 *  ⚠️ A CARD MAY STILL CLAIM A FLOOR, and that is not a tier returning: `min-w` on a chart cell
 *  says "below this I am not readable at all", which binds only on a squeezed row and is silent
 *  at every width where the even split has room. The equal share decides the LAYOUT; a floor
 *  only refuses to disappear.
 *
 *  Either segment may stand alone: lead-only (geo's NODES), detail-only (NETWORK LAYERS, and
 *  PulseStrip's poll cards, which pass no lead). The divider draws only when both are present. */
export function BandCard({ label, children, className, mark, lead, aside, title }: { label: string; children?: React.ReactNode; className?: string; mark?: React.ReactNode; lead?: React.ReactNode; aside?: React.ReactNode; title?: string }) {
  return (
    // `title` is for a caveat that qualifies the READING and has nowhere else to sit: the eyebrow
    // is a label, the aside is the window, and the sr-only note is by definition invisible. The
    // fees-collected card is its first consumer — its number is a floor, and rule 10 says a
    // lower bound has to be reachable, not merely true.
    <div title={title} className={cn(
      // The plate is the COMMAND BAR's own glass (`--topbar-glass` — a gradient token, so the
      // arbitrary-property form per CSS trap 3): the band is that bar's sibling instrument, and
      // the earlier `bg-card/40` was tuned under light and sat near-invisible over the dark
      // scene's glow (user, 2026-08-30: "in dark the card needs a bit more contrast").
      "flex rounded-lg border border-border/60 [background:var(--topbar-glass)] backdrop-blur-sm px-3 py-1.5 min-w-0",
      // `1 1 0` — an EQUAL share of the plate, not a share of the surplus. `min-w-0` above is
      // what lets it actually reach that share: without it a card's widest child (usually the
      // LABEL, not the reading) pins the column, which is how "Metagraphs anchoring" once held
      // 305px of a 684px row. Shrinking, it truncates its eyebrow and yields.
      "flex-1 basis-0",
      className,
    )}>
    {/* No content ceiling any more: a cell's share IS its designated space now, so the content
        simply fills it. The cap + `mx-auto` pair existed to centre content inside an over-wide
        tier (2026-09-01) — an equal split has no over-wide tier to correct for. */}
    <div className="flex flex-col gap-1 w-full min-w-0">
      <span className="flex items-center gap-1.5 leading-none min-w-0">
        {mark}
        {/* TRUNCATE, not `whitespace-nowrap`: at 760px "Metagraphs anchoring" clipped mid-glyph
            with no ellipsis (user, 2026-09-01: "in some screen sizes it overflows"), which reads
            as a rendering fault rather than as a shortened label. */}
        <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground truncate leading-none">{label}</span>
        {/* The eyebrow's right-aligned companion — CardHead's aside pattern reaching the band
            (user, 2026-09-08: the rate cards' window words moved here from beside the chart, so
            the line spends the whole body). Muted, natural case (a window is words, not a
            label), flex-none so the LABEL is what truncates when the card is tight. */}
        {aside != null && <span className="ml-auto flex-none text-micro text-muted-foreground whitespace-nowrap leading-none">{aside}</span>}
      </span>
      {/* ⚠️ NOT a `@container` (tried and reverted, 2026-09-01). Querying the body's own width to
          drop parts of a cell is the tempting shape, but `container-type: inline-size` also
          CONTAINS that width — the body stops contributing an intrinsic size, and every
          content-sized card (`grow={false}`, and every card in the phone strip) would then be
          measured on its eyebrow alone. The band's cells adapt by flex rules instead. */}
      {/* `items-stretch`, so an instrument can CLAIM the card's height rather than floating in the
          middle of it (user, 2026-09-01: "a lot of empty at the top and bottom"). Every child still
          decides for itself: the lead centres its own content, the divider was already stretching,
          and inside the detail the charts stretch while a note keeps its `self-end`. Since the band
          went to a fixed --vitals-h the leftover was showing up as dead bands above and below every
          reading — a taller instrument is also a more legible one. */}
      <div className="flex items-stretch gap-2 min-h-0 flex-1 min-w-0">
        {lead != null && <span className="flex items-center flex-none">{lead}</span>}
        {lead != null && children != null && (
          <span aria-hidden className="flex-none self-stretch w-px my-0.5 bg-border/60" />
        )}
        {children != null && <div className="flex items-center gap-2 flex-1 min-w-0">{children}</div>}
      </div>
    </div>
    </div>
  );
}

/** The longest a bar may run, whatever width the card was given (user, 2026-09-01: "the largest
 *  vitals just have very long details (horizontal bars) which can also just be a bit shorter").
 *  Past this the bar stops being a comparison and becomes a rule across the plate; the leftover
 *  collects BEFORE the block, which `justify-end` then pins against the card's right edge. */
const BAR_TRACK_MAX = 150;

/** A row of labelled micro horizontal bars (the geo country / provider / layer read) — one
 *  measure, one hue, widths on the row max, every bar named (identity never colour-alone).
 *
 *  ⚠️ ONE WEIGHT FOR EVERY BAR, and the reason is worth keeping. These rows used to mirror the
 *  donut's per-segment opacities (`steps`) so a ring standing beside them had a key — but only the
 *  cards WITH a ring passed them, so `Node composition` ran bright→faint next to `Network layers`
 *  running flat, and two cards in one row read as two different hues of one token (user,
 *  2026-09-01). The ladder stays where it earns its keep: on the DONUT, whose slices are adjacent
 *  arcs of a single colour and genuinely need separating. A bar row does not — every row is NAMED,
 *  and the ring's slices are in the same order, which is how a legend works. */
export function MicroBars({ rows, accent, labelW = 26, dashZero }: { rows: { key: string; label: React.ReactNode; count: number; hue?: string }[]; accent: string; labelW?: number; dashZero?: boolean }) {
  // ⚠️ THE CALLER'S ORDER STANDS — see `Donut` for the full reasoning. In short: a magnitude sort
  // here would re-shuffle the structural cards (type, composition, layers) every time the subject
  // changes, and a row that moves cannot be followed; the ranked cards already arrive sorted from
  // their builders. Ordering is a property of the DATA, not of this component.
  // Same rule as the sparkline: a breakdown with no rows YET says so rather than rendering an
  // empty block. A row whose count is 0 is a reading and still draws (its numeral, no bar).
  if (rows.length === 0) {
    return <span className="flex items-center self-stretch text-micro text-muted-foreground">acquiring…</span>;
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    // `justify-evenly` over the full height rather than a fixed gap: a four-row card already
    // filled its body, but a two-row one sat as a small block with 15px of dead space above and
    // below. Distributed, the rows breathe into whatever height the card has and a four-row card is
    // left within a pixel of where it was.
    <div className="flex flex-col justify-evenly self-stretch w-full min-w-0">
      {rows.map((r) => (
        // LEFT-ALIGNED, so the breakdown starts immediately after the card's hairline (user,
        // 2026-09-01: "some vitals are not correctly left aligned"). Right-pinning was tried first
        // — it lines the values up on the card's own right edge, which is tidy in isolation — but
        // with the track capped, each card's leftover lands as a DIFFERENT gap behind its block, so
        // three cards of identical width started their breakdowns at 101 / 91 / 101px and the row
        // read ragged. Alignment across the row beats alignment within one card. The values still
        // line up with EACH OTHER inside a card, because every row shares one label column and one
        // capped track; the leftover simply collects at the right, where nothing has to line up
        // against it.
        <span key={r.key} className="flex items-center gap-1.5 min-w-0">
          {/* NO uppercase transform: the layer codes are ONE vocabulary (L0/cL1/dL1 — case is
              part of the code) and provider names are names; country codes arrive uppercase.
              `0 1 <labelW>px` rather than a hard width: on a narrow card the label SHRINKS into
              its ellipsis instead of pushing the bar track out of the plate. */}
          <span className="text-micro text-muted-foreground truncate leading-none" style={{ flex: `0 1 ${labelW}px` }}>{r.label}</span>
          {/* THE TRACK IS THE CARD'S OWN WIDTH, never a 72px constant (user, 2026-09-01) — but
              never longer than BAR_TRACK_MAX either. The fixed track made every bar row
              intrinsically sized, so a wide card left its slack dangling to the right of the
              numbers; a proportional bar spends that width instead. The cap is the other end of
              the same judgement: a bar running the width of a 1600px row stops reading as a
              quantity.
              A ZERO DRAWS NOTHING (rule 10, TickBars' own rule): the old 4px floor applied to a
              0 count rendered an empty bucket as small-but-nonzero activity. The floor now
              guards only real counts, and the numeral beside it still states the zero. */}
          {/* The cap is a VAR so a surface can re-declare it: `--bar-track-max` defaults to the
              band's 150px ceiling (a bar spanning a 1600px row stops reading as a quantity), and
              the phone vitals SHEET sets it to none — there the cards are a 370px full-width
              column, the ceiling's void lands mid-card, and a track that fills the middle is
              what keeps label → bar → value one continuous read (user, 2026-09-03). */}
          <span aria-hidden className="flex items-center flex-1 min-w-[16px] h-[5px]" style={{ maxWidth: `var(--bar-track-max, ${BAR_TRACK_MAX}px)` }}>
            {/* `hue` — a row that cannot claim the accent: the "unknown"/"unplaced" buckets take
                the same neutral the tick chart's unattributed segment wears (user, 2026-09-03 —
                a bucket meaning "nothing to read a type/place from" in the accent reads as one
                more member of the vocabulary). */}
            {/* BAR_EASE: the rows persist across polls (stable keys), so a share that moves
                between readings eases instead of snapping — the odometer's principle. */}
            <span className={cn("h-[5px] rounded-full", BAR_EASE)} style={{ background: r.hue ?? accent, opacity: 0.75, width: r.count > 0 ? `${Math.max(2, (r.count / max) * 100)}%` : 0 }} />
          </span>
          {/* Under a COMMITTED scope a 0 is "this network has none of these", not a measurement of
              zero — the dash says so where a numeral would read as a count (kept from the dot-legend
              design this replaced). Unscoped, every row is a real count and prints as one. */}
          {/* THE VALUES ARE A COLUMN, so they align on their DIGITS (user, 2026-09-01 — the
              composition card's "data" row, where 164 / 10 / 11 / 17 mix widths). `flex-none` with
              no width left each numeral its own box, left-packed against the bar, so the ones
              column stepped in and out down the card. A right-aligned floor gives them a shared
              column; `tabular-nums` then holds it exactly, and a wider count simply grows the
              column rather than breaking it. */}
          <span className="font-mono text-micro tabular-nums text-foreground flex-none text-right min-w-[26px]">
            {dashZero && r.count === 0 ? <span className="text-muted-foreground italic opacity-60">—</span> : r.count}
          </span>
        </span>
      ))}
    </div>
  );
}

/** The composition donut — four shares of one fleet as stroke arcs on a single accent hue at
 *  stepped opacities, the total in the hole. Pure SVG, no interaction; 2px surface gaps between
 *  segments (the dataviz spacer rule) via a gap subtracted from each arc. */
/** The ring alone — the number that totals it is `DonutTotal`'s, standing outside at headline
 *  size. Segment opacities come from DONUT_STEPS in entry order, which is also the order the
 *  bar rows beside it are built in — order and label are what key a slice to its row. */
export function Donut({ counts, accent, hues }: { counts: Record<string, number>; accent: string; hues?: Record<string, string> }) {
  // ⚠️ ENTRY ORDER, NEVER SORTED BY SIZE — and the ring is only half the reason. Sorting was
  // tried on 2026-09-01 and withdrawn the same minute: "it does not make sense for structural
  // items like metagraph type and composition; it will look strange when they switch when swiping
  // between metagraphs" (user). That is the tick bars' own rule reaching a second instrument — a
  // slice that re-sorts as the subject changes cannot be followed from one subject to the next,
  // and every donut in this band charts a FIXED VOCABULARY (the four metagraph types, the four
  // composition roles) whose whole value is sitting in the same place every time. The RANKED
  // breakdowns beside them — top countries, top providers — arrive sorted from their own
  // builders, where sorting is the reading rather than a re-shuffle.
  //
  // The pairing makes it stricter still: `DONUT_STEPS[i]` keys a slice's opacity to its POSITION
  // and the bar row beside it is identified by holding the same position, so this order and
  // `MicroBars`' must never be decided separately.
  const entries = Object.entries(counts);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const R = 15.5, C = 2 * Math.PI * R, GAP = 2;
  let acc = 0;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="flex-none -rotate-90">
      {total > 0 &&
        entries.map(([label, n], i) => {
          if (n <= 0) return null;
          const frac = n / total;
          const len = Math.max(0, frac * C - GAP);
          const off = -acc * C;
          acc += frac;
          return (
            <circle
              key={label}
              cx="22" cy="22" r={R}
              fill="none"
              stroke={hues?.[label] ?? accent}
              strokeOpacity={DONUT_STEPS[i] ?? 0.2}
              strokeWidth="6"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={off}
            />
          );
        })}
      {total === 0 && <circle cx="22" cy="22" r={R} fill="none" stroke="var(--border)" strokeWidth="6" />}
    </svg>
  );
}

/** A donut and the number it totals, as one unit.
 *
 *  ⚠️ THE TOTAL IS THE HEADLINE, so it wears the band's own number size and stands OUTSIDE the
 *  ring (user, 2026-08-31: "shouldn't the total be the largest font instead of the smallest?").
 *  It used to sit in the 44px hole at 11px — which made the merge a DEMOTION: the standalone
 *  cards it replaced showed that same figure at headline size, so folding them in shrank the very
 *  number the card exists to lead with, below even its own breakdown values. The hole is now
 *  empty on purpose: the ring carries the shape, the numeral carries the reading. */
export function DonutTotal({ counts, accent, total, className, hues }: { counts: Record<string, number>; accent: string; total: number | null; className?: string; hues?: Record<string, string> }) {
  return (
    <span className={cn("flex items-center gap-2 flex-none", className)}>
      <Donut counts={counts} accent={accent} hues={hues} />
      <span className="font-mono font-bold text-foreground tabular-nums leading-none">
        <Odometer int value={total || null} />
      </span>
    </span>
  );
}

// hyper — the structure cells (3): METAGRAPHS with a by-type stacked bar (networkKind is the
// one home for the type read — "unknown" is the honest word for a 0-node network whose roles
// can't be known), the COMPOSITION donut (whose hole IS the fleet total, so no separate NODES
// card), and the LAYERS' own populations (the shells' vocabulary: how many L0 / cL1 / dL1
// processes run in the selection).
const TYPE_ORDER = ["data", "currency", "data + currency", "unknown"] as const;

/** One type's glyph — "data + currency" is deliberately the data+currency PAIR (no third
 *  metaphor; see METATYPE_ICONS), "hypergraph" the hyper view's own Orbit. */
function TypeGlyph({ t, className, color }: { t: string; className?: string; color?: string }) {
  if (t === "data + currency") {
    return (
      <span aria-hidden className="flex items-center gap-0.5 flex-none" style={color ? { color } : undefined}>
        <METATYPE_ICONS.data className={className} />
        <METATYPE_ICONS.currency className={className} />
      </span>
    );
  }
  const Icon =
    t === "hypergraph" ? VIEW_ICONS.hyper
    : t === "mixed set" ? METATYPE_ICONS.mixed
    : t === "currency" ? METATYPE_ICONS.currency
    : t === "data" ? METATYPE_ICONS.data
    : METATYPE_ICONS.unknown;
  return <Icon aria-hidden className={cn("flex-none", className)} style={color ? { color } : undefined} />;
}

function HyperCells({ accent }: { accent: string }) {
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
function GeoCells({ accent }: { accent: string }) {
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
function LedgerCells({ accent, filter, paused }: { accent: string; filter: string; paused: boolean }) {
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
          Anchors lose nothing by leaving: the roster to the left counts who anchored and the chart
          to the right plots how much, both over this same window. This slot was their third home.
          ⚠️ THE TWO SCOPES ARE NOT EQUALLY EXACT, though, and the card says so. A network's own
          fees are every fee it paid; the summed figure covers only the chains the sampler sees —
          the public catalog — so it is a FLOOR, the same lower bound the snapshot card marks. It
          cannot be silent about that (rule 10), and a caveat about the reading has nowhere to sit
          but the card's title. */}
      {scoped
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
function useVitalsScope() {
  const mode = useStore((s) => s.mode);
  const live = useStore((s) => s.live);
  const filter = useStore((s) => s.filter);
  const accent = (filter !== "all" ? filterAccent(filter) : null) ?? "var(--primary)";
  return { mode, live, filter, accent };
}

/** The one view→cells dispatch — a cell added or gated here reaches desktop and phone in the
 *  same edit, which is the whole point of extracting it. */
function ViewCells({ mode, accent, filter, paused = false }: { mode: string; accent: string; filter: string; paused?: boolean }) {
  return (
    <>
      {mode === "hyper" && <HyperCells accent={accent} />}
      {mode === "geo" && <GeoCells accent={accent} />}
      {mode === "ledger" && <LedgerCells accent={accent} filter={filter} paused={paused} />}
    </>
  );
}

/** The TRENDS LINK — the band's one interactive element (user, 2026-09-08: "some sort of
 *  separate control bar that sets the range + links to the separate trends page"; the range
 *  half retired 2026-09-13). A small tab riding the band's TOP edge in the file-cabinet
 *  vocabulary the Trends page itself uses: the route to the page where the elaborate,
 *  RANGEABLE versions live. It is a fixed SIBLING of the band, not a child — the band's
 *  clip-path would amputate anything protruding past its border box, and the band's
 *  `pointer-events-none` charter stays intact: the cards below remain read-only, and this tab
 *  is the one deliberate exception, OUTSIDE the plate.
 *
 *  ⚠️ UNGATED, IN EVERY VIEW THAT CARRIES THE BAND (user, 2026-09-13). It used to ride
 *  `viewPolicy.vitalsWindows` — right for a range PICKER, whose windowed cells only the ledger
 *  reads, and wrong for the link: /trends is the measured history of the whole network, so the
 *  step down the observation ladder (convention 12) is offered from wherever the band is. It
 *  therefore needs no policy row of its own; the band's own `vitalsLane` gate is its gate. */
const TrendsMark = DOC_ICONS.trends;

/** The Trends route as a LINK (user, 2026-09-08: "should not be part of the button-group, it
 *  should show as a link") — the site row's own link register: primary ink, normal case, the
 *  page's mark. Shared by both presentations (2026-09-08): the desktop band's floating tab and
 *  the phone Vitals sheet's row render ONE component, so a route renamed reaches both in the
 *  same edit — the ViewCells rule, applied to the control. */
function TrendsLink({ className }: { className?: string }) {
  const setDocPage = useStore((s) => s.setDocPage);
  return (
    <button
      type="button"
      onClick={() => setDocPage("trends")}
      title="The measured history behind these vitals — open the Trends page."
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 text-label text-primary/75 hover:text-primary whitespace-nowrap bg-transparent", className)}
    >
      <TrendsMark aria-hidden className="size-3.5" />
      Trends
    </button>
  );
}

function TrendsRim({ yielding, hidden }: { yielding: boolean; hidden: boolean }) {
  return (
    <div
      style={{ right: "var(--bar-margin)", bottom: "calc(var(--footer-h, 0px) + var(--vitals-h) + 6px)" }}
      // The tab rides the band's own exit (2026-09-13): it is furniture ON the lane's top edge,
      // so it leaves through the bottom with it rather than fading on its own account.
      data-hidden={hidden ? "" : undefined}
      className={cn(
        "band-shade",
        // The pill survived the range group's retirement (user, 2026-09-13) — it is what makes
        // the link read as a thing you touch rather than a caption over the plate. Its hairline
        // is PRIMARY-TINTED, not the cards' neutral: cyan is the app's one affordance signal,
        // so a cyan-edged pill among neutral-edged plates reads as the affordance.
        "fixed z-10 flex items-stretch h-[26px] p-0.5 rounded-full border border-primary/25",
        "[background:var(--topbar-glass)] backdrop-blur-sm",
        "[transition:opacity_300ms_ease,transform_300ms_ease] motion-reduce:!transition-none",
        yielding && "opacity-40",
      )}
    >
      <TrendsLink />
    </div>
  );
}

/** The band. Mounted by BottomStream (per viewPolicy.vitalsLane + scene pose + rails visible);
 *  this component reads the mode only to pick which view's cells to lay out. */
export default function VitalsBand({ hidden = false }: { hidden?: boolean }) {
  const { mode, live, filter, accent } = useVitalsScope();
  // The band does NOT inset by the tablet sheets any more (user, 2026-09-04 — "the bottom bar
  // should behave the same as the top bar; the collapsible card panels go over the bar instead
  // of pushing it smaller"). The 2026-09-04 tablet pass had it reflowing by the sheets' measured
  // sceneCover; reversed the same day: the sheets OVERLAY both bars now, and a partially covered
  // read-only card is the same accepted cost the command bar already pays. `sceneCover` itself
  // stays published — the callout's placement still reads it.
  // The band steps back with the rails while the user's hand is on the camera (user, 2026-08-30)
  // — the same one read the RailShade dims on, at the recipe's own tempos (away 0.3s, the return
  // faster: it answers a gesture already finished).
  const yielding = useSceneYield();
  // THE BAND NEVER PAINTS UNDER AN OPEN SHEET (user, 2026-09-04 — "sometimes I see flickering
  // when the explore and bottom bar overlap"). The overlay decision above stands: the sheets
  // cover the band. But the sheet's glass is translucent, so a band that kept PAINTING under
  // it bled through — a steady shimmer as its numbers tick beneath the frost, and a full
  // double-exposure whenever the yield dim drops the sheet to 0.4 (screenshot-caught: the
  // band's METAGRAPHS rows interleaved with the explore card's). The paint is clipped by the
  // sheets' own published covers instead — the same `sceneCover` channel the callout reads —
  // with the --bar-margin arithmetic left to CSS max(), and the clip rides the band's own
  // 300ms edge transition so it tracks the sheet's slide. Desktop and phone publish 0 cover,
  // so the inset collapses to identity there.
  const coverL = useStore((s) => s.sceneCoverL);
  const coverR = useStore((s) => s.sceneCoverR);
  return (
    <>
      <TrendsRim yielding={yielding} hidden={hidden} />
      <section
      id="vitalsband"
      aria-label="View vitals"
      style={{
        ["--cover-l" as string]: `${coverL}px`,
        ["--cover-r" as string]: `${coverR}px`,
      }}
      // The SCENE toggle's exit (2026-09-13): the band leaves through the BOTTOM edge it lives
      // against, the way each rail leaves through its own — see the `.band-shade` recipe. It
      // stays MOUNTED while hidden (BottomStream's two gates), because a component that
      // unmounts has no exit to animate.
      data-hidden={hidden ? "" : undefined}
      className={cn(
        "band-shade",
        // pointer-events-none: the band is a read-only instrument — orbit drags pass through it.
        // --bar-margin, THE COMMAND BAR'S OWN INSET (globals.css), so the two bars bracket the
        // scene as a matched pair. At desktop it resolves to --rail-margin, which keeps the band's
        // edges aligned with the rail cards and off the RailThread rulers living in that gutter
        // (user, 2026-08-30: the band "sits on top of the rail of the side panels"); on TABLET the
        // rails are edge tabs, so there is nothing to align with and the lane takes the wider inset
        // instead (user, 2026-09-01).
        // A FIXED HEIGHT, not content height (--vitals-h; see its token note). `items-stretch`
        // below then makes every card in every view exactly this tall, so switching views moves
        // nothing at this edge. The PHONE strip does not take it — that presentation is a scrolling
        // row inside the command bar, sized by its own rules.
        // FLUSH onto the footer strip (user, 2026-09-04 — "the space between the two is just
        // noise"): the band's bottom edge sits directly on the footer's top edge, so the two
        // read as one instrument in two rows — the lit plate above, the flat veil underline
        // below, distinguished by the transparency difference the two glass tokens already
        // carry. The old +4px air gap is gone.
        "fixed z-10 inset-x-[var(--bar-margin)] bottom-[var(--footer-h,0px)] h-[var(--vitals-h)] pointer-events-none",
        // ⚠️ THE PLATE IS THE LANE'S, NOT EACH CARD'S (user, 2026-09-01: the band "feels ununiform
        // between screens because the amount of screen space they claim depends on the number of
        // vitals and the size"). Measured at 1600px: hyper and geo hold 1096px of a 1548px lane
        // while the ledger holds 1482, so switching views moved the band's own left edge 193px —
        // the CONTENTS varied, which is honest, but so did the instrument containing them, which
        // is not. One plate makes the lane constant by construction: only the divisions inside it
        // move, and the leftover reads as quiet plate rather than as a row that failed to fill.
        //
        // It is the COMMAND BAR's plate, deliberately — same `--topbar-glass`, same `--bar-margin`,
        // same radius — so the two bars now bracket the scene as an actual matched pair rather than
        // as a bar and a scattering of chips (user, 2026-09-01: "the bottom bar should be the same
        // exactly as the top bar").
        "rounded-lg border border-border/60 [background:var(--topbar-glass)] backdrop-blur-sm",
        "[clip-path:inset(0_max(0px,calc(var(--cover-r)-var(--bar-margin)))_0_max(0px,calc(var(--cover-l)-var(--bar-margin))))]",
        // ⚠️ The cell-targeting rules (card flattening, section dividers) moved ONTO the
        // RollSwap wrapper below (2026-09-04, the no-pop swap): they are `[&>*]` selectors, and
        // the wrapper between this section and the cells would otherwise be their new subject.
        // Their rationale lives at the wrapper. Layout stays here; the wrapper centres WITHIN it.
        "flex items-stretch px-1.5 py-1",
        // ⚠️ ONE transition statement, as an arbitrary PROPERTY. Utility pairs here silently
        // eat each other: twMerge groups every `transition-*` class, so the old
        // `transition-[left,right]` line was DROPPED by the later `transition-opacity` (found
        // 2026-09-04 while wiring the clip — computed transition-property read "opacity"
        // alone), and the comma'd arbitrary-value form is the DocLayer trap that never
        // compiles. The shorthand carries each property's own tempo: the yield dim's 180ms
        // return, and 300ms for the edges + clip so they track the sheet's slide; the
        // yielding arm's duration-300 overrides all of them to the away tempo while the hand
        // is on the camera. motion-reduce carries `!` — a variant loses to an equal-weight
        // single class on stylesheet order alone (CSS trap 4).
        "[transition:opacity_180ms_ease-out,transform_300ms_ease,left_300ms_ease-out,right_300ms_ease-out,clip-path_300ms_ease-out]",
        "motion-reduce:!transition-none",
        yielding && "opacity-40 duration-300",
        !live && "saturate-[.45]",
      )}
    >
      {!live && <span className="self-center"><NoSignalDot /></span>}
      {/* The no-pop swap (RollSwap): the PLATE persists, the cells roll — and the wrapper takes
          over the row's cell-targeting rules (flatten, dividers, stretch), which is why the
          section above no longer carries them: an element between a `[&>*]` and its subjects
          silently retargets it at the wrapper. */}
      <RollSwap
        swapKey={mode as Mode}
        render={(m) => <ViewCells mode={m} accent={accent} filter={filter} paused={hidden} />}
        className={cn(
          "flex-1 min-w-0 flex items-stretch justify-center gap-0",
          "[&>*]:rounded-none [&>*]:border-0 [&>*]:backdrop-blur-none [&>*]:[background:none]",
          "[&>*+*]:border-l [&>*+*]:border-border/60 [&>*+*]:rounded-none",
        )}
      />
      {/* NO filter-scope hairline (user, 2026-08-30 — removed): unlike the old bar cluster's
          bare numbers, the band's own charts already wear the identity accent under a filter,
          so the scope is stated by the vitals themselves. */}
    </section>
    </>
  );
}

/** The PHONE home of the vitals (user, 2026-09-03 — the dock's third section): the SAME cards,
 *  stacked full-width in the Vitals sheet. This replaces the filter strip's second row
 *  (2026-08-30's option 1), which rode the top bar's grow-downward slot and so appeared under
 *  WHICHEVER strip opened — including the pulse strip, where a row of view vitals had nothing to
 *  do with what was asked for ("it feels confusing as it's not related to the actual dropdown").
 *  The dock parallels the desktop band: vitals live on the bottom edge on every tier. Vertical
 *  because the sheet has height to spend and a stacked read beats a sideways thumb-scroll; the
 *  band's equal horizontal share is overridden — in a column every card takes the sheet's full
 *  width, which is what `[&>*]:flex-none [&>*]:basis-auto` on the wrapper below says. */
export function VitalsSheetBody() {
  const { mode, live, filter, accent } = useVitalsScope();
  return (
    <div
      className={cn(
        "flex flex-col items-stretch min-w-0",
        // The bar tracks fill the column's middle — see MicroBars' `--bar-track-max` note.
        "[--bar-track-max:none]",
        !live && "saturate-[.45]",
      )}
    >
      {!live && <span className="self-center flex-none mb-2"><NoSignalDot /></span>}
      {/* The link, in the sheet's own register (2026-09-08): an in-flow full-width pill at
          thumb height above the cards — the sheet is interactive (unlike the band), so it
          simply sits in the column. Ungated like the desktop tab (2026-09-13). */}
      <div className="flex items-stretch h-10 p-0.5 mb-2 flex-none rounded-full border border-primary/25 [background:var(--topbar-glass)]">
        <TrendsLink className="flex-1 justify-center" />
      </div>
      {/* The no-pop swap — the cell-targeting `[&>*]` rules ride the wrapper for the same
          retargeting reason the band's do (see the desktop section above). */}
      <RollSwap
        swapKey={mode as Mode}
        render={(m) => <ViewCells mode={m} accent={accent} filter={filter} />}
        className={cn(
          "flex flex-col items-stretch gap-2 min-w-0",
          "[&>*]:w-full [&>*]:max-w-none [&>*]:flex-none [&>*]:basis-auto",
        )}
      />
    </div>
  );
}
