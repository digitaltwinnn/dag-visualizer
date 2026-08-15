"use client";

// The SUBJECT CALLOUT (user, 2026-08-15) — a scene-anchored label naming the committed subject in
// the 3D view itself: an Instrument-Glass mini-panel tied to the subject's rendered position by a
// dashed leader ending in a small identity-hued ring, the same leader language as the ledger's
// ordinal labels. It is a LABEL, not a control (`pointer-events-none` — the subject's controls are
// the rail cards; no ×, by decision: dismissal is the selection's own), and it carries the
// CardHead register at tooltip scale: eyebrow slot noun, title, hued aside, the head hairline,
// one muted lead line with the cards' own RoleChips.
//
// SPLIT OF LABOUR (the spike's conclusion, and the user's own instinct — "furniture can be regular
// threejs object text, subjects more 2d/3d html type of content"): FURNITURE labels are in-scene
// canvas-texture meshes (`makeEdgeLabel` — they bloom on the scene lane and ride shader fades);
// the SUBJECT callout is real HUD DOM, composited crisp over the bloom pass, so it can reuse the
// HUD's tokens and grammar directly. CSS2DRenderer was evaluated and declined: the node chips are
// InstancedMesh instances (nothing to parent a CSS2DObject to), so the per-frame anchor resolution
// must exist in the Engine either way — the renderer would only replace the final projection while
// adding its own overlay container, render pass and a React-portal handshake.
//
// OWNERSHIP: React owns this DOM and its content (from committed store state); the ENGINE owns its
// per-frame placement — `Engine._syncCallout()` projects the subject's rendered anchor and writes
// `transform` + `data-on` straight to `#callout` (the Tooltip discipline: position never triggers
// a React render). `#callout` is therefore a marker contract (CLAUDE.md table) — the wrapper is a
// 0-size ANCHOR at the projected point, and everything inside is laid out relative to it, so the
// engine writes exactly one transform and one flag.
//
// PER-VIEW SUBJECTS (`viewPolicy.callout` gates; the Engine's anchor resolvers mirror this table):
// - hyper: NETWORK-level — the committed metagraph's hub or the DAG core. A committed node keeps
//   its network's callout, matching hyper's own camera answer to a node (one bead on a shell).
//   `unlisted` has no anchor — honest absence, no callout.
// - geo: the finest committed rung with a POINT to point at — node > provider cohort > country.
//   The network rung deliberately shows nothing: a filtered fleet is spread across the globe, and
//   a single anchor would lie about where it is.
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { displayNetwork } from "@/src/data/unlisted";
import { filterAccent } from "@/src/data/network";
import { RoleChips } from "@/components/inspector/parts";
import { useNowTick } from "@/components/useNowTick";
import { relativeAge } from "@/src/util/relativeAge";
import type { GeoInfo } from "@/src/data/types";

// Panel offset from the anchor, up and to the right. The leader spans exactly this diagonal, so
// the three pieces (ring, line, panel corner) stay attached by construction.
const OFF_X = 62;
const OFF_Y = 92;

// The ONE glass container for scene-anchored labels (user, 2026-08-15 — "align the hover and the
// click card"): the hover Tooltip and this callout are the same species — HUD glass tied to a
// scene subject — so they share one surface recipe. Identity never tints the frame; it lives on
// the content (the hued ticker) and the anchor ring, like every card.
export const SCENE_GLASS =
  "rounded-[10px] border border-border px-3 py-2 backdrop-blur-[8px] bg-[var(--panel-solid)]";

// The composition lead line's layer codes — the one layer vocabulary in its fixed order,
// rendered by the cards' own `RoleChips` (user, 2026-08-15: "look at my cards — square pills";
// the pills are THE one rendering for layer codes wherever they appear, this surface included).
function layerCodes(nodes: { roles?: string[] }[]): string[] {
  const has = { l0: false, cl1: false, dl1: false };
  for (const n of nodes) for (const r of n.roles ?? []) if (r in has) has[r as keyof typeof has] = true;
  return (["l0", "cl1", "dl1"] as const)
    .filter((k) => has[k])
    .map((k) => (k === "l0" ? "L0" : k === "cl1" ? "cL1" : "dL1"));
}

// What the panel says — one model, filled per view/rung so the JSX below stays single-sourced.
// `aside.hue` absent = muted (the country card's ISO-code rule: a place carries no identity);
// `aside.live` prepends the beating live dot (the global card's aside state, mirrored).
interface Model {
  key: string;
  eyebrow: string;
  title: string;
  aside?: { text: string; hue?: string; live?: boolean };
  ring: string;
  lead?: { text?: string; codes?: string[] };
}

const geoOf = (p: { kind: string }): GeoInfo | undefined =>
  "geo" in p ? (p as { geo?: GeoInfo }).geo : undefined;

