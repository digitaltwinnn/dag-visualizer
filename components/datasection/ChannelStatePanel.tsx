"use client";
// The raw layer's half of the two-step disclosure (spec §7.3): the CARD states the shape of a
// metagraph's application state, and this renders the payload — one level down, on a second
// deliberate gesture, because one anchoring channel publishes personal records and a payload should
// never appear just because a tile was clicked. Since the master-detail split (item 9, 2026-08-06)
// it is the raw layer's RIGHT pane: the anchor log on the left is the index, this is the selected
// snapshot's contents, rendered through the bespoke JsonTree instead of a flat text dump.
//
// ONE LANE AXIS (user, 2026-08-09 — "we have 'state' and 'data transactions' shown separately […]
// what about showing those (and more) in tabs because they go down and out of view when we open the
// json structure"). Two stacked payload panes were wrong twice over: they split the pane's height so
// an opened tree immediately overflowed, and stacking implied a reading ORDER between two lanes that
// are unrelated. So the payload is a single-select axis — the same segmented-control idiom as the
// command bar's presentation axis — and the pane's whole remaining height belongs to the chosen lane.
//
// Three rules make the axis honest rather than merely tidier:
//   · CHAIN FACTS ARE NOT A LANE. Ordinal, height, parent, fee, size, blocks are the subject's
//     identity, so they stay pinned above the axis exactly like a card head's facts. Only the
//     payload switches.
//   · A LANE WITH NOTHING IN IT GETS NO TAB (affordance follows the data). A tab opening onto `{}`
//     is a promise the data doesn't keep — and the surviving tab SET then reads as a statement of
//     what this metagraph actually anchors: DED shows `data · signers` and no state lane at all,
//     while a currency metagraph shows its state.
//   · The counts live in the tab labels, so the lane's weight is legible before opening it — and
//     nothing repeats them below (the grid's old "Signed by N validators" row went to the tab).
// The first available lane opens by default: the pane arrives already reading a real payload
// instead of an empty frame waiting for a click.
//
// ONE LANE BODY GRAMMAR (user, 2026-08-09 — "inside the tabs the approach is different […] for
// data- and state-tab for sure we can come with a more uniform approach? Maybe put the raw data
// behind a button/dropdown section so that it doesn't make the view too busy"). Three lanes had
// arrived at three different shapes: state opened with a shape table, data with a naked JSON tree,
// signers with bare rows. Now every lane renders the SAME three parts in the same order:
//   1. a NOTE — one micro line of the lane's own facts, always in the same position (a lane with
//      no facts of its own renders none rather than a padded-out placeholder);
//   2. a two-column TABLE, `LaneTable`, so the shape of the payload is what the lane opens with —
//      the data lane's rows come from `payloadKinds`, the mechanical read that gives it the same
//      shape table the server already computes for state;
//   3. the RAW tree, behind ONE disclosure — OPEN by default since the redesign (2026-08-13):
//      this surface exists for nothing but the payload and arriving took a deliberate depth
//      change, so the tree shows itself and the disclosure is how you fold it AWAY. Only the
//      payload lanes have one — the signer ids ARE their payload, so a
//      navigator over them would be the same list twice.
// The disclosure state is PANE-level: opening raw is the same request in either payload lane, so it
// survives a lane switch instead of resetting under the user.
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useStore } from "@/src/store/store";
import { metaSnapDeepKey } from "@/src/data/types";
import type { NodeRow } from "@/src/data/types";
import { metagraphById, resolveSigner, shortHash, SIGNER_GROUPS, SIGNER_UNKNOWN } from "@/src/data/network";
import { PAYLOAD_LANES, parsePayload, payloadKinds } from "@/src/data/payloadKinds";
import { identityHudHex } from "@/src/palette/identity";
import { FootRow, IdentityDot } from "@/components/inspector/parts";
import { fmtDag, fmtKB } from "@/src/util/format";
import JsonTree from "@/components/datasection/JsonTree";
import { cn } from "@/lib/utils";

