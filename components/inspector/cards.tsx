"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { shortHash, CORE_HEX } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { hex, fmtDag, fmtKB } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import type { GlobalSnapshot, MetaCfg, NodeInfo, PickDescriptor } from "@/src/data/types";
import AnchoredTags from "./AnchoredTags";
import Odometer from "@/components/Odometer";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SonarRing, NodeStars, NoSignalDot } from "@/components/state/StateAtoms";
import { useMinHold } from "@/components/useMinHold";
import { VIS } from "../../js/config.js";
import { Desc, StatusMark, CompositionRows, StatusBreakdown, networkKind } from "./parts";
import { compositionRows } from "@/src/data/composition";

type PickOf<K extends PickDescriptor["kind"]> = Extract<PickDescriptor, { kind: K }>;

// ── Card-head pieces (unified head anatomy, Task 13 follow-up) ──────────────────────────────
// Every inspector card's primary TITLE now renders in CardHead's title slot (one standard:
// 15px / semibold), with the bits that used to ride the body title rows in the head's ASIDE
// area. These exports are what InspectorCard feeds CardHead per kind; the bodies below render
// NO title rows of their own.

// Snapshot title: ▦ type-marker (the SAME glyph the top bar uses for the Snapshots view — the
// card head marks speak the view-glyph vocabulary; cyan = a GLOBAL snapshot) + the ordinal. The
// Odometer owns the roll (digit-roll on each live tick), so no CardHead `titleKey` — a keyed
// remount would restart it as a whole-title roll-in instead.
export function SnapshotTitle({ data: d }: { data: GlobalSnapshot }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-primary text-[14px]" aria-hidden>▦</span>
      <Odometer value={d.ordinal} className="text-[15px] font-semibold text-foreground tabular-nums" />
    </span>
  );
}

// Snapshot title-row aside: live-now dot / coarse relative age / the no-signal state.
export function SnapshotAside({ data: d }: { data: GlobalSnapshot }) {
  const latest = useStore((s) => s.latestSnapshot);
  const live = useStore((s) => s.live);
  const isLive = latest != null && d.ordinal === latest.ordinal;
  // Relative recency for an older pick — coarse (freshness, not a ticking clock). Guarded
  // against an unparseable timestamp (→ no age suffix rather than "NaN").
  const rel = relativeAge(Date.now() - Date.parse(d.timestamp));
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
      {!live ? (
        <><NoSignalDot /> no signal</>
      ) : isLive ? (
        <>
          <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_30%,transparent)] animate-breathe motion-reduce:animate-none" />
          {" "}live now
        </>
      ) : (
        <>◷ {rel}</>
      )}
    </span>
  );
}

// Dossier title: the pre-unification header composition (logo avatar ringed in the identity hue
// + the NAME over the TICKER), re-homed INTO CardHead's title slot (user refinement — the head
// unification had split the avatar/ticker off into a body row). The name inherits CardHead's one
// 15px/semibold title standard; the ticker rides under it at its original 11px/hue — the SAME
// treatment for every subject, DAG included (the ticker used to be metagraph-only). Right behind
// the ticker, subtly (muted, smaller — quieter than the ticker), rides the network-type
// descriptor ("data metagraph" / "currency metagraph" / "data and currency metagraph" /
// "hypergraph" for DAG) — reusing the same composition read the old standalone body line derived
// from (`networkKind`, in ./parts), just folded into the ticker row instead of its own line.
// Rolls as a whole via InspectorCard's `titleKey` (keyed on the name, synced with the edge pulse).
export function MetaTitle({ cfg }: { cfg: MetaCfg }) {
  const metaList = useStore((s) => s.metaList);
  const mg = metaList.find((x) => x.id === cfg.id) || null;
  const hue = hex(cfg.color);
  const iconUrl = mg?.iconUrl || cfg.iconUrl; // live metagraph icon, or the core's bundled logo
  const monogram = (cfg.ticker || cfg.name).slice(0, 3).toUpperCase();
  const kind = networkKind(cfg.id, mg?.nodes || []);
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      {/* The logo shows as a clean circular mark — no squared tile (brand icons are round). */}
      <Avatar className="size-[38px] flex-none">
        {iconUrl && <AvatarImage src={iconUrl} alt="" />}
        <AvatarFallback style={{ color: hue }}>{monogram}</AvatarFallback>
      </Avatar>
      <span className="flex flex-col gap-px min-w-0">
        <span className="leading-[1.1]">{cfg.name}</span>
        <span className="inline-flex items-baseline gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold tracking-[0.02em] flex-none" style={{ color: hue }}>{cfg.ticker}</span>
          <span className="text-[10px] font-normal text-muted-foreground truncate">{kind}</span>
        </span>
      </span>
    </span>
  );
}

