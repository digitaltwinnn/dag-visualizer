"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/src/store/store";
import { shortHash, CORE_HEX } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { hex, fmtDag, fmtKB } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import type { GlobalSnapshot, MetaCfg, NodeInfo, PickDescriptor } from "@/src/data/types";
import AnchoredTags from "./AnchoredTags";
import Odometer from "@/components/Odometer";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { SonarRing, NodeStars, NoSignalDot } from "@/components/state/StateAtoms";
import { VIS } from "../../js/config.js";
import { Desc, Row, StatusMark, CompositionRows, StatusBreakdown, nodeComposition } from "./parts";

type PickOf<K extends PickDescriptor["kind"]> = Extract<PickDescriptor, { kind: K }>;

// A clicked Global L0 snapshot: its place in the DAG (◆ type-marker + odometer ordinal + live/age
// state), what it anchored, and what it settled (fees/size/rewards).
export function SnapshotCard({ data: d }: { data: GlobalSnapshot }) {
  // EXACT totals from the raw L0 snapshot (via RawSnapshotBridge) are the ONLY source for the fee
  // + anchored breakdown — authoritative (the true total, incl. unlisted). If they aren't here yet
  // the tick is simply "reading…" (ACQUIRING); there is no polled-floor fallback. Every selectable
  // tick is inside the L0 node's retention window, so exact always resolves.
  const exact = useStore((s) => s.snapshotExact[d.ordinal]);
  const latest = useStore((s) => s.latestSnapshot);
  const live = useStore((s) => s.live);
  const lastGoodAt = useStore((s) => s.lastGoodAt);
  const awaitingExact = exact == null;
  const anchored = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : null;
  const isLive = latest != null && d.ordinal === latest.ordinal;

  // Relative recency for an older pick — coarse (freshness, not a ticking clock). Guarded
  // against an unparseable timestamp (→ no age suffix rather than "NaN").
  const rel = relativeAge(Date.now() - Date.parse(d.timestamp));

  // NO SIGNAL — the feed is unreachable. One sonar ring per retry: remounting `SonarRing` via
  // `key={retry}` (bumped on the same cadence as the poll, VIS.pollMs) makes the ring animation
  // itself read as "still retrying", not a static icon.
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (live) return;
    const id = setInterval(() => setRetry((r) => r + 1), VIS.pollMs); // one ring per real poll/retry
    return () => clearInterval(id);
  }, [live]);

  // Shared title row: ◆ type-marker (cyan = a GLOBAL snapshot) + the ordinal (odometer-rolls
  // live), clearing the outer pane's absolute close × on the right.
  const titleRow = (
    <div className="flex items-baseline justify-between gap-2.5 pr-[22px]">
      <span className="inline-flex items-baseline gap-2">
        <span className="text-primary text-xs" aria-hidden>◆</span>
        <Odometer value={d.ordinal} className="text-base font-bold text-foreground tabular-nums" />
      </span>
      {!live ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
          <NoSignalDot /> no signal
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
          {isLive ? (
            <>
              <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_30%,transparent)] animate-breathe motion-reduce:animate-none" />
              {" "}live now
            </>
          ) : (
            <>◷ {rel}</>
          )}
        </span>
      )}
    </div>
  );

  if (!live) {
    return (
      <div className="saturate-[.45]">
        {titleRow}
        <Separator className="my-2" />
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
      {titleRow}

      {/* Anchored block (exact share breakdown, or "reading…" until it lands). */}
      <Separator className="my-2" />
      <AnchoredTags ordinal={d.ordinal} anchored={anchored} awaiting={awaitingExact} />

      {/* Settlement — the exact fee + measured size + rewards (each an independent fact). While the
          exact read is still in flight (ACQUIRING), the fee row shows twinkling node-stars so the
          cell reserves width; once it lands the real value cross-fades in (animate-resolve-in). */}
      <Separator className="my-2" />
      {exact == null ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2.5">
            <span className="text-[12.5px] text-muted-foreground">Fees paid</span>
            <span className="flex flex-col items-end text-[13px] text-foreground tabular-nums"><NodeStars count={4} /></span>
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
  const hue = hex(cfg.color);
  const iconUrl = mg?.iconUrl || cfg.iconUrl; // live metagraph icon, or the core's bundled logo
  const monogram = (cfg.ticker || cfg.name).slice(0, 3).toUpperCase();
  const blurb = mg?.description || cfg.blurb;
  const site = mg?.siteUrl;
  // A metagraph with no currency-L1 has a symbol but no real token — worth noting. Token
  // metagraphs (and the DAG core) already show their ticker in the header, so a foot row
  // repeating it (a redundant "DAG"/"DOR") is dropped.
  const isDataMeta = cfg.id !== "dag" && !nodeComposition(nodes).hasCurrency;
  // Hover pairing (synced 3D hub glow) lives on the OUTER pane (ContextCard's #metapane), not here.
  return (
    <>
      {/* Header — logo avatar ringed in the identity hue + name + ticker. The logo shows as a clean
          circular mark — no squared tile (brand icons are round, so a circle crop sits naturally). */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <Avatar className="size-[38px]">
          {iconUrl && <AvatarImage src={iconUrl} alt="" />}
          <AvatarFallback style={{ color: hue }}>{monogram}</AvatarFallback>
        </Avatar>
        <span className="flex flex-col gap-px">
          <span key={cfg.name} className="text-[15px] font-semibold text-foreground leading-[1.1] roll-in">{cfg.name}</span>
          {cfg.id !== "dag" && <span className="text-[11px] font-semibold tracking-[0.02em]" style={{ color: hue }}>{cfg.ticker}</span>}
        </span>
      </div>
      <Desc text={blurb} />
      {nodes.length > 0 && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[10.5px] tracking-[0.1em] uppercase text-muted-foreground">Composition</span>
            <span className="text-[13px] text-foreground"><b className="font-bold">{nodes.length}</b> node{nodes.length === 1 ? "" : "s"}</span>
          </div>
          <CompositionRows nodes={nodes} />
          <div className="mt-2"><StatusBreakdown states={nodes.map((n) => n.state)} /></div>
        </div>
      )}
      <div className="flex flex-col gap-1 mt-3">
        {isDataMeta && <span className="text-[12px] text-muted-foreground">data metagraph · no token</span>}
        {site && (
          // Metagraph site link, sitting just under the description. A subtle inline link with a
          // trailing ↗, de-emphasised so it doesn't compete with the node-fabric table above.
          <a
            className="flex w-fit max-w-full items-center gap-1 my-2.5 text-[12px] text-primary no-underline overflow-hidden text-ellipsis whitespace-nowrap after:content-['↗'] after:text-[11px] after:opacity-70 hover:underline"
            href={site}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: hue }}
          >
            {site.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}
      </div>
    </>
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

// The selected-node block. Identity-first: the node's ID is the title; the body carries the
// facts you can't see on the globe — status, IP, composition, and where it sits. The slot
// eyebrow already reads "Selected node"; the × is CardHead's shared close (the outer pane).
function GeoLiveNode({ p }: { p: PickOf<"l0" | "l1" | "metanode"> }) {
  const id = p.node?.id;
  const title = id ? shortHash(id) : p.node?.ip || p.geo?.city || p.geo?.country || "Node";
  const color = p.kind === "metanode" ? (p.meta ? identityHudHex(p.meta.id) : undefined) : CORE_HEX;
  // The single node's roles → a one-node composition row (shared vocabulary).
  const oneNode: NodeInfo[] = p.node ? [p.node] : [];
  const g = p.geo;
  const place = g ? `${g.city ? g.city + ", " : ""}${g.country ?? ""}`.trim() : "";
  // NB: the hover pairing (synced 3D glow) lives on the OUTER pane (Inspector.CardPane), not here,
  // so the glow lights the card's rounded edge.
  return (
    <>
      {/* Title line: node id + the status inline (right). */}
      <div className="flex items-center gap-2 mb-2">
        {color && <span className="flex-none w-[9px] h-[9px] rounded-full" style={{ background: color }} />}
        <span key={title} className="text-[13px] font-semibold text-foreground m-0 tabular-nums break-all min-w-0 font-mono roll-in">{title}</span>
        <span className="ml-auto flex-none"><StatusMark state={p.node?.state} /></span>
      </div>
      {/* IP grouped with the identity (muted subtitle under the id), not a labelled row. */}
      {p.node?.ip && <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5 ml-4">{p.node.ip}</div>}
      <Separator className="my-2" />
      {/* Composition as a stacked label + block (NOT inside <Row>, whose value is a <span> —
          CompositionRows renders a <div>, so a Row would nest a block in an inline element). */}
      {oneNode.length > 0 && (
        <div className="my-2">
          <span className="text-[10.5px] tracking-[0.1em] uppercase text-muted-foreground">Composition</span>
          <CompositionRows nodes={oneNode} />
        </div>
      )}
      {place && <Row label="Location">{place}</Row>}
    </>
  );
}