/** Whether a decoded payload carries anything at all — `{}`, `[]` and `""` do NOT open a lane. */
function nonEmpty(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

type LaneId = "state" | "data" | "signers";
type Lane = { id: LaneId; name: string; count: number | null; title: string };

/** A lane's NOTE — its own facts, in the one position every lane puts them. Uppercase micro like a
 *  card's eyebrow; a caller wraps anything case-sensitive (a hash) in `normal-case`. */
function LaneNote({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <p
      className="flex-none text-micro tracking-caps uppercase text-muted-foreground"
      title={title}
    >
      {children}
    </p>
  );
}

const LANE_HEAD = "text-micro uppercase tracking-caps text-muted-foreground font-normal";

/** A lane's TABLE — two columns, identical markup in every lane, so the three lanes read as three
 *  views of one pane rather than three designs.
 *
 *  `table-fixed` is load-bearing, not tidiness (found live, 2026-08-09): an auto-layout table sizes
 *  to its CONTENT, so a long first cell — DOR's record kind is its whole field list — widened the
 *  table past the pane, pushed the count column out of view and drew a horizontal scrollbar, while
 *  the cell's own `truncate` never engaged (there was always room, just not on screen). Fixed layout
 *  makes the pane the budget: the value column takes what it needs, the key column truncates. */
function LaneTable({
  head,
  rows,
}: {
  head: [string, string];
  rows: { key: string; a: ReactNode; b: ReactNode; title?: string; muted?: boolean }[];
}) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className={LANE_HEAD}>{head[0]}</TableHead>
          <TableHead className={cn(LANE_HEAD, "text-right w-[40%]")}>{head[1]}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key} title={r.title}>
            <TableCell className={cn("truncate", r.muted && "italic text-muted-foreground")}>{r.a}</TableCell>
            <TableCell className="text-right tabular-nums truncate">{r.b}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** A lane's RAW payload, behind one collapsed disclosure at the lane's foot — the same chevron row
 *  idiom as `JsonTree`'s own nodes, so opening the section and opening a node feel like one gesture.
 *  Chrome-less by the card grammar: no fill, border or rule of its own. */
function RawSection({
  open,
  onToggle,
  data,
}: {
  open: boolean;
  onToggle: () => void;
  data: unknown;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-fit items-center gap-1 py-0.5 pr-1.5 cursor-pointer rounded-xs",
          "text-micro tracking-caps uppercase text-muted-foreground",
          "hover:text-foreground hover:bg-wash-faint",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3 flex-none transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
        raw JSON
      </button>
      {open && <JsonTree data={data} />}
    </div>
  );
}

/** One signer group — the snapshot's own proof list, or the signers of its data blocks (genuinely
 *  different information: who SEALED the snapshot vs who produced the blocks inside it).
 *
 *  Which CLUSTER each group belongs to comes from `SIGNER_GROUPS`, not from a literal here: the note
 *  states the producing layer beside the count, because the count alone reads as suspicious (DOR's
 *  proof is always 3 signatures out of 20 machines — the L0 cluster IS three machines).
 *
 *  Unresolved ids degrade through the ONE shared rule (`resolveSigner`/`SIGNER_UNKNOWN`), so the raw
 *  layer says exactly what the metagraph-snapshot card and the ledger explorer say about the same
 *  id. No click affordance: an unknown machine has no card to open, and the raw layer's signer list
 *  is a reading surface, not a browse target. */
function SignerGroup({
  group,
  ids,
  metaId,
  selNodes,
}: {
  group: keyof typeof SIGNER_GROUPS;
  ids: string[];
  metaId: string;
  selNodes: NodeRow[];
}) {
  const g = SIGNER_GROUPS[group];
  return (
    <div className="flex flex-col gap-2">
      <LaneNote title={g.title}>
        {g.label} · <span className="tabular-nums">{ids.length}</span> ·{" "}
        <span className="text-foreground-dim">{g.layer}</span>
      </LaneNote>
      <LaneTable
        head={["Node", "Signer id"]}
        rows={ids.map((id) => {
          const r = resolveSigner(selNodes, metaId, id);
          const w = r.known ? null : SIGNER_UNKNOWN[r.reason];
          return {
            key: id,
            a: r.known ? r.row.city : w!.label,
            muted: !r.known,
            title: w ? w.title : id,
            b: <span className="font-mono text-label text-muted-foreground">{id}</span>,
          };
        })}
      />
    </div>
  );
}

