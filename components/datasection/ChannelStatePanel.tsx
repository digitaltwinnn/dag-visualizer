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
//   · The tab carries the lane's NAME alone (counts retired 2026-08-13 — user: "at first I
//     didn't realise they were counts"; a bare number in a tab has no label, and each lane's own
//     note and table state its weight one line later, where the numbers do).
// The first available lane opens by default: the pane arrives already reading a real payload
// instead of an empty frame waiting for a click.
//
// ONE LANE BODY GRAMMAR (user, 2026-08-09 — "inside the tabs the approach is different […] for
// data- and state-tab for sure we can come with a more uniform approach? Maybe put the raw data
// behind a button/dropdown section so that it doesn't make the view too busy"). Three lanes had
// arrived at three different shapes: state opened with a shape table, data with a naked JSON tree,
// signers with bare rows. Now every lane renders the SAME three parts in the same order:
//   1. a NOTE — one micro line of the lane's own facts, in one position when a lane HAS any.
//      The payload lanes no longer do (user, 2026-08-13): their notes had shrunk to a bare
//      decoded-KB reading, the number family retired everywhere else that day (card headlines,
//      tab counts) for confusing against the wire size — so both open straight on their shape
//      table, and only the signer groups keep notes (cluster + layer: real facts, not sizes);
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
import { getNetwork, metagraphById, resolveSigner, shortHash, SIGNER_GROUPS, SIGNER_UNKNOWN } from "@/src/data/network";
import { snapsAtTick } from "@/src/data/anchorLog";
import { UNLISTED_HUE } from "@/src/data/unlisted";
import { PAYLOAD_LANES, parsePayload, payloadKinds, stateSchema, unifyFieldKinds } from "@/src/data/payloadKinds";
import { identityHudHex } from "@/src/palette/identity";
import { CopyButton, FootRow, IdentityDot, RoleChips } from "@/components/inspector/parts";
import { fmtDag, fmtKB } from "@/src/util/format";
import JsonTree from "@/components/datasection/JsonTree";
import { LANE_ICONS } from "@/components/icons";
import TablePager from "@/components/datasection/TablePager";
import { cn } from "@/lib/utils";

/** Whether a decoded payload carries anything at all — `{}`, `[]` and `""` do NOT open a lane. */
function nonEmpty(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** The pane's own hash display: the card's shortHash (8…6) sized for a ~200px rail column,
 *  while this pane runs ~3× that — the labels need no more than their words, so the value
 *  takes the room (user, 2026-08-14). Head AND tail kept, like shortHash: a chain hash's tail
 *  is what gets compared. */
const paneHash = (v: string): string => (v.length <= 46 ? v : `${v.slice(0, 26)}…${v.slice(-18)}`);

type LaneId = "state" | "data" | "signers";
type Lane = { id: LaneId; name: string; title: string };

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
            {/* text-label, not the Table default body size (user, 2026-08-13 — "the font of the
                state key column looks unusually large"): the lane sits in the label/micro
                register everywhere else, and a JSON key is an identifier, so mono. */}
            <TableCell className={cn("truncate text-label font-mono", r.muted && "italic font-sans text-muted-foreground")}>{r.a}</TableCell>
            <TableCell className="text-right tabular-nums truncate text-label">{r.b}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** ONE SCHEMA GRAMMAR, BOTH LANES (user, 2026-08-14 — third pass): a schema row is a
 *  DISCLOSURE — the row carries the name and the record count, and opening it reveals the
 *  record's field chips in their own section, wrapping freely (the collapsed row shows no
 *  chips at all, so the old cap/'… +N' machinery retired with the clutter it managed). The
 *  data lane's row is named `records` (the card's own word — its union kind string is not a
 *  name); a wrapper kind keeps its wrapper name; a state key keeps its key. Rows with nothing
 *  under them (a scalar state key) render plain, chevron-less — affordance follows the data.
 *  NESTING stays ignored by construction (kindOf reads top-level keys) — the code well below
 *  is the authority on depth. */
