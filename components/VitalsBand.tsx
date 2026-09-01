"use client";

import { useStore } from "@/src/store/store";
import { metagraphById, filterAccent, getAnchor } from "@/src/data/network";
import { displayNetwork } from "@/src/data/unlisted";
import { metaType, rolesOf, IdentityDot, RoleChips } from "@/components/inspector/parts";
import { compositionRows, machineKey } from "@/src/data/composition";
import type { NodeInfo } from "@/src/data/types";
import { identityHudCss } from "@/src/palette/identity";
import { METATYPE_ICONS, VIEW_ICONS } from "@/components/icons";
import { METAGRAPHS } from "@/src/net/current";
import Sparkline from "@/components/Sparkline";
import Odometer from "@/components/Odometer";
import { NoSignalDot } from "@/components/state/StateAtoms";
import { isGlobalActivityScope, type Activity } from "@/src/data/api";
import { POLL } from "@/src/engine/config";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { useSceneYield } from "@/components/RailShade";
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

function windowSpan(a: Activity): string {
  const mins = a.spanHr * 60;
  return mins < 1 ? `${Math.round(mins * 60)}s` : `~${Math.round(mins)} min`;
}
function windowNote(a: Activity | null | undefined, unit: string): string | undefined {
  if (!a) return undefined;
  return `Rate extrapolated from ${a.samples} ${unit} over ${windowSpan(a)}.`;
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
 *  ⚠️ `size` IS THE ONE WIDTH VOCABULARY (user, 2026-09-01: "sometimes certain vitals cards are
 *  huge while others are tiny; can we have an agreed small/medium/large size"). It replaced six
 *  hand-picked flex values (1.4 / 1.5 / 1.6 / 1.8 / 2 / auto) that each encoded a guess about one
 *  card's content. Three tiers, and a tier is a claim about WHAT THE CARD IS, not how wide it looked:
 *
 *    sm — states ONE reading and has no breakdown to spend width on (geo's NODES, the anchoring
 *         roster, hyper's single-characteristic type card). Sizes to its content.
 *    md — a reading AND its breakdown, or a rate and its sparkline. The row's default.
 *    lg — a chart that genuinely reads better wide (the ledger's tick bars).
 *
 *  Every tier keeps an `auto` BASIS, never `basis-0`: a share computed with no reference to the
 *  card's content is what clipped the rate cards' extrapolation note off the plate at tablet width.
 *  A card asks for what it needs first, and grows from there by its tier's weight.
 *
 *  Either segment may stand alone: lead-only (geo's NODES), detail-only (NETWORK LAYERS, and
 *  PulseStrip's poll cards, which pass no lead). The divider draws only when both are present. */
export type BandCardSize = "sm" | "md" | "lg";

/** The tier→flex table. `auto` basis throughout (see the note above); only the GROW weight differs,
 *  so a tier says how eagerly a card takes leftover width, never how wide it starts. */
/** ⚠️ THE CEILING IS WHAT MAKES A TIER A TIER. Without it every `md` card grows to fill whatever
 *  the viewport gives it, and at 1600px three of them each held ~500px — a lead pinned left, a
 *  capped bar block pinned right, and a void between the two (the very "huge cards" complaint the
 *  scale exists to answer). The grow weight decides who takes leftover width; the ceiling decides
 *  when everyone stops taking it and the row simply ends. */
/*  ⚠️ THE CEILING MOVED OFF THE BOX AND ONTO THE CONTENT (user, 2026-09-01: "can we align the
 *  vitals sections in the center of its designated space on the bottom bar?"). With the cap on the
 *  BOX, a capped row stopped short of the plate and the whole group centred as one clump — so all
 *  the leftover collected at the two ENDS and hyper's three sections began 234px into a bar they
 *  were supposed to divide. The box now takes its share of the plate and the CONTENT is capped and
 *  centred inside it, which is what "its designated space" means: the slack is distributed between
 *  the sections instead of banked outside them, and every card still refuses to stretch its own
 *  lead and breakdown apart (the ceiling's original job, unchanged).
 *
 *  ⚠️ THE BASIS STAYS `auto` ON BOTH HALVES. A share computed with no reference to the card's
 *  content is what clipped the rate cards' extrapolation note off the plate at tablet width; with
 *  an auto basis a squeezed row simply has no surplus to hand out and every box falls back to its
 *  content width, which is exactly the pre-plate behaviour. */
/** The tier→flex table for the BOX. An equal `1 1 0` share per section was tried and withdrawn
 *  the same minute (user, 2026-09-01: "the 1/3rd rule can't apply based on vitals card count") —
 *  a plate cut into N identical columns gives a one-number roster the same room as a 32-bar chart
 *  and squeezes the chart to pay for it, and N changes per view. The tier still says how eagerly a
 *  card takes LEFTOVER width, and `auto` basis throughout means it asks for what it needs first —
 *  the rule that keeps a squeezed row from clipping the rate cards' extrapolation note. */
const BAND_SIZE: Record<BandCardSize, string> = {
  sm: "flex-initial",            // 0 1 auto — content-sized, and still shrinks when tight
  md: "flex-auto",               // 1 1 auto
  lg: "flex-[2_1_auto]",
};

/** …and the cap the tier puts on its CONTENT, centred in whatever share the row gave it. */
const BAND_CAP: Record<BandCardSize, string> = {
  sm: "max-w-[240px]",
  md: "max-w-[360px]",
  lg: "max-w-[560px]",
};

export function BandCard({ label, children, className, mark, lead, size = "md" }: { label: string; children?: React.ReactNode; className?: string; mark?: React.ReactNode; lead?: React.ReactNode; size?: BandCardSize }) {
  return (
    <div className={cn(
      // The plate is the COMMAND BAR's own glass (`--topbar-glass` — a gradient token, so the
      // arbitrary-property form per CSS trap 3): the band is that bar's sibling instrument, and
      // the earlier `bg-card/40` was tuned under light and sat near-invisible over the dark
      // scene's glow (user, 2026-08-30: "in dark the card needs a bit more contrast").
      "flex rounded-lg border border-border/60 [background:var(--topbar-glass)] backdrop-blur-sm px-3 py-1.5 min-w-0",
      // ⚠️ `sm` is `flex-initial` (0 1 auto), NOT `flex-none`: a content-sized card must still
      // SHRINK when the row is tight, or its widest child — which is usually the LABEL, not the
      // reading — pins it. "Metagraphs anchoring" held 305px of a 684px tablet row that way,
      // starving the two rate cards beside it; shrinking, it truncates its eyebrow and yields.
      BAND_SIZE[size],
      className,
    )}>
    {/* THE CAPPED, CENTRED CONTENT. `mx-auto` is what puts a section in the middle of its own
        share rather than at the left of it; `w-full` keeps it filling that share up to the cap,
        so nothing changes at the widths where there is no surplus to centre within. */}
    <div className={cn("flex flex-col gap-1 w-full min-w-0 mx-auto", BAND_CAP[size])}>
      <span className="flex items-center gap-1.5 leading-none min-w-0">
        {mark}
        {/* TRUNCATE, not `whitespace-nowrap`: at 760px "Metagraphs anchoring" clipped mid-glyph
            with no ellipsis (user, 2026-09-01: "in some screen sizes it overflows"), which reads
            as a rendering fault rather than as a shortened label. */}
        <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground truncate leading-none">{label}</span>
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
export function MicroBars({ rows, accent, labelW = 26, dashZero }: { rows: { key: string; label: React.ReactNode; count: number }[]; accent: string; labelW?: number; dashZero?: boolean }) {
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
          <span aria-hidden className="flex items-center flex-1 min-w-[16px] h-[5px]" style={{ maxWidth: BAR_TRACK_MAX }}>
            <span className="h-[5px] rounded-full" style={{ background: accent, opacity: 0.75, width: r.count > 0 ? `${Math.max(2, (r.count / max) * 100)}%` : 0 }} />
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
export function Donut({ counts, accent }: { counts: Record<string, number>; accent: string }) {
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
              stroke={accent}
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
export function DonutTotal({ counts, accent, total, className }: { counts: Record<string, number>; accent: string; total: number | null; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 flex-none", className)}>
      <Donut counts={counts} accent={accent} />
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
  const { counts, types, layers } = useMemo(() => {
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
    for (const m of layerScope) {
      const seen = new Set<string>();
      for (const n of m.nodes) {
        const k = machineKey(n.ip, n.id ?? JSON.stringify(n)); // one home with compositionCounts/compositionGroups
        if (seen.has(k)) continue;
        seen.add(k);
        for (const r of rolesOf(n)) if (r in layers) layers[r]!++;
      }
    }
    return { counts, types, layers };
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
    { key: "l0", label: <RoleChips codes={["L0"]} />, count: layers.l0! },
    { key: "cl1", label: <RoleChips codes={["cL1"]} />, count: layers.cl1! },
    { key: "dl1", label: <RoleChips codes={["dL1"]} />, count: layers.dl1! },
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
        lead={<DonutTotal counts={types} accent={accent} total={TYPE_ORDER.reduce((n, t) => n + types[t]!, 0)} />}>
        {/* THE COMPOSITION CARD'S OWN SHAPE (user, 2026-08-30: "the same design (1 total value +
            4 subsets) — the one used for node composition looks best"): the two cards are sibling
            share-of-whole readings, so they wear one donut + dot-legend design. The type GLYPHS
            keep their home on the filtered face, where the card states a single characteristic. */}
        <MicroBars accent={accent} labelW={58}
          rows={TYPE_ORDER.map((t) => ({ key: t, label: t === "data + currency" ? "both" : t, count: types[t]! }))} />
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
        <MicroBars accent={accent} labelW={56} rows={[
          { key: "located", label: "located", count: located },
          { key: "unplaced", label: "unplaced", count: Math.max(0, total - located) },
        ]} />
      </BandCard>
      {/* "Top countries", not "Nodes by country" (user, 2026-09-01): the card shows the top three
          plus an `other` remainder, so the old name promised the whole distribution and the row
          beside it now states the fleet total anyway.
          The hole counts COUNTRIES, the ring spreads NODES across them — two different questions,
          which is why the centre is passed rather than left as the sum. */}
      {topCountries.length > 0 && (
        <BandCard label="Top countries"
          lead={<DonutTotal counts={countryRing} accent={accent} total={countries.length} />}>
          {/* `items-stretch` + `self-stretch`: this wrapper sits between the card body and the
              MicroBars, so without it the rows distribute inside a content-height box and the card
              looks bunched while its neighbours breathe. */}
          <div className="flex w-full items-stretch gap-2 min-w-0 self-stretch">
            <MicroBars accent={accent} labelW={18} rows={topCountries.map((c) => ({ key: c.cc, label: c.cc, count: c.count }))} />
            {restC > 0 && <span className="text-micro text-muted-foreground whitespace-nowrap self-end pb-0.5">+{countries.length - topCountries.length} more · {restC}</span>}
          </div>
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

// The declicked tick bar-chart — the LiveStrip's honesty rules verbatim, minus every
// interaction: filtered, a bar is THAT network's own anchors on its OWN scale in its identity hue,
// empty ticks as honest gaps. Only the newest bar glows.
//
// UNFILTERED IT IS STACKED, one segment per anchoring metagraph in that network's own identity hue
// (user pick, 2026-09-01: every metagraph, always — not a top-N). The bar's HEIGHT is unchanged —
// the tick's total anchors on the window max — so the chart reads exactly as it did at a glance and
// gains WHO underneath. Three rules keep it honest:
//
//   · THE SEGMENTS MUST SUM TO THE BAR. `metaCounts` attributes what the anchor index could
//     identify, which is not always the whole tick, so the shortfall is drawn as its own neutral
//     segment rather than dropped — otherwise the coloured run would silently claim a total it does
//     not account for. Same rule as the donuts' `other`.
//   · A TICK WITH NO ATTRIBUTION IS NOT A TICK WITH NO ANCHORS. If the index carries nothing for a
//     timestamp we still know the count, so the bar draws whole in the accent: "this many anchored,
//     by whom is not known here" — never zero, which would be a different and false claim.
//   · IDENTITY IS NEVER COLOUR-ALONE (dataviz discipline, and the band takes no pointer events so
//     there can be no tooltip). The legend is the METAGRAPHS ANCHORING card standing immediately to
//     the left: the same ids, the same `identityHudCss` hues, named sr-only. The two read from one
//     source — `getAnchor(...).metaCounts` — so a colour in the chart always has a dot beside it.
//
// Order is the CATALOG's, never the per-tick counts: sorting by size would repaint every bar as the
// window shifts, and a segment that changes place tick to tick cannot be followed.
const STACK_ORDER: string[] = METAGRAPHS.map((m) => m.id);
const STACK_SET = new Set(STACK_ORDER);

type Snaps = ReturnType<typeof useSnapshotFeed>["snaps"];
interface StackSeg { key: string; n: number; color: string }

function TickBars({ accent, isMeta, filter, snaps }: { accent: string; isMeta: boolean; filter: string; snaps: Snaps }) {
  const bars = snaps.map((d) => {
    const total = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : 0;
    const mc = getAnchor(d.timestamp)?.metaCounts;
    if (isMeta) return { v: mc?.get(filter) ?? 0, ord: d.ordinal, segs: null as StackSeg[] | null };
    let segs: StackSeg[] | null = null;
    if (mc && mc.size > 0 && total > 0) {
      segs = [];
      let named = 0;
      for (const id of STACK_ORDER) {
        const n = mc.get(id);
        if (n) { segs.push({ key: id, n, color: identityHudCss(id) }); named += n; }
      }
      // A network anchoring that the catalog does not list still anchored — it takes its own hue
      // after the listed ones rather than being folded into the shortfall.
      for (const [id, n] of mc) {
        if (n && !STACK_SET.has(id)) { segs.push({ key: id, n, color: identityHudCss(id) }); named += n; }
      }
      const rest = total - named;
      if (rest > 0) segs.push({ key: "__unattributed", n: rest, color: "var(--muted-foreground)" });
    }
    return { v: total, ord: d.ordinal, segs };
  });
  const max = Math.max(1, ...bars.map((b) => b.v));
  return (
    // Full height, not a fixed 34px: the bars grow from a baseline, so every pixel of card height
    // is resolution the chart can actually spend (user, 2026-09-01).
    <div className="flex items-end justify-end gap-[2px] h-full w-full self-stretch pb-0.5" aria-hidden>
      {bars.length === 0 && <span className="text-micro text-muted-foreground self-center">acquiring…</span>}
      {bars.map((b, i) => {
        const latest = i === bars.length - 1;
        return (
          <span
            key={b.ord}
            // `flex-col-reverse`: segments are written in catalog order and stack UP from the
            // baseline, so the first listed network is the foot of every bar in the window.
            className="flex-1 max-w-[9px] rounded-t-[2px] overflow-hidden flex flex-col-reverse"
            style={{
              // Zero anchors = an HONEST GAP (rule 10, the strip's own rendering carried over
              // exactly): no body at all, never a stub — a 2px tinted mark read as
              // small-but-nonzero activity, precisely the fabricated quantity the filtered
              // sparse-cadence read exists to avoid. The span keeps its flex slot so the
              // window's rhythm (position = time) survives the empty ticks.
              height: b.v > 0 ? `${Math.max(8, (b.v / max) * 100)}%` : "0",
              // A stacked bar's colour comes from its segments; an unattributed one paints whole.
              background: b.v > 0 && !b.segs ? accent : "none",
              opacity: b.v > 0 ? (latest ? 1 : 0.55) : 0,
              boxShadow: latest && b.v > 0 ? `0 0 6px ${accent}` : undefined,
            }}
          >
            {b.segs?.map((sg) => (
              <span key={sg.key} className="w-full flex-none" style={{ height: `${(sg.n / b.v) * 100}%`, background: sg.color }} />
            ))}
          </span>
        );
      })}
    </div>
  );
}

// ledger — the activity cells: the two rates as number + sparkline cards (slot 2 swaps with the
// scope exactly as the bar's vitals did: filtered, "anchors" would be a different quantity, so
// the network's DAG fees show instead), and the tick chart as one wide card.
function LedgerCells({ accent, filter }: { accent: string; filter: string }) {
  const activity = useStore((s) => s.activity);
  // ONE feed subscription for the whole row (review, 2026-08-31 — TickBars and
  // AnchoringNetworks each kept their own duplicate window state and listeners). The FULL
  // retained window is the old strip's own choice: a fixed slice left the wide card's right
  // side empty (user, 2026-08-30 — "a lot of room available to the right").
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots);
  const scoped = !isGlobalActivityScope(filter);
  const cfg = metagraphById(filter);
  const isMeta = !!cfg && filter !== "all" && filter !== "dag";
  const basis = windowNote(activity, scoped ? "snapshots" : "global ticks");
  const rate = (label: string, value: number | undefined, spark: number[] | undefined, note?: string) => (
    <BandCard
      label={label}
      lead={<span className="font-mono font-bold text-foreground tabular-nums whitespace-nowrap"><Odometer value={value} /></span>}
    >
      {/* stretch: the fixed 64px chart left the card's right half empty (user, 2026-08-30).
          It also YIELDS FIRST when the row is tight, and `min-w-0` is how: a sparkline is the only
          part of a rate card that is decoration — the numeral and its extrapolation basis are the
          reading (rule 10) — so it contributes NOTHING to the card's intrinsic width and gives its
          space back before the basis note can be clipped off the plate. That is also what lets the
          tick chart, the row's headline instrument, keep its own 220px floor at tablet width. */}
      {/* `accent`, NOT a hardcoded `var(--primary)` (user, 2026-09-01: the ledger's vitals should be
          "metagraph color-aware — only anchors per global snapshot currently does that"). This was
          the band's own rule already: structural cyan at rest, the identity hue under a committed
          filter, resolved once in useVitalsScope and handed to EVERY chart as `accent`. The donut,
          the bars and the tick chart all took it; the sparkline alone had been wired to the literal,
          so a committed network re-tinted three of the row's four instruments and left this one
          cyan. Not a rule-3 exception — rule 3 forbids repointing the structural TOKEN, and this
          passes an identity hue to a chart, which is what the band has always done under a scope. */}
      {/* `maxPoints`: the retained window is 52 ticks, and 51 segments of a noisy rate over a
          40px-tall line read as hair rather than as a trend (user, 2026-09-01: "too dense, too many
          points"). Bucketed to 20 by mean — the SAME window at a lower frequency, which is what
          keeps it honest against the basis note printed two elements to the right. */}
      <span className="flex-1 min-w-0 self-center"><Sparkline data={spark} color={accent} height={42} maxPoints={20} stretch /></span>
      {/* The extrapolation window, VISIBLE (rule 10): the basis is part of the reading, and the
          band's pointer-events-none root means a title tooltip can never fire — sr-only alone
          left sighted pointer users reading an extrapolated rate as a measured fact. */}
      {activity && <span className="text-micro text-muted-foreground whitespace-nowrap self-end pb-1">{windowSpan(activity)}</span>}
      {note && <span className="sr-only">{note}</span>}
    </BandCard>
  );
  // WHO anchors, HOW MUCH, HOW OFTEN, then the per-tick picture (user ordering, 2026-08-30):
  // the roster leads, the anchor rate beside it, the cadence, and the chart closes the row.
  return (
    <>
      <AnchoringNetworks snaps={snaps} />
      {scoped
        ? rate("DAG fees/hour", activity?.feesPerHour, activity?.feesSeries, basis && `$DAG this network pays to anchor. ${basis}`)
        : rate("Anchors/hour", activity?.anchorsPerHour, activity?.anchoredSeries, basis && `Metagraph snapshots anchored into the global chain. ${basis}`)}
      {rate("Snapshots/hour", activity?.snapsPerHour, activity?.cadenceSeries, basis)}
      <BandCard label="Anchors per global snapshot" size="lg" className="min-w-[220px]">
        <TickBars accent={accent} isMeta={isMeta} filter={filter} snaps={snaps} />
      </BandCard>
    </>
  );
}

// The distinct metagraphs seen anchoring across the retained window — EXACT (the anchor index's
// own id sets, never inferred) — with each network's identity dot: the app-wide identity-dot
// language (a presence roster, not a chart series), names carried sr-only since the band takes
// no pointer events. A committed filter is a LENS: the window-wide fact stands un-edited.
function AnchoringNetworks({ snaps }: { snaps: Snaps }) {
  const ids = new Set<string>();
  for (const d of snaps) {
    const mc = getAnchor(d.timestamp)?.metaCounts;
    if (mc) for (const id of mc.keys()) ids.add(id);
  }
  const list = [...ids];
  return (
    // CONTENT-SIZED (grow=false): the roster is a fixed run of dots, so an equal share of the row
    // left ~200px of empty plate beside five dots — the band's worst offender before 2026-09-01.
    <BandCard
      label="Metagraphs anchoring"
      size="sm"
      lead={<span className="font-mono font-bold text-foreground tabular-nums"><Odometer int value={list.length || null} /></span>}
    >
      <span className="flex flex-wrap items-center gap-1 max-w-[120px]">
        {list.slice(0, 12).map((id) => <IdentityDot key={id} hue={identityHudCss(id)} />)}
      </span>
      <span className="sr-only">{list.map((id) => metagraphById(id)?.name ?? id).join(", ")}</span>
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
function ViewCells({ mode, accent, filter }: { mode: string; accent: string; filter: string }) {
  return (
    <>
      {mode === "hyper" && <HyperCells accent={accent} />}
      {mode === "geo" && <GeoCells accent={accent} />}
      {mode === "ledger" && <LedgerCells accent={accent} filter={filter} />}
    </>
  );
}

/** The band. Mounted by BottomStream (per viewPolicy.vitalsLane + scene pose + rails visible);
 *  this component reads the mode only to pick which view's cells to lay out. */
export default function VitalsBand() {
  const { mode, live, filter, accent } = useVitalsScope();
  // The band steps back with the rails while the user's hand is on the camera (user, 2026-08-30)
  // — the same one read the RailShade dims on, at the recipe's own tempos (away 0.3s, the return
  // faster: it answers a gesture already finished).
  const yielding = useSceneYield();
  return (
    <section
      id="vitalsband"
      aria-label="View vitals"
      className={cn(
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
        "fixed z-10 inset-x-[var(--bar-margin)] bottom-[calc(var(--footer-h,0px)+4px)] h-[var(--vitals-h)] pointer-events-none",
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
        // ⚠️ THE CARDS ARE FLATTENED FROM HERE, not by a prop threaded through every cell. The same
        // `ViewCells` renders the PHONE strip, where the cards scroll and must keep their own
        // plates — a section of a bar that scrolls away from the bar is not a section. An arbitrary
        // variant scopes the flattening to this presentation and leaves that one untouched; it wins
        // on specificity within the same layer, which is the in-layer escape CSS trap 1 describes.
        // `[background:none]` (not `bg-transparent`): the card paints an arbitrary PROPERTY, so the
        // override has to be one too or the gradient survives underneath.
        "[&>*]:rounded-none [&>*]:border-0 [&>*]:backdrop-blur-none [&>*]:[background:none]",
        // The section division: the app's one resting hairline, INSET by the plate's own padding
        // like every other resting division (the card-head rule) — a full-height rule between two
        // sections would read as a seam between two objects, which is what this change undoes.
        "[&>*+*]:border-l [&>*+*]:border-border/60 [&>*+*]:rounded-none",
        // CENTRED INSIDE THE PLATE. The tiers still cap, so a 3-card view leaves slack — it now
        // collects symmetrically inside the instrument instead of around it. (The 2026-08-30 note
        // against a centred clump was written when the cards were small and floated in a very wide
        // bar; sections of a plate are a different object.) Below the ceilings this is a no-op.
        "flex items-stretch justify-center gap-0 px-1.5 py-1",
        "transition-opacity duration-[180ms] ease-out motion-reduce:transition-none",
        yielding && "opacity-40 duration-300",
        !live && "saturate-[.45]",
      )}
    >
      {!live && <span className="self-center"><NoSignalDot /></span>}
      <ViewCells mode={mode} accent={accent} filter={filter} />
      {/* NO filter-scope hairline (user, 2026-08-30 — removed): unlike the old bar cluster's
          bare numbers, the band's own charts already wear the identity accent under a filter,
          so the scope is stated by the vitals themselves. */}
    </section>
  );
}

/** The PHONE home of the vitals (user pick, 2026-08-30 — option 1): the SAME cards, riding the
 *  filter strip's second row as a horizontal scroll instead of a fixed band — the strip is
 *  already where phone vitals live and growing downward is its one mechanism, so no new surface
 *  or vertical space is claimed. Cards go content-sized (`flex-none basis-auto` overrides the
 *  band's even distribution at higher specificity) with a floor so the stretch sparklines have
 *  real width to measure. TopBar gates the row on `vitalsLane` AND on the strip being open. */
export function VitalsStripRow() {
  const { mode, live, filter, accent } = useVitalsScope();
  return (
    <div
      className={cn(
        "flex items-stretch gap-2 overflow-x-auto slim-scroll pb-1 min-w-0 flex-1",
        "[&>*]:flex-none [&>*]:basis-auto [&>*]:min-w-[150px]",
        !live && "saturate-[.45]",
      )}
    >
      {!live && <span className="self-center flex-none min-w-0!"><NoSignalDot /></span>}
      <ViewCells mode={mode} accent={accent} filter={filter} />
    </div>
  );
}