// The selected node, resolved from the store the same way GeoLiveCard does — shared by the
// head pieces and the body so they can't disagree.
function inspectedNode(inspect: ReturnType<typeof useStore.getState>["inspect"]) {
  return inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode")
    ? inspect
    : null;
}

// The node's resolved place ("City, Country") — "" when geolocation hasn't resolved.
function nodePlace(node: NonNullable<ReturnType<typeof inspectedNode>>): string {
  const g = node.geo;
  return g ? `${g.city ? g.city + ", " : ""}${g.country ?? ""}`.trim() : "";
}

// Node title: ◍ type-marker (the Geography view's top-bar glyph — same view-glyph vocabulary as
// the snapshot head's ▦; identity-hued) + the node's LOCATION ("City, Country" — user-agreed:
// where the node sits is the headline; its hash is bookkeeping, demoted to the subtitle below).
// Fallback when geolocation hasn't resolved: the truncated id (mono) stays the title, no
// subtitle. The roll-in stays keyed on the node ID — the subject's identity, not the title text
// (a new node in the same city still rolls).
export function GeoLiveTitle() {
  const inspect = useStore((s) => s.inspect);
  const node = inspectedNode(inspect);
  if (!node) return null;
  const id = node.node?.id;
  const place = nodePlace(node);
  const title = place || (id ? shortHash(id) : node.node?.ip || "Node");
  const color = node.kind === "metanode" ? (node.meta ? identityHudHex(node.meta.id) : undefined) : CORE_HEX;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {color && <span className="flex-none text-[14px] leading-none" style={{ color }} aria-hidden>◍</span>}
      <span key={id ?? title} className={cn("min-w-0 roll-in", !place && "font-mono tabular-nums break-all")}>{title}</span>
    </span>
  );
}

// Node subtitle: the truncated id — small/muted/mono, under the location title (CardHead's
// `subtitle` slot supplies the standard block styling). Renders ONLY when the location made it
// to the title; in the no-location fallback the id IS the title.
export function GeoLiveSubtitle() {
  const inspect = useStore((s) => s.inspect);
  const node = inspectedNode(inspect);
  if (!node) return null;
  const id = node.node?.id;
  if (!id || !nodePlace(node)) return null;
  return <span className="font-mono tabular-nums">{shortHash(id)}</span>;
}

// Node title-row aside: the status pill.
export function GeoLiveAside() {
  const inspect = useStore((s) => s.inspect);
  const node = inspectedNode(inspect);
  if (!node) return null;
  return <StatusMark state={node.node?.state} />;
}