export function ChannelStatePanel() {
  const sel = useStore((s) => s.metaSnap);
  const deep = useStore((s) => (sel ? s.metaSnapDeep[metaSnapDeepKey(sel.globalOrdinal, sel.metaId, sel.ordinal)] : undefined));
  const following = useStore((s) => s.following);
  const selNodes = useStore((s) => s.selNodes);
  // The pinned decode's give-up timer (2026-08-08): "reading…" must terminate honestly when
  // the deep read fails (upstream blip / timeout — not pruning: the LB serves the whole
  // ordinal history, verified 2026-08-13).
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    setGaveUp(false);
    if (!sel || following || deep) return;
    const t = setTimeout(() => setGaveUp(true), 12000);
    return () => clearTimeout(t);
  }, [sel, following, deep]);

  const state = useMemo(() => parsePayload(deep?.state), [deep]);
  // The data TRANSACTIONS (2026-08-07 — a data metagraph's real payload: DED anchors fingerprint
  // BATCH ROOTS here while its on-chain state stays empty).
  const dataTx = useMemo(() => parsePayload(deep?.dataTx), [deep]);
  // The data lane's shape table — the mechanical read that makes it structurally identical to the
  // state lane (whose shape the server already computes into `stateKeys`).
  const kinds = useMemo(() => payloadKinds(dataTx), [dataTx]);

  // The lanes this snapshot actually has, in a fixed order (payload → payload → proofs) so the bar
  // never reshuffles between snapshots; only membership changes.
  const lanes = useMemo<Lane[]>(() => {
    if (!deep) return [];
    const out: Lane[] = [];
    if (deep.stateKeys.length > 0 || nonEmpty(state)) {
      out.push({
        id: "state",
        name: PAYLOAD_LANES.state.name,
        count: deep.stateKeys.length || null,
        title: PAYLOAD_LANES.state.title,
      });
    }
    if (deep.dataTxCount > 0 || nonEmpty(dataTx)) {
      out.push({
        id: "data",
        name: PAYLOAD_LANES.data.name,
        count: deep.dataTxCount || null,
        title: PAYLOAD_LANES.data.title,
      });
    }
    if (deep.signers.length > 0 || deep.dataBlockSigners.length > 0) {
      out.push({
        id: "signers",
        name: "Signers",
        count: deep.signers.length || deep.dataBlockSigners.length,
        title: "The validators that signed this snapshot, by producing layer",
      });
    }
    return out;
  }, [deep, state, dataTx]);

  // The chosen lane is a REQUEST, not the truth: it falls back to the first available lane whenever
  // it isn't in this snapshot's set, so selecting a snapshot without that lane lands on a real one
  // with no effect and no flash of an empty pane.
  const [want, setWant] = useState<LaneId | null>(null);
  const active = lanes.some((l) => l.id === want) ? want! : (lanes[0]?.id ?? null);
  // Pane-level, deliberately: "show me the raw payload" is one request, not a per-lane preference,
  // so switching state↔data keeps the answer. OPEN by default (redesign 2026-08-13): this surface
  // exists for nothing but the payload and arriving took a deliberate depth change — the same
  // reasoning that makes the raw layer read on arrival — so parking the payload behind one more
  // click contradicted the surface's own contract. The disclosure stays as the way to fold the
  // tree AWAY when the shape table is all you need.
  const [raw, setRaw] = useState(true);

  if (!sel) {
    return (
      <p className="m-auto max-w-[26ch] text-center text-label text-muted-foreground">
        {/* Names ONE gesture, on THIS surface (the empty-state rule): the chamber's tiles sit
            behind this layer, marked inert, so inviting a tile click here was unfollowable. */}
        Select a metagraph snapshot to read its contents here. Click a row in the anchor log.
      </p>
    );
  }
  const cfg = metagraphById(sel.metaId);
  const ticker = cfg?.ticker || cfg?.name || shortHash(sel.metaId);
  const hue = identityHudHex(sel.metaId);

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      {/* The pane's subject head — same grammar as a card head: eyebrow + identity + ordinal. */}
      <div className="flex flex-col gap-1 flex-none">
        <span className="text-micro tracking-caps uppercase text-muted-foreground">Metagraph snapshot</span>
        <span className="flex items-center gap-2 text-title font-semibold text-foreground">
          <IdentityDot hue={hue} />
          {ticker} <span className="tabular-nums">{sel.ordinal.toLocaleString()}</span>
        </span>
      </div>

      {!deep ? (
        // The decode rule is CLICK-scoped (user, 2026-08-07 — "decode what I click", live mode
        // is irrelevant to it): an unclicked (auto-followed) snapshot invites the read; a
        // clicked one that hasn't landed yet is genuinely reading.
        //
        // The invitation names its ROUTE and drops the word "pin" (user, 2026-08-10: "I don't
        // like the word 'pin' its not very clear to me"). Here that mattered twice over: the
        // card's own pin control is in the HUD, which this layer has marked `inert`, so the old
        // copy asked for a gesture that was not available on screen. The row in the anchor log to
        // the left IS available, and clicking it commits the same selection.
        <p className="text-label text-muted-foreground">
          {/* One verb family with the card: compressed → decompress → decompressing
              (user, 2026-08-13). */}
          {following
            ? "Click this snapshot's row in the anchor log to decompress its payload. It is a ~2.5 MB fetch, so it runs only when you ask."
            : gaveUp
              ? "decompression failed or timed out — selecting the row again retries"
              : "decompressing…"}
        </p>
      ) : (
        <>
          {/* The chain facts, TIERED instead of flat (redesign 2026-08-13 — the five-row grid
              duplicated the HUD card at equal weight and pushed the payload down): the LEAD is
              the card grammar's own composed line (fee bold, units carrying their labels), the
              bookkeeping trio rides one muted line under it, and the REFERENCES (parent, state
              proof) sink to the foot strip at the pane's bottom, where references sit. */}
          <div className="flex flex-col gap-0.5 flex-none">
            <p className="text-body text-foreground">
              <b className="font-bold tabular-nums">{fmtDag(deep.fee)}</b> DAG ·{" "}
              {/* "· compressed" names the basis — the wire footprint vs the lanes' decoded
                  sizes; the two readings can never sum (see the card's same note). */}
              <span className="tabular-nums">{fmtKB(deep.bytes / 1024)}</span> anchored · compressed
            </p>
            <p className="text-label text-muted-foreground tabular-nums">
              height {deep.height.toLocaleString()} · sub {deep.subHeight.toLocaleString()} ·{" "}
              {deep.blocks.toLocaleString()} block{deep.blocks === 1 ? "" : "s"}
            </p>
          </div>

          {active == null ? (
            // Facts but no payload, stated rather than left as an empty frame (rule 10).
            <p className="flex-none text-label text-muted-foreground">
              this snapshot carries no state, data or proofs we could decode
            </p>
          ) : (
            <>
              {/* The lane axis. Same segmented-control recipe as the command bar's presentation
                  toggle, one size down; the hairline under it is the tab underline and spans the
                  pane, because the lane below owns the pane's full width. */}
              <ToggleGroup
                type="single"
                value={active}
                onValueChange={(v) => { if (v) setWant(v as LaneId); }}
                className="flex flex-none gap-0.5 border-b border-border/50 pb-1"
                aria-label="Which part of the snapshot to read"
              >
                {lanes.map((l) => (
                  <ToggleGroupItem
                    key={l.id}
                    value={l.id}
                    title={l.title}
                    className={cn(
                      "flex items-center gap-1.5 h-7 px-2 rounded-btn!",
                      "text-micro tracking-caps uppercase",
                      "text-muted-foreground bg-transparent border-0",
                      "hover:text-foreground hover:bg-wash-soft",
                      "data-[state=on]:text-foreground data-[state=on]:bg-[var(--sel-bg)]",
                      "data-[state=on]:shadow-[inset_0_0_0_1px_var(--sel-border)]",
                    )}
                  >
                    {l.name}
                    {l.count != null && <span className="tabular-nums opacity-70">{l.count}</span>}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              {/* ONE scroll region, and it takes the whole remaining pane — the point of the axis:
                  an opened tree grows INSIDE this box instead of pushing its sibling out of view.
                  Every lane below is note → table → raw disclosure, in that order. `.slim-scroll`
                  is the app's one scrollbar recipe: an opened JSON tree genuinely scrolls both
                  ways, and the platform default read as a browser part laid over the glass. */}
              <div className="min-h-0 flex-1 overflow-auto slim-scroll">
                {active === "state" && (
                  <div className="flex flex-col gap-2">
                    {/* The proof hash left this note for the foot strip (redesign 2026-08-13):
                        a hash is a reference, not a lane fact, and cramming it into a caps
                        caption made the note a run-on mono string. */}
                    <LaneNote>state {(deep.stateBytes / 1024).toFixed(1)} KB</LaneNote>
                    {deep.stateKeys.length > 0 && (
                      <LaneTable
                        head={["State key", "Records"]}
                        rows={deep.stateKeys.map((k) => ({ key: k.key, a: k.key, title: k.key, b: k.count }))}
                      />
                    )}
                    {state != null && <RawSection open={raw} onToggle={() => setRaw((o) => !o)} data={state} />}
                  </div>
                )}
                {active === "data" && (
                  <div className="flex flex-col gap-2">
                    {/* The data lane's NOTE: the payload's own weight, the same fact the state
                        lane leads with (the tab's count is the record COUNT, a different number).
                        Without it this lane opened on a bare table header while its two siblings
                        opened on a note — the uniform body's first part, missing. */}
                    <LaneNote>
                      {/* The lane's WEIGHT, the same fact the state note leads with — the tab
                          already carries the record count, so repeating it here said the same
                          number twice (redesign 2026-08-13; dataBytes is the decoder's measured
                          block size, absent only on a pre-field cached body). */}
                      data{" "}
                      {deep.dataBytes != null
                        ? `${(deep.dataBytes / 1024).toFixed(1)} KB`
                        : `${deep.dataTxCount} record${deep.dataTxCount === 1 ? "" : "s"}`}
                    </LaneNote>
                    {kinds.length > 0 && (
                      <LaneTable
                        head={["Record kind", "Records"]}
                        rows={kinds.map((k) => ({ key: k.kind, a: k.kind, title: k.kind, b: k.count }))}
                      />
                    )}
                    {dataTx != null && <RawSection open={raw} onToggle={() => setRaw((o) => !o)} data={dataTx} />}
                  </div>
                )}
                {active === "signers" && (
                  <div className="flex flex-col gap-3">
                    {deep.signers.length > 0 && (
                      <SignerGroup group="proof" ids={deep.signers} metaId={deep.metaId} selNodes={selNodes} />
                    )}
                    {deep.dataBlockSigners.length > 0 && (
                      <SignerGroup group="dataBlocks" ids={deep.dataBlockSigners} metaId={deep.metaId} selNodes={selNodes} />
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* THE REFERENCE STRIP (redesign 2026-08-13): the snapshot's chain references — what it
              links to, what it proves — at the pane's bottom edge, where references sit in every
              card. Out of the reading path (they were the grid's second row and a caps note's
              tail), one register (FootRow: micro caps label, mono value), each with the shared
              copy control. Pinned below the scroll region, so an opened tree never buries them. */}
          {(deep.lastSnapshotHash || deep.stateProof) && (
            <div className="flex-none flex flex-col gap-1 border-t border-border/50 pt-2">
              {deep.lastSnapshotHash && (
                <FootRow label="Parent" value={shortHash(deep.lastSnapshotHash)} title={deep.lastSnapshotHash} copy={deep.lastSnapshotHash} />
              )}
              {deep.stateProof && (
                <FootRow label="State proof" value={shortHash(deep.stateProof)} title={deep.stateProof} copy={deep.stateProof} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