export default function SceneCallout() {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const section = useStore((s) => s.section);
  const metaList = useStore((s) => s.metaList);
  const inspect = useStore((s) => s.inspect);
  const cohort = useStore((s) => s.cohort);
  const country = useStore((s) => s.country);
  const selNodes = useStore((s) => s.selNodes);
  const metaSnap = useStore((s) => s.metaSnap);
  const snap = useStore((s) => s.snap);
  const following = useStore((s) => s.following);
  // The global tick's aside is its AGE, ticking (user, 2026-08-15 — "same as card"):
  // SnapshotAside's two states mirrored as a label — `live · Xs` with the beating dot while
  // following, `◷ Xs` on a pin. The card keeps the BUTTON (follow toggle); this is read-only.
  const now = useNowTick(1000);
  if (!VIEW_POLICIES[mode].callout || section !== "scene") return null;

  let m: Model | null = null;
  if (mode === "hyper") {
    const net = displayNetwork(filter);
    // "all" has no subject; the unlisted set has no 3D anchor (no machines are knowable).
    if (!net || net.virtual) return null;
    const mg = metaList.find((x) => x.id === filter) ?? null;
    const codes = mg ? layerCodes(mg.nodes) : [];
    m = {
      key: `net|${filter}`,
      eyebrow: filter === "dag" ? "Network" : "Metagraph",
      title: net.name,
      // The aside suppresses itself when it only restates the name (the DAG core's ticker IS
      // its name) — a head must not say the same thing twice (the CardHead aside rule).
      aside: net.ticker !== net.name ? { text: net.ticker, hue: net.hue } : undefined,
      ring: net.hue,
      lead: mg ? { text: `${mg.nodes.length} nodes`, codes } : undefined,
    };
  } else if (mode === "geo") {
    const nodePick =
      inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
    const g = nodePick ? geoOf(nodePick) : undefined;
    if (nodePick && g?.lat != null && g.lon != null) {
      // NODE — city-first like the node card; the network ticker is the hued identity aside
      // (node marks carry their node's own network hue), composition as the cards' pills.
      const netId = nodePick.kind === "metanode" ? ((nodePick as { meta?: { id?: string } }).meta?.id ?? null) : "dag";
      const nnet = displayNetwork(netId);
      const codes = layerCodes([{ roles: nodePick.roles }]);
      m = {
        key: `node|${g.lat},${g.lon}`,
        eyebrow: "Node",
        title: g.city ?? g.country ?? "Node",
        aside: nnet ? { text: nnet.ticker, hue: nnet.hue } : undefined,
        ring: nnet?.hue ?? "var(--primary)",
        lead: codes.length ? { codes } : undefined,
      };
    } else if (cohort) {
      // PROVIDER — the provider card's title IS the isp; the city rides muted (a place carries
      // no identity). The ring takes the active filter's accent, like every card-head mark.
      const n = selNodes.filter((r) => {
        const rg = geoOf(r.pick);
        return !!rg && rg.cc === cohort.cc && (rg.city || null) === cohort.city && (rg.isp || null) === cohort.isp;
      }).length;
      m = {
        key: `cohort|${cohort.cc}|${cohort.city}|${cohort.isp}`,
        eyebrow: "Provider",
        title: cohort.isp ?? "Unknown provider",
        aside: cohort.city ? { text: cohort.city } : undefined,
        ring: filterAccent(filter),
        lead: n > 0 ? { text: `${n} nodes` } : undefined,
      };
    } else if (country) {
      // COUNTRY — display name with the ISO code as the muted aside, suppressed when the name
      // is unknown and the title already fell back to the code (the country card's own rule).
      const members = selNodes.filter((r) => geoOf(r.pick)?.cc === country);
      const name = members.map((r) => geoOf(r.pick)?.country).find(Boolean) ?? null;
      m = {
        key: `cc|${country}`,
        eyebrow: "Country",
        title: name ?? country,
        aside: name ? { text: country } : undefined,
        ring: filterAccent(filter),
        lead: members.length > 0 ? { text: `${members.length} nodes` } : undefined,
      };
    }
  } else if (mode === "ledger") {
    // The pinned SNAPSHOT — metagraph snapshot over the global tick (the finer subject wins,
    // like the rail's slot order). Titles are bare ordinals (no `#`, the ordinal rule); the
    // unlisted lane keeps its deliberate neutral gray — identity is not a state.
    if (metaSnap) {
      const nnet = displayNetwork(metaSnap.metaId);
      m = {
        key: `ms|${metaSnap.metaId}|${metaSnap.ordinal}`,
        eyebrow: "Metagraph snapshot",
        title: metaSnap.ordinal.toLocaleString(),
        aside: nnet ? { text: nnet.ticker, hue: nnet.hue } : undefined,
        ring: nnet?.hue ?? "var(--primary)",
      };
    } else if (snap) {
      const rel = relativeAge(now - Date.parse(snap.data.timestamp));
      m = {
        key: `gs|${snap.data.ordinal}`,
        eyebrow: "Global snapshot",
        title: snap.data.ordinal.toLocaleString(),
        aside: following ? { text: rel ? `live · ${rel}` : "live", live: true } : rel ? { text: `◷ ${rel}` } : undefined,
        ring: "var(--core)",
        lead:
          typeof snap.data.metagraphSnapshotCount === "number"
            ? { text: `${snap.data.metagraphSnapshotCount} anchors` }
            : undefined,
      };
    }
  }
  if (!m) return null;

  return (
    <div
      id="callout"
      data-on="0"
      aria-hidden
      className="fixed left-0 top-0 z-30 pointer-events-none opacity-0 data-[on=1]:opacity-100 transition-opacity duration-200 motion-reduce:transition-none"
    >
      {/* Anchor ring at the projected point (the wrapper's origin) — the subject mark at the
          scene end of the tie. */}
      <span
        className="absolute -translate-x-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full border-[1.5px]"
        style={{ borderColor: m.ring }}
      />
      {/* Dashed leader from the anchor to the panel's near corner — the ordinal-label language,
          in the SAME ink: the chamber's in-scene anchor lines are structural cyan, and cyan is
          the design's one accent/affordance signal (user, 2026-08-15 — round 2; the neutral grey
          read as chrome, the border token before it was too weak). Moderate opacity, not full —
          it is a tie, not a signal. Identity stays on the anchor RING. */}
      <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
        <line
          x1={6}
          y1={-6}
          x2={OFF_X}
          y2={-OFF_Y + 8}
          stroke="var(--primary)"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </svg>
      {/* The panel — keyed by subject so the roll-in replays on a change, like a card title. */}
      <div key={m.key} className={`roll-in absolute whitespace-nowrap ${SCENE_GLASS}`} style={{ left: OFF_X, bottom: OFF_Y }}>
        {/* The identity EDGE SPINE (user, 2026-08-15 — "the rails/hairline effect on the left
            side, attached"): the sheets' single-identity-cue language at callout scale — a
            soft-tipped vertical hairline in the subject's hue on the SCENE-FACING edge (the
            side every card edge signal uses), with the leader flowing into its lower tip.
            Static and subtle: a resting identity cue, not a signal — the shared soft-tipped
            recipe, full hue across the middle, easing out in the last ~18% each end. */}
        <span
          aria-hidden
          className="absolute -left-px inset-y-1.5 w-[2px] rounded-full opacity-70"
          style={{ background: `linear-gradient(180deg, transparent, ${m.ring} 18%, ${m.ring} 82%, transparent)` }}
        />
        {/* The card eyebrow's own ink (CardHead: EYEBROW + text-accent), not a muted caption —
            this is the same slot noun the rail card wears (user, 2026-08-15). */}
        <div className="text-micro font-bold tracking-[0.1em] uppercase leading-none text-accent mb-1.5">{m.eyebrow}</div>
        {/* No identity dot here (user, 2026-08-15): the hued aside already carries the identity
            on this row, and the anchor ring is the subject mark at the scene end of the tie. */}
        <div className="flex items-center gap-[7px]">
          <span className="text-body font-semibold text-foreground">{m.title}</span>
          {m.aside && (
            <span
              className={
                m.aside.hue
                  ? "text-label font-bold ml-1"
                  : "inline-flex items-center gap-1.5 text-label text-muted-foreground ml-1"
              }
              style={m.aside.hue ? { color: m.aside.hue } : undefined}
            >
              {m.aside.live && (
                <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_30%,transparent)] animate-dot-beat motion-reduce:animate-none" />
              )}
              {m.aside.text}
            </span>
          )}
        </div>
        {/* The card grammar's HEAD HAIRLINE at callout scale (user, 2026-08-15 — "cards have an
            underline between header and the rest"): it divides the HEAD (eyebrow + title, whose
            own separation stays colour-only, as in the cards) from the body, and it only exists
            where there IS a body to divide — a lead-less callout stays ruleless, the same gate
            CardHead applies when collapsed. Inside the padded box, so it shares the content
            edge like every resting division. */}
        {m.lead && (
          <div className="mt-1.5 pt-1.5 border-t border-border flex items-center gap-1.5 text-label text-muted-foreground">
            {m.lead.text && <span>{m.lead.text}</span>}
            {m.lead.codes && m.lead.codes.length > 0 && <RoleChips codes={m.lead.codes} />}
          </div>
        )}
      </div>
    </div>
  );
}