function SchemaRows({
  header,
  rows,
}: {
  header: string;
  rows: { label: string; mono?: boolean; count: number; kinds: { kind: string; fields: string[] | null; count: number }[] }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className={LANE_HEAD}>{header}</span>
        <span className={LANE_HEAD}>Records</span>
      </div>
      {rows.map((r) => (
        <SchemaRow key={r.label} {...r} />
      ))}
    </div>
  );
}

function SchemaRow({
  label,
  mono = true,
  count,
  kinds,
}: {
  label: string;
  mono?: boolean;
  count: number;
  kinds: { kind: string; fields: string[] | null; count: number }[];
}) {
  const [open, setOpen] = useState(false);
  // Only a row with fields BEHIND it discloses — a chevron onto nothing is a lie about the data.
  const openable = kinds.some((k) => k.fields != null || k.kind !== label);
  const row = (
    <>
      <span className={cn("min-w-0 truncate text-label", mono && "font-mono")} title={label}>
        {label}
      </span>
      <span className="flex-1" />
      <span className="flex-none text-right tabular-nums text-label">{count.toLocaleString()}</span>
    </>
  );
  if (!openable) return <div className="flex items-center gap-1.5 py-0.5 pl-[18px]">{row}</div>;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 w-full py-0.5 rounded-xs cursor-pointer text-left",
          "hover:bg-wash-faint focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3 flex-none text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
        {row}
      </button>
      {open && (
        <div className="flex flex-col gap-1 pl-[18px]">
          {kinds.map((k) => (
            <FieldChips key={k.kind} fields={k.fields ?? [k.kind]} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One record schema as wrapping squared mono chips — the shared token rendering. Uncapped:
 *  chips only ever render inside a row the user opened, so vertical room is granted by the
 *  gesture itself. */
function FieldChips({ fields }: { fields: string[] }) {
  const chip =
    "inline-flex items-center rounded-xs border border-border bg-wash-faint px-[5px] py-[2px] font-mono text-micro leading-none text-muted-foreground";
  return (
    <span className="min-w-0 flex flex-wrap gap-1">
      {fields.map((f) => (
        <span key={f} className={chip}>
          {f}
        </span>
      ))}
    </span>
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
    // mt-1.5 on top of the lane's gap-2 (user, 2026-08-14 — the disclosure hugged the shape
    // table): the raw tier sits visibly below the shape it expands on. The header row carries
    // the shared copy control at its right end — the WHOLE payload as pretty-printed JSON, the
    // same text the well renders (group/copy, so it reveals with the row like every other).
    <div className="group/copy flex flex-col gap-1 mt-1.5">
      <div className="flex items-center justify-between gap-2">
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
        <CopyButton value={JSON.stringify(data, null, 2)} subject="raw JSON" />
      </div>
      {open && (
        // THE CODE WELL (user, 2026-08-14 — "put the raw JSON in some sort of code box, like
        // Discord"): the tree sits on the page's own ground inside a bordered rounded well, so
        // it reads as a different MATERIAL — raw code recessed into the glass — rather than more
        // prose. Deliberately `--background` (the raw ground itself), not a plate lift: a code
        // fence is a window down, not a tier up. Long JSON scrolls sideways INSIDE the well
        // (.slim-scroll, the one scrollbar recipe), never stretching the pane.
        <div className="rounded-md border border-border/50 bg-[var(--background)] px-2.5 py-2 overflow-x-auto slim-scroll">
          <JsonTree data={data} />
        </div>
      )}
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
const SIGNER_PAGE = 3; // rows per page — the consensus MINIMUM, so one page is one quorum (user)
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
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(ids.length / SIGNER_PAGE));
  const p = Math.min(page, pages);
  const slice = ids.slice((p - 1) * SIGNER_PAGE, p * SIGNER_PAGE);
  return (
    <div className="flex flex-col gap-2">
      {/* Label left, the producing LAYER as its squared chip right (user, 2026-08-14 — the
          "snapshot proof · 3 · L0 cluster" run-on cleaned up): the count is gone because it
          counted SIGNERS, not proofs — the rows below ARE that count — and "rotating" is the
          title's nuance, not a header's. The chip code derives from SIGNER_GROUPS' own words
          (the one home), so the two can't drift. */}
      <div className="flex items-center justify-between gap-2.5" title={g.title}>
        <span className={LANE_HEAD}>{g.label}</span>
        {/* "signed by [L0]" (user, 2026-08-14) — the chip alone floated context-free. */}
        <span className="inline-flex items-center gap-1.5">
          <span className="text-micro text-muted-foreground">signed by</span>
          <RoleChips codes={[g.who.split(" ")[0]]} />
        </span>
      </div>
      <LaneTable
        head={["Node", "Signer id"]}
        rows={slice.map((id) => {
          const r = resolveSigner(selNodes, metaId, id);
          const w = r.known ? null : SIGNER_UNKNOWN[r.reason];
          return {
            key: id,
            // The NODE is the machine's own reference, never its city (user, 2026-08-13 —
            // "Portland is not signing the data"; the same critique that retired the card's
            // signer table on 2026-08-10, still living here). A signature ties to a MACHINE:
            // its node id names it, the signer id beside it is the layer key it signed with —
            // a hybrid's two ids differing is exactly the fact this table exists to show.
            // The NODE id takes the copy control (user, 2026-08-13 — the machine's reference is
            // the value you take elsewhere; the signer id is an 8-char server-truncated prefix,
            // a match key rather than a reference worth carrying out).
            a: r.known ? (
              <span className="group/copy inline-flex items-center gap-1.5 min-w-0">
                <span className="font-mono text-label truncate" title={r.row.id ?? undefined}>
                  {r.row.id ? shortHash(r.row.id) : r.row.label}
                </span>
                {r.row.id && <CopyButton value={r.row.id} subject="node id" />}
              </span>
            ) : (
              w!.label
            ),
            muted: !r.known,
            title: w ? w.title : id,
            b: <span className="font-mono text-label text-muted-foreground">{id}</span>,
          };
        })}
      />
      <TablePager
        page={p}
        pages={pages}
        from={(p - 1) * SIGNER_PAGE + 1}
        to={Math.min(p * SIGNER_PAGE, ids.length)}
        total={ids.length}
        onPage={setPage}
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
  // the deep read fails (an upstream blip, or a snapshot older than the chain's ~78-day
  // payload band, measured 2026-08-14).
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
  // Both lanes' shape reads are the same mechanical pass now: the data records' kinds, and the
  // state's per-key record schemas one level down (stateSchema — the DOR lesson, 2026-08-14).
  // Unified (unifyFieldKinds): records differing by an optional field are ONE schema row.
  const kinds = useMemo(() => unifyFieldKinds(payloadKinds(dataTx)), [dataTx]);
  const stateRows = useMemo(() => stateSchema(state), [state]);

  // The lanes this snapshot actually has, in a fixed order (payload → payload → proofs) so the bar
  // never reshuffles between snapshots; only membership changes.
  const lanes = useMemo<Lane[]>(() => {
    if (!deep) return [];
    const out: Lane[] = [];
    if (deep.stateKeys.length > 0 || nonEmpty(state)) {
      out.push({ id: "state", name: PAYLOAD_LANES.state.name, title: PAYLOAD_LANES.state.title });
    }
    if (deep.dataTxCount > 0 || nonEmpty(dataTx)) {
      out.push({ id: "data", name: PAYLOAD_LANES.data.name, title: PAYLOAD_LANES.data.title });
    }
    if (deep.signers.length > 0 || deep.dataBlockSigners.length > 0) {
      out.push({ id: "signers", name: "Signers", title: "The validators that signed this snapshot, by producing layer" });
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
  // An UNLISTED channel takes the set's neutral gray (user, 2026-08-14 — the head's dot minted
  // a random hue; the same rule the snapshot card fixed on 2026-08-08: no single identity can
  // speak for the mixed set, so none does).
  const hue = cfg ? identityHudHex(sel.metaId) : UNLISTED_HUE;
  // The snapshot's OWN hash, tiered like the card's foot: descriptor first, polled record behind
  // it (a pager-stepped or exact-read-built selection carries hash "").
  const net = getNetwork();
  const hash = sel.hash || (net ? snapsAtTick(net.metaSnaps, sel.metaId, sel.ts).find((r) => r.ordinal === sel.ordinal)?.hash : "") || "";

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
              ? "decompression failed — a blip retries on reselect; snapshots older than the chain\u2019s ~78-day serving horizon have no payload to read"
              : "decompressing…"}
        </p>
      ) : (
        <>
          {/* The chain facts as LABELLED rows at the label size (user, 2026-08-14 — the first
              redesign borrowed the card's composed lead lines, and "two rows of only values"
              read as clutter here: the card's lead works because the card names things around
              it; this pane stands alone in the raw layer, so its facts wear their labels. Four
              quiet rows, not the old five body-size ones — the REFERENCES stay in the foot
              strip below, and "· compressed" keeps naming the wire figure's basis against the
              lanes' decoded sizes. */}
          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-0.5 flex-none text-label">
            <span className="text-muted-foreground">Fee</span>
            <span className="text-right tabular-nums text-foreground"><b className="font-bold">{fmtDag(deep.fee)}</b> DAG</span>
            <span className="text-muted-foreground">Anchored</span>
            <span className="text-right tabular-nums text-foreground-dim">{fmtKB(deep.bytes / 1024)} · compressed</span>
            <span className="text-muted-foreground">Height · sub</span>
            <span className="text-right tabular-nums text-foreground-dim">{deep.height.toLocaleString()} · {deep.subHeight.toLocaleString()}</span>
            <span className="text-muted-foreground">Blocks</span>
            <span className="text-right tabular-nums text-foreground-dim">{deep.blocks.toLocaleString()}</span>
          </div>

          {/* THE IDLE LINE, the card's own remark in the same lead position (user, 2026-08-14):
              the read landed and neither payload lane exists — the bytes are the envelope and
              the proofs the SIGNERS tab below lists. Verified, never guessed: the pane always
              decompresses on arrival, so this renders only over a real read. */}
          {lanes.length > 0 && !lanes.some((l) => l.id === "state" || l.id === "data") && (
            <p className="flex-none text-label text-muted-foreground">
              An idle snapshot: it anchored only its envelope and proofs.
            </p>
          )}

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
                // FILE-CABINET TABS (user, 2026-08-13 — "it's not clear the content under those
                // tabs is related; more like a file cabinet: the tab outline AND the body"). The
                // segmented-control chips read as free-floating buttons over an unrelated block,
                // so the active tab now fuses with its body: an outlined rounded-top tab whose
                // own fill sits OVER the row's underline (the `after:` hairline at z-0, the
                // active tab at z-1), notching it open exactly under the chosen lane — the
                // drawer and its label share one contour. Tabs split the pane's width equally
                // (flex-1) instead of huddling at one end. The COUNTS are gone (user: "at first
                // I didn't realise they were counts") — each lane's own note and table state its
                // weight one line later, where the numbers have labels.
                className="relative flex flex-none w-full gap-1 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border/50"
                aria-label="Which part of the snapshot to read"
              >
                {lanes.map((l) => {
                  const LaneIcon = LANE_ICONS[l.id];
                  return (
                    <ToggleGroupItem
                      key={l.id}
                      value={l.id}
                      title={l.title}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 h-7 px-2 rounded-t-md! rounded-b-none!",
                        "text-micro tracking-caps uppercase",
                        "text-muted-foreground bg-transparent border border-transparent border-b-0",
                        "hover:text-foreground hover:bg-wash-soft",
                        "data-[state=on]:z-[1] data-[state=on]:text-foreground",
                        "data-[state=on]:border-border/50 data-[state=on]:bg-[var(--panel-solid)]",
                      )}
                    >
                      <LaneIcon aria-hidden className="size-3.5 flex-none" />
                      {l.name}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>

              {/* ONE scroll region, and it takes the whole remaining pane — the point of the axis:
                  an opened tree grows INSIDE this box instead of pushing its sibling out of view.
                  Every lane below is note → table → raw disclosure, in that order. `.slim-scroll`
                  is the app's one scrollbar recipe: an opened JSON tree genuinely scrolls both
                  ways, and the platform default read as a browser part laid over the glass. */}
              <div className="min-h-0 flex-1 overflow-auto slim-scroll">
                {active === "state" && (
                  <div className="flex flex-col gap-2">
                    {stateRows.length > 0 && (
                      <SchemaRows
                        header="Schema"
                        rows={stateRows.map((r) => ({ label: r.key, count: r.count, kinds: r.kinds }))}
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
                    {kinds.length > 0 && (
                      <SchemaRows
                        header="Schema"
                        rows={kinds.map((k) => ({
                          // The union field-kind row is named `records` (the card's word); a
                          // wrapper kind is its own name and carries no chips to open.
                          label: k.fields ? "records" : k.kind,
                          mono: !k.fields,
                          count: k.count,
                          kinds: [k],
                        }))}
                      />
                    )}
                    {dataTx != null && <RawSection open={raw} onToggle={() => setRaw((o) => !o)} data={dataTx} />}
                  </div>
                )}
                {active === "signers" && (
                  <div className="flex flex-col gap-3">
                    {/* dL1 FIRST, L0 AFTER (user, 2026-08-14): the production order — the data
                        blocks are signed by their dL1 producers before the L0 cluster seals the
                        snapshot around them, so the lane reads in the order the signatures were
                        actually made. */}
                    {deep.dataBlockSigners.length > 0 && (
                      <SignerGroup group="dataBlocks" ids={deep.dataBlockSigners} metaId={deep.metaId} selNodes={selNodes} />
                    )}
                    {deep.signers.length > 0 && (
                      <SignerGroup group="proof" ids={deep.signers} metaId={deep.metaId} selNodes={selNodes} />
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
            // The card FOOT's ground (user, 2026-08-13): same tier — look-up references with the
            // copy control — so the same `--panel-plate` lift under it, as a rounded plate at the
            // pane's own scale (the card bleeds to its panel edge; the pane's edge is the layer's,
            // several containers up, so the plate sits as a block rather than a bleed).
            // THE SAME SET AS THE CARD'S FOOT (user, 2026-08-13 — "hash is missing; re-use and
            // ensure they are the same attributes"): Hash · Parent · State proof, the artifact's
            // chain identity in the card's own order and tiering — the descriptor's hash first,
            // the polled record behind it (the pager-sibling lesson from the card's foot).
            <div className="flex-none flex flex-col gap-1 rounded-md bg-[var(--panel-plate)] px-2.5 py-2">
              {hash && <FootRow label="Hash" value={paneHash(hash)} title={hash} copy={hash} />}
              {deep.lastSnapshotHash && (
                <FootRow label="Parent hash" value={paneHash(deep.lastSnapshotHash)} title={deep.lastSnapshotHash} copy={deep.lastSnapshotHash} />
              )}
              {deep.stateProof && (
                // "State HASH", not "state proof" (user, 2026-08-14 — the SIGNERS tab says
                // "snapshot proof" for the L0 SIGNATURE SET, so two unrelated species shared the
                // word one screen apart and read as kin). It is a digest, the same species as
                // its Hash/Parent siblings; the chain field stays calculatedStateProof (internal
                // identifiers keep their names). The title carries the distinction.
                <FootRow label="State hash" value={paneHash(deep.stateProof)} title={"The hash of the application state this snapshot results in, covered by the snapshot's own L0 seal — the state's provability. Distinct from the SIGNERS tab's 'snapshot proof', which is the L0 signature set; this is a digest, and the signatures sign over it." + deep.stateProof} copy={deep.stateProof} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
