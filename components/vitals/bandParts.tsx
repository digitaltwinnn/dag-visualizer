"use client";

// THE VITALS BAND'S SHARED PARTS — the plate every cell sits on (`BandCard`) and the three
// micro-instruments the views draw with (`MicroBars`, `Donut`/`DonutTotal`), plus the reading-
// honesty helpers every cell set consults before it prints a rate (`staleFor`, `windowNote`).
//
// Split out of VitalsBand.tsx (2026-09-15), which had grown to hold three unrelated things at
// once: these parts, the three views' CELL SETS, and the band SHELL that arranges them. The seam
// was already marked by the cells' own names, and the parts are the half with consumers outside
// the band entirely — `/design` renders Donut and MicroBars through the REAL components, and the
// pulse strip wears BandCard — which is the clearest sign they are a shared vocabulary rather
// than band internals.
//
// Colour follows rule 3: micro-charts in structural cyan; an identity hue only ever arrives as
// the caller's `accent` prop. Identity is never colour-alone — every donut segment is named by
// its legend row, every bar by its label (dataviz discipline).

import { BAR_EASE } from "@/components/RollSwap";
import { metagraphById } from "@/src/data/network";
import { displayNetwork } from "@/src/data/unlisted";
import { compositionRows, machineKey } from "@/src/data/composition";
import type { NodeInfo } from "@/src/data/types";
import { METATYPE_ICONS, VIEW_ICONS } from "@/components/icons";
import Odometer from "@/components/Odometer";
import { type Activity } from "@/src/data/api";
import { cn } from "@/lib/utils";

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
export function staleFor(a: Activity | null | undefined): number | null {
  return a && a.staleMs != null && a.staleMs > RATE_STALE_MS ? a.staleMs : null;
}
/** The visible face of the extrapolation basis — "last ~6 min", not a bare "~6 min" (user,
 *  2026-09-04: "what does ~6 min mean?" — the app's own designer had to ask, because the full
 *  sentence below is sr-only and the sighted fragment carried no label). "last" is the one word
 *  that makes it self-explanatory: a rate over the LAST N minutes is the live window the app
 *  holds (the rolling snapshot buffer — boot backfill + live ticks, capped at POLL.maxSnapshots),
 *  measured first-to-last timestamp rather than assumed (api.getActivity's note). */
export function windowSpan(a: Activity): string {
  const mins = a.spanHr * 60;
  return mins < 1 ? `last ${Math.round(mins * 60)}s` : `last ~${Math.round(mins)} min`;
}
export function windowNote(a: Activity | null | undefined, unit: string): string | undefined {
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
export const TYPE_ORDER = ["data", "currency", "data + currency", "unknown"] as const;

/** One type's glyph — "data + currency" is deliberately the data+currency PAIR (no third
 *  metaphor; see METATYPE_ICONS), "hypergraph" the hyper view's own Orbit. */
export function TypeGlyph({ t, className, color }: { t: string; className?: string; color?: string }) {
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