// A clicked Global L0 snapshot: what it anchored and what it settled (fees/size/rewards). Its
// place in the DAG (◆ + ordinal + live/age) is the card HEAD now (SnapshotTitle/SnapshotAside).
export function SnapshotCard({ data: d }: { data: GlobalSnapshot }) {
  // EXACT totals from the raw L0 snapshot (via RawSnapshotBridge) are the ONLY source for the fee
  // + anchored breakdown — authoritative (the true total, incl. unlisted). If they aren't here yet
  // the tick is simply "reading…" (ACQUIRING); there is no polled-floor fallback. Every selectable
  // tick is inside the L0 node's retention window, so exact always resolves.
  const exact = useStore((s) => s.snapshotExact[d.ordinal]);
  const live = useStore((s) => s.live);
  const lastGoodAt = useStore((s) => s.lastGoodAt);
  const awaitingExact = exact == null;
  const anchored = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : null;
  // Hold the ACQUIRING fee atom for one calm cycle even if the exact read lands sooner, then fade
  // it out (concern #8) — so a fast resolve doesn't blink the twinkling node-stars away.
  const feeHold = useMinHold(awaitingExact);

  // NO SIGNAL — the feed is unreachable. One sonar ring per retry: remounting `SonarRing` via
  // `key={retry}` (bumped on the same cadence as the poll, VIS.pollMs) makes the ring animation
  // itself read as "still retrying", not a static icon.
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (live) return;
    const id = setInterval(() => setRetry((r) => r + 1), VIS.pollMs); // one ring per real poll/retry
    return () => clearInterval(id);
  }, [live]);

  // The title row lives in the card HEAD (SnapshotTitle/SnapshotAside above); the head's inset
  // hairline replaces the old leading Separator.
  if (!live) {
    return (
      <div className="saturate-[.45]">
        <div className="flex items-center gap-3 mt-1.5">
          <SonarRing key={retry} />
          <div className="flex flex-col gap-[3px] text-[11.5px] text-muted-foreground">
            <span>Explorer API: unreachable</span>
            <span>Last good read: {lastGoodAt ? relativeAge(Date.now() - lastGoodAt) : "—"}</span>
          </div>
        </div>
      </div>
    );
  }

  // Hover pairing (synced 3D glow) lives on the OUTER pane (Inspector.CardPane), not here.
  return (
    <div>
      {/* Anchored block (exact share breakdown, or "reading…" until it lands). */}
      <AnchoredTags ordinal={d.ordinal} anchored={anchored} awaiting={awaitingExact} />

      {/* Settlement — the exact fee + measured size + rewards (each an independent fact). While the
          exact read is still in flight (ACQUIRING), the fee row shows twinkling node-stars so the
          cell reserves width; once it lands the real value cross-fades in (animate-resolve-in). */}
      <Separator className="my-2" />
      {/* `|| exact == null` guards a one-render race: when the live tick rolls to a new ordinal,
          `exact` flips back to null on THAT render but useMinHold's `show` only rises in its
          effect on the NEXT one — without the guard this dereferenced `exact.totalFee`. */}
      {feeHold.show || exact == null ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2.5">
            <span className="text-[12.5px] text-muted-foreground">Fees paid</span>
            <span className={cn("flex flex-col items-end text-[13px] text-foreground tabular-nums", feeHold.fading && "animate-hold-fade-out motion-reduce:animate-none")}><NodeStars count={4} /></span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {exact.totalFee > 0 && (
            <div className="flex items-start justify-between gap-2.5">
              <span className="text-[12.5px] text-muted-foreground">Fees paid</span>
              <span className="flex flex-col items-end text-[13px] text-foreground tabular-nums">
                <span className="animate-resolve-in motion-reduce:animate-none whitespace-nowrap"><b className="font-bold">{fmtDag(exact.totalFee)}</b> DAG</span>
                <span className="text-[10.5px] text-muted-foreground">{fmtKB(exact.totalSizeKB)} settled</span>
              </span>
            </div>
          )}
          {exact.rewardsDatum > 0 && (
            <div className="flex items-start justify-between gap-2.5">
              <span className="text-[12.5px] text-muted-foreground">Rewards out</span>
              <span className="flex flex-col items-end text-[13px] text-foreground tabular-nums">
                <span className="animate-resolve-in motion-reduce:animate-none whitespace-nowrap"><b className="font-bold">{fmtDag(exact.rewardsDatum)}</b> DAG</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The metagraph context pane (top-right "context" slot): identity only — description,
// make-up rows, website. Its live/economic counterpart is the top-bar vitals (filter-aware
// "live activity"), so the dossier stays a stable identity card.
export function MetaCard({ cfg }: { cfg: MetaCfg }) {
  const metaList = useStore((s) => s.metaList);
  const mg = metaList.find((x) => x.id === cfg.id) || null;
  const nodes = mg?.nodes || [];
  const blurb = mg?.description || cfg.blurb;
  // The distinct make-ups this metagraph's nodes fall into (same read CompositionRows renders),
  // needed here just for the "N different compositions" count in the section header.
  const compRows = compositionRows(nodes);
  // Hover pairing (synced 3D hub glow) lives on the OUTER pane (ContextCard's #metapane), not here.
  // The full identity header (avatar + name + ticker) lives in the card HEAD now (MetaTitle via
  // CardHead's title slot, rolled via titleKey) — the body starts at the description.
  return (
    <>
      {/* Keyed on the text so the expand state resets when the subject (or its description
          arriving from /api/metagraphs) changes — an expanded DOR must not leak into DED. */}
      <Desc key={blurb} text={blurb} />
      {nodes.length > 0 && (
        <div className="mt-3">
          {/* Section header in the snapshot card's exact bold-lead + muted-tail treatment
              (AnchoredTags): the key figure — "163 nodes" — as a 13px foreground lead with the
              bold number, the addition — "with 3 different compositions" — as the 12px muted
              tail. Singulars handled ("1 node" / "with 1 composition" — no "different"). */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[13px] text-foreground"><b className="font-bold">{nodes.length}</b> node{nodes.length === 1 ? "" : "s"}</span>
            <span className="text-[12px] text-muted-foreground">
              with {compRows.length} {compRows.length === 1 ? "composition" : "different compositions"}
            </span>
          </div>
          <CompositionRows nodes={nodes} />
          {/* ONE aggregate status as the block's ATTACHED footer (user reversal of the per-row
              marks — too busy): right-aligned tight under the last row, reading as part of the
              composition block, in the standard muted count+bullet language (no "all ready"
              special case — StatusBreakdown always shows plain counts now). */}
          <div className="mt-1.5 flex justify-end">
            <StatusBreakdown states={nodes.map((n) => n.state)} />
          </div>
        </div>
      )}
    </>
  );
}

// The dossier's site/explorer link (user-agreed: the footer link row was rarely used and ate a
// full row) — an icon-only ghost ↗ riding the TITLE row's aside slot, pinned FLUSH to the
// card's content edge on the avatar + name + ticker line (the name truncates, the icon doesn't
// move). Flush mechanics (measured): the negative right margin collapses CardHead's aside
// wrapper to zero width AT the title row's `pr-[22px]` inset edge, and the icon's own `w-[22px]`
// box then extends right from there — exactly re-occupying the 22px ×-clearance, so the
// right-aligned glyph ends flush with the card's content edge (the composition counts' column).
// Safe for THIS aside only because the dossier's tall title row sits below the ×; the glyph rides
// `text-primary` (the link-variant Button language, softened at rest) so it reads as a LINK at
// a glance, not muted chrome. Domain in the tooltip/aria-label. Rendered by InspectorCard only
// when the metagraph actually has a siteUrl, so link-less dossiers render no aside at all.
export function MetaSiteAction({ site }: { site: string }) {
  const domain = site.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <Button
      asChild
      variant="ghost"
      size="icon-xs"
      className="size-auto w-[22px] justify-end rounded-md py-1 px-0 -mr-[30px] text-[14px] leading-none cursor-pointer text-primary/70 hover:bg-transparent hover:text-primary dark:hover:bg-transparent"
    >
      <a href={site} target="_blank" rel="noopener noreferrer" aria-label={domain} title={domain}>
        ↗
      </a>
    </Button>
  );
}

// Geography's signature detail card: the **selected node**, picked from the left explorer
// or the globe. The selection's live footprint summary (online / countries / densest) now
// lives in the top-bar vitals, so this card is purely the picked node's facts — or a hint
// to pick one. Reads the node straight from the store, so it tracks any pick.
export function GeoLiveCard() {
  const inspect = useStore((s) => s.inspect);

  const node =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode")
      ? inspect
      : null;

  if (!node) {
    return (
      <p className="text-muted-foreground text-[12px] mt-[2px] mb-0">
        Pick a node from the explorer on the left — or click one on the globe — to inspect it here.
      </p>
    );
  }
  return <GeoLiveNode p={node} />;
}

// The selected-node block. The node's LOCATION + id + status pill are all the card HEAD now
// (GeoLiveTitle/GeoLiveSubtitle/GeoLiveAside above) — the old IP and "Location" body rows are
// gone (the IP entirely, user-agreed; the location because it IS the title). The body is what
// remains that the globe can't show: the node's layer composition. The slot eyebrow reads
// "Selected node"; the × is CardHead's shared close (the outer pane).
function GeoLiveNode({ p }: { p: PickOf<"l0" | "l1" | "metanode"> }) {
  // The single node's roles → a one-node composition row (shared vocabulary).
  const oneNode: NodeInfo[] = p.node ? [p.node] : [];
  // NB: the hover pairing (synced 3D glow) lives on the OUTER pane (Inspector.CardPane), not here,
  // so the glow lights the card's rounded edge.
  return (
    <>
      {/* Composition as a stacked label + block (NOT inside <Row>, whose value is a <span> —
          CompositionRows renders a <div>, so a Row would nest a block in an inline element). */}
      {oneNode.length > 0 && (
        <div className="my-2">
          <span className="text-[10.5px] tracking-[0.1em] uppercase text-muted-foreground">Composition</span>
          <CompositionRows nodes={oneNode} />
        </div>
      )}
    </>
  );
}
