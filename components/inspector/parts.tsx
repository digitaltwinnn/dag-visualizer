"use client";

import { Fragment, type CSSProperties, useRef, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn, TOUCH_HIT } from "@/lib/utils";
import { IDENT_INK } from "@/components/identInk";
import { BAR_EASE } from "@/components/RollSwap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NodeInfo } from "@/src/data/types";
import { nodeStatus } from "@/src/data/nodeStatus";

// Shared building blocks for the inspector cards (the React port of ui.js _cardBody),
// split out so each per-kind card reads as its own small file.

// ONE layer vocabulary, app-wide: a layer is `L0` / `cL1` / `dL1` wherever it is named (the rule
// lives with SIGNER_GROUPS in src/data/network.ts). A second long-form map ("currency-L1",
// "data-L1") used to sit here and fed the composition `parts` strings, so the same layer could
// read two ways within one card — the chips beside them have always used these codes.
import { ROLE_SHORT } from "@/src/data/composition";
export { ROLE_SHORT }; // ONE home for the layer-code map (2026-08-16) — this is a re-export
export const ROLE_ORDER = ["l0", "cl1", "dl1"];

// ── The card body's ONE row grammar, in three weights (user, 2026-08-10) ────────────────────
// Every rail card body is built from these. Before, two grammars competed with no rule for
// which was which — this one-line `Fact` (label left, value right) and a STACKED block (micro
// uppercase label above, value below) that cost twice the height. The stacked form applied to
// `Hosting` but not `Anchored into`, both one-line facts; the node card was stacked end to end,
// paying ~188px for four facts. It is retired: one shape, and a long value wraps inside its own
// column, which the flex row already handles.
//
// What varies is WEIGHT, not shape — three tiers, coarse→fine like everything else here:
//
//   LEAD    the one or two things the card exists to say. Composed by the card itself (see
//           MetaSnapPane's `Lead`), not a primitive — a lead line merges facts and drops labels
//           the unit already carries (`0.0070 DAG` needs no "Fee:").
//   DETAIL  the measured facts — `Fact` inside a `FactGroup`.
//   FOOT    the values you LOOK UP rather than read: hashes, ids, block bookkeeping. Same row
//           shape at a small muted mono treatment, so the foot is a WEIGHT and not a second
//           grammar (user chose this over a denser wrapping run for exactly that reason).
//
// The tiers exist because a flat list charges the same height for a headline number and a
// parent hash. Nothing here is hidden behind a gesture — the app's disclosure model is already
// two-step (card states the SHAPE, raw layer renders the PAYLOAD) and a third tier inside the
// card would be one gesture too many.

// The one fact row. `title` carries the full value for anything the cell truncates.
export function Fact({ label, children, title, className }: { label: ReactNode; children: ReactNode; title?: string; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-2.5", className)} title={title}>
      <span className="shrink-0 text-body text-muted-foreground">{label}</span>
      <span className="min-w-0 text-body text-foreground tabular-nums text-right">{children}</span>
    </div>
  );
}

// ── THE CARD SKELETON'S OTHER SLOTS (2026-10-02, `docs/superpowers/design/2026-10-02-right-rail-
// cards`) ─────────────────────────────────────────────────────────────────────────────────────
// Every right-rail card is the same six slots in one order — head · lead · breakdown · facts ·
// doors · foot + pager — and a card uses the slots it has content for. The eight cards were
// designed one at a time and diverged in exactly these places: what the card says first, how a
// section is headed, how an empty value reads, how a way out is drawn. These are the one home for
// each, beside `Fact` and `Foot`.

/** THE LEAD — the one line a card says first, in dim ink, two lines at most: what this subject
 *  is in relation to its parent ("83% of Dor Technologies' online nodes"). Every child card has
 *  one. NO FULL STOP (user, 2026-10-07: "remove the . — it's UI, not everything should be treated
 *  like grammar"): it is a label on an instrument, not prose — two clauses join with a comma. */
export function Lead({ children, aside, className, lines = 2 }: { children: ReactNode; /** A second fact that would otherwise be glued on with a mid-dot — an age, a count — as a
   *  qualifier chip on the row's right (user, 2026-10-03, on "Anchored to N · 1 min ago": "should
   *  that second part be a pill on the right side? I don't like those dots separating texts").
   *  The sentence stays one statement; the chip is the head aside's own species. */
  aside?: ReactNode; className?: string;
  /** Two lines is the rule. History's sentence leads (a reading about a network over a span, 2026-10-07)
   *  carry a chip AND a figure, and take three. */
  lines?: 2 | 3 }) {
  const clamp = lines === 3 ? "line-clamp-3" : "line-clamp-2";
  if (aside == null) return <p className={cn("m-0 mb-2.5 text-body leading-snug text-foreground-dim", clamp, className)}>{children}</p>;
  return (
    <div className={cn("mb-2.5 flex items-baseline justify-between gap-2.5", className)}>
      <p className={cn("m-0 min-w-0 text-body leading-snug text-foreground-dim", clamp)}>{children}</p>
      <QualifierChip className="flex-none tabular-nums">{aside}</QualifierChip>
    </div>
  );
}

/** A share as the words a lead may say: never "0%" for a part that exists nor "100%" for one that
 *  is not the whole (rounding would state both), and null when there is no whole to be a share
 *  of — the caller then says nothing rather than "0%" (rule 10: absent is not zero). */
export function shareWords(part: number, whole: number): string | null {
  if (!(whole > 0)) return null;
  const pct = (part / whole) * 100;
  if (part > 0 && pct < 1) return "under 1%";
  if (part < whole && pct > 99) return "over 99%";
  return `${Math.round(pct)}%`;
}

/** THE ONE EMPTY VALUE. A dash, muted, with the reason on hover — the cards said "not known",
 *  "none" and "n/a" for the same thing. Where the reason matters at a glance, the caller writes
 *  it beside the dash in `text-label`. */
export function Empty({ why }: { why?: string }) {
  return (
    <span role="img" className="text-muted-foreground" title={why} aria-label={why ?? "No value"}>
      —
    </span>
  );
}

/** A SECTION'S LABEL — caps, muted, with the section's one headline figure on the right. The
 *  breakdown slot's heading: the card's total lives here rather than in a sentence above it. */
export function SectionLabel({ label, total, unit, className }: { label: ReactNode; total?: ReactNode; unit?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2.5 text-label tracking-caps uppercase text-muted-foreground", className)}>
      <span className="min-w-0 truncate">{label}</span>
      {(total != null || unit != null) && (
        <span className="flex-none inline-flex items-baseline gap-1.5">
          {unit != null && <span className="normal-case tracking-normal">{unit}</span>}
          {total != null && <span className="font-mono text-body font-bold normal-case tracking-normal text-foreground tabular-nums">{total}</span>}
        </span>
      )}
    </div>
  );
}

/** A FOLD IS MARKED ON ITS LABEL, NEVER BY A GLYPH BESIDE THE FIGURE (user, 2026-10-03, two rounds).
 *  A disclosure chevron in the row's flow sat between the figure and the card's edge, so a row WITH
 *  one printed its number a chevron's width left of every row without: the dossier's "17 ›" stood
 *  off the 3 / 14 / 17 column beneath it, and the global snapshot's rows (whose mark was hidden
 *  until hover but still held its place) stood off their own total — "numbers should be on the
 *  right side and aligned … a structural solution for the > space being taken sometimes". Hanging
 *  the chevron in the card's right padding fixed the columns and failed on its own terms: "it
 *  touches the edge, there is simply no place there for a control".
 *
 *  So a fold takes NO space: the label that opens it wears the dotted underline — the app's
 *  there-is-more affordance, the pager's scope word's own — and the row's figure sits on the same
 *  right edge as every other row's. Open, the underline goes solid and the label takes full ink;
 *  the rows beneath are the rest of the statement. The host carries `group` so a hover on any part
 *  of the row lifts the label. */
export const foldLabel = (open: boolean): string =>
  cn(
    "underline underline-offset-[3px] decoration-[1px]",
    open
      ? "decoration-solid decoration-[var(--muted-foreground)]"
      : "decoration-dotted decoration-[var(--muted-foreground)] group-hover:decoration-[var(--foreground)]",
  );

/** THE HEAD'S QUALIFIER — one hairline chip: a ticker, a country code, a city, a role. The head's
 *  right slot is either this or a state pill (ready, live / pinned), never bare text, a relation
 *  or an age (those are the lead's). Same pill as `RoleChips`, one vocabulary. */
export function QualifierChip({ children, className, style, title }: { children: ReactNode; className?: string; style?: CSSProperties; title?: string }) {
  return (
    <span
      title={title}
      style={style}
      className={cn(
        "inline-flex items-center max-w-full rounded-xs border border-border bg-wash-faint px-[6px] py-[3px] text-label leading-none text-muted-foreground",
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

/** THE TICKER BESIDE A TITLE — one chip, in the network's own ink (user, 2026-10-02: "should we
 *  apply the ticker-pill consistently? the card header has it but in many other places we show
 *  just text"). The rule: a ticker that QUALIFIES A TITLE is this chip — the dossier head, the
 *  scene callout and tooltip, the Moment's headline, the raw pane's head. A ticker in a COLUMN
 *  (node rows, the anchor log) or inside a SENTENCE stays plain hued text: twenty boxed tickers
 *  beside the role chips is a wall of boxes, and a chip mid-sentence reads as a button. */
export function TickerChip({ text, hue, title, className }: { text: string; hue?: string; title?: string; className?: string }) {
  return (
    <QualifierChip title={title} className={cn("font-semibold tracking-[0.02em]", IDENT_INK, className)} style={hue ? { color: hue } : undefined}>
      {text}
    </QualifierChip>
  );
}

/** THE THREE LAYERS, AS CELLS (the node card, option C — user 2026-10-02). A node runs some of
 *  L0 / cL1 / dL1; each is a cell, lit when this node runs it and dashed when it does not, so the
 *  make-up is a picture and an ABSENT layer is shown rather than merely unlisted. The codes are
 *  the app's one layer vocabulary (`RoleChips`); the word under each is what that layer does. */
const LAYER_CELLS: { code: string; does: string }[] = [
  { code: "L0", does: "snapshots" },
  { code: "cL1", does: "currency" },
  { code: "dL1", does: "data" },
];
export function LayerCells({ codes }: { codes: readonly string[] }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="list" aria-label="Layers this node runs">
      {LAYER_CELLS.map((l) => {
        const on = codes.includes(l.code);
        return (
          <span
            key={l.code}
            role="listitem"
            aria-label={`${l.code}: ${on ? "runs" : "does not run"}`}
            className={cn(
              "flex flex-col rounded-sm border px-2 py-1.5 text-label leading-tight",
              on ? "border-border bg-wash-faint text-muted-foreground" : "border-dashed border-border text-muted-foreground opacity-45",
            )}
          >
            <span className={cn("font-mono text-body font-semibold", on && "text-foreground")}>{l.code}</span>
            {l.does}
          </span>
        );
      })}
    </div>
  );
}

/** A DOOR — every way out of a card is this one full-bleed row: an optional key, the target, a
 *  glyph. A link (`href`) or a control (`onClick`); the wash is the hover every row in the app
 *  wears. It bleeds by the card's own padding, like the foot it sits above. */
export function Door({
  label,
  children,
  href,
  onClick,
  glyph,
  title,
  disabled,
  flushFoot,
}: {
  label?: ReactNode;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  glyph?: ReactNode;
  title?: string;
  disabled?: boolean;
  /** Sits directly on the foot plate below it (cancels the foot's own top margin). */
  flushFoot?: boolean;
}) {
  const cls = cn(
    flushFoot && "-mb-3",
    // The agreed door recipe (design 2026-09-26, `moment-door.html` A — the Moment card's
    // "Snapshot records" control is its first instance and keeps its own foot geometry): a
    // full-bleed row on the wash ladder every control wears.
    // ⚠️ ONE STEP UP THE LADDER ON PAPER (user, 2026-10-03: "the clickable section saying 'site' is
    // a bit too faint in light mode"). 6% of the accent is a visible plate on the dark glass and
    // very nearly the card's own white on paper, so the row stopped reading as a control there:
    // paper rests at `soft` and hovers at `hover`, dark keeps `faint` → `soft`.
    "flex items-center gap-2 -mx-[var(--card-pad)] px-[var(--card-pad)] py-2 pointer-coarse:min-h-11 border-t border-wash-strong [background:light-dark(var(--wash-soft),var(--wash-faint))] text-body text-foreground text-left",
    "hover:[background:light-dark(var(--wash-hover),var(--wash-soft))] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
    disabled && "opacity-65 pointer-events-none",
  );
  const inner = (
    <>
      {label != null && <span className="flex-none text-muted-foreground">{label}</span>}
      <span className={cn("min-w-0 truncate", href && "text-primary-ink")}>{children}</span>
      <span aria-hidden className="ml-auto flex-none text-muted-foreground">{glyph}</span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title={title}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={cn(cls, "w-[calc(100%+2*var(--card-pad))] cursor-pointer")}>
      {inner}
    </button>
  );
}

// The DETAIL tier — a run of facts at the tight gap. 4px, not the old 8px: at an 18px line the
// old gap was 44% air, which is section spacing doing row spacing's job. Sections are separated
// by the `Foot` rule and by `Separator`, so the rows themselves don't need to be.
export function FactGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-1", className)}>{children}</div>;
}

// The FOOT tier — always last in a card, and now a BASE PLATE rather than a run of rows behind a
// hairline (user, 2026-08-10: "the visual difference … is not very clear; I think it's only the
// font — can you do a bit more?"). It wasn't only the font (the rows already dropped to
// micro/label, `foreground-dim` and mono), but the LABEL had gone uppercase + caps-tracked, which
// in this aesthetic reads as a heading — so the label got louder as the value got quieter and the
// tier netted out flat, on the same ground, behind the same hairline every other resting division
// uses. A hairline says "division"; it can't say "different tier".
//
// So the foot changes GROUND. It full-bleeds by the card's own padding to the panel's bottom edge,
// picking the inner radius back up (`--radius` minus the 1px border), and sits on `--panel-plate`
// — see that token for why the fill is a neutral white LIFT and not the dark scrim this shipped as
// for an afternoon. The plate replaces the `Separator` outright: a rule on top of a ground change
// is redundant noise. (A `--wash-faint` tray was tried and rejected — that family is the
// accent/selection lane, so it read as SELECTED, backwards for look-up data. Pushing contrast
// alone was tried too and read as disabled.)
//
// The bottom bleed is a var so the PAGED box still reaches its own bottom edge: RailPager reserves
// a 36px strip on the panel and overrides `--foot-bleed` to the same number, so the plank and its
// hairline (siblings of the panel, painted after it) ride ON the plate instead of below it.
export function Foot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-3 flex flex-col gap-1",
        "-mx-[var(--card-pad)] px-[var(--card-pad)]",
        "-mb-[var(--foot-bleed,var(--card-pad))] pb-[var(--foot-bleed,var(--card-pad))] pt-[11px]",
        "rounded-b-[calc(var(--radius)-1px)] bg-[var(--panel-plate)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

// The ONE copy control for reference values (user, 2026-08-13): hashes and ids are shown
// truncated everywhere (the full value lived only in a hover title), so there was no way to get
// one OUT of the app. A small ghost button that writes the FULL value to the clipboard and
// answers with the check for one calm cycle (~1.2s, the transient-signal tempo). The glyph swap
// is information, so it stays under reduced motion. Quiet at rest — visible only while its ROW
// is hovered or focused (the `group/copy` reveal) — but its slot is always reserved, so nothing
// shifts under the pointer. A touch screen has no hover to reveal it, so a coarse pointer holds it
// at the `always` low ink instead. Monochrome via currentColor; the check takes `--success` (the
// ready lane), never an identity hue.
export function CopyButton({ value, subject, always = false, className }: { value: string; subject: string; /** Present at low ink at rest (the foot rows) rather than revealed on the row's hover. */ always?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Copy ${subject}`}
      title={`Copy ${subject}`}
      className={cn(
        "flex-none size-6 -my-1 rounded-xs text-muted-foreground",
        TOUCH_HIT,
        always ? "opacity-75 group-hover/copy:opacity-100 group-focus-within/copy:opacity-100 focus-visible:opacity-100" : "opacity-0 pointer-coarse:opacity-75 group-hover/copy:opacity-100 group-focus-within/copy:opacity-100 focus-visible:opacity-100",
        copied && "opacity-100 text-[var(--success)] hover:text-[var(--success)]",
        className,
      )}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1200);
          },
          () => {}, // a denied clipboard stays quiet — the hover title still carries the value
        );
      }}
    >
      {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
    </Button>
  );
}

// One foot row. Mono by default because most of what lands here is a hash or an id; the
// bookkeeping numbers (height · subHeight, block counts) pass `mono={false}`. `copy` is the
// FULL untruncated value — when present the row carries the shared CopyButton (revealed on the
// row's own hover/focus via the `group/copy` scope).
export function FootRow({
  label,
  value,
  title,
  mono = true,
  copy,
  copyName,
}: {
  label: string;
  value: ReactNode;
  title?: string;
  mono?: boolean;
  copy?: string;
  /** What the copy control is called ("previous hash") — the visible label is cut short to save
   *  hash characters, and "Copy previous" says too little to a screen reader. */
  copyName?: string;
}) {
  // ONE REGISTER (C1, user 2026-10-02, `docs/superpowers/design/2026-10-02-heading-pin-foot`):
  // the label is a caps PREFIX inside the mono value line — still uppercase, still muted — rather
  // than a sans column beside it, so the foot has one voice. The copy control is ALWAYS PRESENT at
  // low ink (no hidden control), lit on the row's hover, in a column of its own: the hover-only
  // overlay it replaces (with its fade mask) covered the hash's last characters once the glyph
  // stopped disappearing, and the tail is the part that identifies a hash. The labels are short
  // for the same reason — the line is one column now, and every label character is a hash
  // character lost.
  return (
    // min-h-6: the copy control's own 24px, so a row WITHOUT one (a chain position) keeps the
    // same rhythm as the hash rows beside it.
    <div className="group/copy flex items-center gap-2.5 min-h-6" title={title}>
      <span className="inline-flex items-baseline min-w-0 flex-1 font-mono text-label">
        <span className="shrink-0 tracking-caps uppercase text-muted-foreground">{label}</span>
        <span aria-hidden className="shrink-0">&nbsp;&nbsp;</span>
        <span className={cn("min-w-0 truncate text-foreground-dim tabular-nums", !mono && "font-sans")}>{value}</span>
      </span>
      {/* The control takes its own 24px column: always present, so there is nothing to overlay and
          no tail to cover — the value's `truncate` is the only thing that can shorten it, and the
          callers' middle-cut budgets are sized so it does not. */}
      {copy && <CopyButton value={copy} subject={copyName ?? label.toLowerCase()} always className="my-0" />}
    </div>
  );
}

// A node's roles, falling back to its primary layer when the role list is absent.
export const rolesOf = (n: NodeInfo) => (n.roles && n.roles.length ? n.roles : [n.layer!]);

// The ONE identity dot every row list leads with (the filter picker's rows, the geo explorer's
// node rows): a plain small disc in the subject's identity hue — flat fill, NO glow (the geo
// rows' old `shadow-[0_0_5px_currentColor]` halo read much brighter than the picker's dots;
// user-unified to the picker's exact treatment).
export function IdentityDot({ hue, className }: { hue: string; className?: string }) {
  // `className` overrides the SIZE only — the mark, its shape and its hue source stay this
  // component's (the shared identity dot, rule 3 + the design system's one-dot rule). The vitals
  // roster uses it to enlarge the committed network's dot; nothing else should reach for it
  // without a reason of the same kind.
  return <span className={cn("w-2 h-2 rounded-full flex-none", className)} style={{ background: hue }} aria-hidden />;
}

/** The Yes/No FACT mark (user, 2026-08-16 — "yes has a checkmark, so for no add a x"): Yes
 *  takes the check, No an ✕, BOTH at soft tints — the status pill's own discipline ("even the
 *  green stays un-dominant"); a raw `--success` glyph read stronger than anything else on the
 *  card. One component so the two Yes/No rows (Full archive, Delegated staking) can't drift.
 *
 *  ⚠️ THE MARK CARRIES THE EMPHASIS; THE WORD STAYS IN THE VALUE REGISTER (user, 2026-09-14:
 *  "'full archive' shouldn't be bold because all other values aren't either"). Both rows used to
 *  bold their Yes/No — and the n/a beside it — which made two facts shout on a card where every
 *  other value, the measured "none" included, is plain. The check and the ✕ already say which
 *  answer this is, at the soft tints above; a bold word on top of them is the same claim twice. */
export function BoolMark({ on }: { on: boolean }) {
  return on ? (
    <Check aria-hidden className="size-3" style={{ color: "color-mix(in oklch, var(--success) 72%, transparent)" }} />
  ) : (
    <X aria-hidden className="size-3 text-muted-foreground/70" />
  );
}

// The ONE status pill chrome (user, 2026-07-12 — unified: ready used to render as plain bold
// green text while every other state got a pill, which read as an inconsistency next to the
// dossier's breakdown). Quiet by construction: the state's bucket colour at soft tint alphas
// (border 0x55, fill 0x1a), never a solid block — so even the green stays un-dominant.
function StatusPill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="text-label font-semibold px-2 py-px rounded-full border"
      // color-mix (not hex-append) so the alpha composes on ANY colour format — the bucket
      // colours are `var(--token)` now (see BUCKET_COLOR): border ~0x55, fill ~0x1a.
      style={{
        color,
        borderColor: `color-mix(in oklch, ${color} 33%, transparent)`,
        background: `color-mix(in oklch, ${color} 10%, transparent)`,
      }}
    >
      {children}
    </Badge>
  );
}

// Single node status — one pill in its bucket colour, labelled with the exact stage (no
// ready special case). Colour = bucket (lane-clean), text = exact state.
export function StatusMark({ state }: { state?: string | null }) {
  const s = nodeStatus(state);
  return <StatusPill color={s.color}>{s.label}</StatusPill>;
}

// Rolled-up status for a node group (dossier): the non-zero buckets as one small TABLE, the
// composition table's own row grammar (see the placement note inside). Row derivation lives in
// `statusItems` (src/data/nodeStatus.ts), shared with the vitals band's Node status cell; the
// bucket colour rides the BAR only, never the word or the count. It went pills → stacked inline
// counts → rows over three passes; the pill form has no consumer left, so it is gone rather than
// kept as a dead branch.
/** Row-leading capital for a lifecycle word — the labels beside it in the make-up table are
 *  proper nouns of a sort ("Hybrid", "Data"), so a bare lowercase state broke the column. */
export const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);





// Squared layer-code pills — the ONE rendering for layer codes wherever they appear (the
// node card's subtitle, the dossier's composition rows). User, 2026-07-12: the joined
// "L0·cL1" text read as one mushy token; separate squared pills scan as discrete units.
// Taxonomy chrome, not identity — muted text on the faint wash, never hued.
/** A signer group's `who` phrase ("L0 validators") with the layer code as the square pill —
 *  the composition chips' own vocabulary (user, 2026-08-16). ONE renderer so every surface
 *  showing the phrase (the explorer's depth caption, the snapshot cards' Signed-by rows) draws
 *  it the same way; `title=` strings keep the plain one-home text, since a tooltip can't hold a
 *  chip. Parses the code out of SIGNER_GROUPS' string rather than hardcoding a second copy. */
export function LayerWho({ who }: { who: string }) {
  const [code, ...rest] = who.split(" ");
  return (
    <span className="inline-flex items-center gap-1">
      <RoleChips codes={[code]} />
      <span>{rest.join(" ")}</span>
    </span>
  );
}

export function RoleChips({ codes, compact, tight }: { codes: string[]; compact?: boolean; tight?: boolean }) {
  return (
    // `tight` — the explorer row's tag home (2026-09-26): three chips have ~80px there, so the
    // pills close up by a pixel each side and the gap drops to 3px. Same pill, same vocabulary.
    <span className={cn("inline-flex items-center", tight ? "gap-[3px]" : "gap-1")}>
      {codes.map((c) => (
        <span
          key={c}
          // `compact` — the vitals band's fixed-height rows (user, 2026-09-09: three full-height
          // pills consumed the card's whole 48px column and the rows read as one fused block;
          // 2px less pill is what buys justify-evenly its air). Same pill, same vocabulary —
          // only the vertical padding narrows; every roomier surface keeps the full form.
          className={cn(
            "inline-flex items-center rounded-xs border border-border bg-wash-faint text-label leading-none text-muted-foreground",
            tight ? "px-1" : "px-[5px]",
            compact ? "py-px" : "py-[2px]",
          )}
        >
          {c}
        </span>
      ))}
    </span>
  );
}


// One pass over a metagraph's nodes → the facts every card needs to describe it.
// (Was computed twice — once for the meta card's rows, once for the meta-node blurb.)
export interface Composition {
  present: string[]; // role keys present, in ROLE_ORDER
  hybrid: number; // nodes running more than one layer
  dedBy: Record<string, number>; // dedicated-node count per role
  parts: string[]; // e.g. ["3 hybrid", "19 dedicated dL1"]
  total: number;
  hasCurrency: boolean; // runs a currency-L1 cluster → has a real token
}
export function nodeComposition(nodes: NodeInfo[]): Composition {
  const present = ROLE_ORDER.filter((r) => nodes.some((n) => rolesOf(n).includes(r)));
  const hybrid = nodes.filter((n) => rolesOf(n).length > 1).length;
  const dedBy: Record<string, number> = {};
  for (const n of nodes) {
    const r = rolesOf(n);
    if (r.length === 1) dedBy[r[0]!] = (dedBy[r[0]!] || 0) + 1;
  }
  const parts = (hybrid ? [`${hybrid} hybrid`] : []).concat(
    present.filter((r) => dedBy[r]).map((r) => `${dedBy[r]} dedicated ${ROLE_SHORT[r]}`),
  );
  const total = hybrid + Object.values(dedBy).reduce((a, b) => a + b, 0);
  return { present, hybrid, dedBy, parts, total, hasCurrency: present.includes("cl1") };
}

// The network-type descriptor for the dossier ticker row (subtle, behind the ticker) — derived
// from the SAME composition read as the old "data metagraph · no token" body line (reused, not
// re-derived): a metagraph is a "data"/"currency"/"data and currency" metagraph by whether it
// runs dL1/cL1 nodes; the DAG core is the one exception ("hypergraph", not a metagraph at all).
// The STRUCTURED type read (2026-08-31) — networkKind's prose derives from this, and any
// classifier (the vitals donut's buckets) branches on THESE values, never on the display
// sentence: a copy edit to the prose must not silently reclassify every metagraph.
export type MetaType = "hypergraph" | "unknown" | "data" | "currency" | "data + currency";
export function metaType(id: string, nodes: NodeInfo[]): MetaType {
  if (id === "dag") return "hypergraph";
  // With zero locatable nodes the roles are unknown — claiming a type would be a guess.
  if (nodes.length === 0) return "unknown";
  const { present, hasCurrency } = nodeComposition(nodes);
  const hasData = present.includes("dl1");
  return hasCurrency && hasData ? "data + currency" : hasCurrency ? "currency" : "data";
}
export function networkKind(id: string, nodes: NodeInfo[]): string {
  const t = metaType(id, nodes);
  if (t === "hypergraph") return "hypergraph";
  if (t === "unknown") return "metagraph";
  if (t === "data + currency") return "data and currency metagraph";
  return `${t} metagraph`;
}

// Long description with a 3-line clamp + "Show more" (replaces ui.js _descHTML + the delegated
// toggle; here it's just local state). Clamp-worthiness is decided SYNCHRONOUSLY from text
// length (no post-paint measurement), so the control always renders in the same frame as the
// card — the only "Show more appears late" case left is a data swap: on a cold boot the dossier
// shows the short `cfg.blurb` (~110 chars, genuinely un-clampable) until `/api/metagraphs`
// delivers the long `description`, and the button rightly arrives WITH that longer text.
// Kept custom over shadcn Collapsible (evaluated): Collapsible's model is hidden-when-closed,
// ours is always-visible-but-clamped — forceMount + data-state clamp overrides would invert the
// primitive into a bare state container, so local state + aria-expanded is the smaller truth.
// Keyed on `text` by the caller (MetaCard) so `open` resets when the subject changes.
export function Desc({ text }: { text?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  // THE LEAD, CLAMPED TO TWO LINES (the card skeleton, user 2026-10-02): the description is what
  // the dossier says first, and four lines of it pushed the breakdown off the top of the card.
  if (text.length <= 100) return <p className="text-body leading-snug text-foreground-dim mb-0">{text}</p>;
  return (
    <>
      <p className={cn("text-body leading-snug text-foreground-dim mb-0", open ? "line-clamp-none" : "line-clamp-2")}>
        {text}
      </p>
      <Button
        type="button"
        variant="link"
        size="xs"
        className="inline-block h-auto mt-0.5 mb-0 p-0 text-label font-semibold"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Show less" : "Show more"}
      </Button>
    </>
  );
}

// THE STACKED SCHEDULE (design session 2026-09-26, `dossier-breakdown.html` A): a partition of ONE
// total as one bar cut into its parts, the axis word to its left in the Fact register and the
// parts named beneath it with their counts. The dossier's three partitions of the fleet —
// composition, status, archive depth — used to be three captioned tables under hairlines, which
// read as three sections rather than three cuts of the same 19 nodes; three of these say "the
// same total, three ways" at half the height. A zero-count part draws no segment (rule 10) and is
// named muted in the legend, so an absent kind is still stated; the chips and depth tags a table
// row carried ride each part's `title`.
export interface SchedulePart {
  label: string;
  count: number;
  color: string;
  title?: string;
}

/** A hue stepped down for the i-th part of a partition drawn in one colour (composition in the
 *  network's hue, archive depth in the neutral): full, then softer with each part. */
export function partShade(hue: string, i: number): string {
  const pct = Math.max(30, 100 - i * 30);
  return pct === 100 ? hue : `color-mix(in oklch, ${hue} ${pct}%, transparent)`;
}

/** Above this many nodes in a cut the squares stop being countable, so a row draws a proportional
 *  bar instead. The largest fleet is ~30 after the planned reduction, so in practice every cut is
 *  squares; the bar is the honest fallback for a census total in the hundreds (rule 10: a wall of
 *  two hundred squares is a texture, not a count). */
const UNIT_MAX = 60;

/** RIGHT-ALIGNED, AGAINST ITS FIGURE (user, 2026-10-02: "should we right-align the coloured boxes as
 *  well, so they sit against the numbers?"): a mark and its count are one reading, so three squares
 *  sit beside their "3" rather than a column's width away. Marks still share one edge — the right
 *  one — so their lengths compare as before.
 *
 *  A ROW'S MARK in the breakdown table: one square per countable thing, or a bar when the thing
 *  is a rate/size or the cut is too large to count (`units` false). `frac` is the bar's length,
 *  0..1 — a share of the total, or of the largest row where rows are compared rather than summed. */
export function UnitMarks({ count, color, units, frac }: { count: number; color: string; units: boolean; frac: number }) {
  return (
    <span aria-hidden className="min-w-0 pt-[0.42em]">
      {units ? (
        <span className="flex flex-wrap content-start justify-end gap-[1.5px]">
          {Array.from({ length: count }, (_, k) => (
            <span key={k} className="block size-1.5 rounded-[1.5px]" style={{ background: color }} />
          ))}
        </span>
      ) : (
        frac > 0 && (
          <span className="block h-[5px] w-full">
            <span className={cn("block h-full ml-auto rounded-full min-w-[2px]", BAR_EASE)} style={{ width: `${Math.min(1, frac) * 100}%`, background: color }} />
          </span>
        )
      )}
    </span>
  );
}

/** Whether a cut of this size draws squares (countable) or bars. */
export const countable = (total: number) => total <= UNIT_MAX;

/** THE BREAKDOWN TABLE'S ROW GRID WITHOUT AN AXIS COLUMN — name · figure · mark. For a card with ONE
 *  cut, whose section label already names it (`visuals.html`, user 2026-10-02): the global
 *  snapshot's anchored rows, the Moment's readings, a provider's and a country's networks. Rows
 *  that are their own controls (an accordion trigger, a hover-paired button) wear this class
 *  themselves, so every card's names, figures and marks sit in the same three columns. */
// MARK BEFORE FIGURE (user, 2026-10-02: "should we right-align the number and put the visual in
// front?"): name · mark · count, the count on the card's right edge — the fact rows' own grammar
// (label left, value right) and the explorer rows' order (name, bar, figure).
// THE FIGURE COLUMN IS AS WIDE AS ITS WIDEST FIGURE, no wider (user, 2026-10-02: "quite some space
// between"): a fixed column right-aligned a "3" a dozen pixels from its squares. `--cut-fig` is set
// by whoever draws the rows, in `ch` of the mono figure (`figWidth`), so the marks end one small
// gap before the number on every row and still share one right edge.
export const CUT_ROW = "grid grid-cols-[8.6em_minmax(0,1fr)_var(--cut-fig,2.6em)] items-start gap-x-1.5 text-label";
/** The `--cut-fig` style for a set of figures as they will be printed. */
export const figWidth = (figures: readonly (string | number)[]): CSSProperties =>
  ({ ["--cut-fig" as string]: `${Math.max(1, ...figures.map((f) => String(f).length)) + 0.6}ch` }) as CSSProperties;

/** ONE CUT OF A TOTAL, AS TABLE ROWS (user, 2026-10-02 — `docs/superpowers/design/2026-10-02-right-
 *  rail-cards/breakdown-2.html`, D2: "what bothers me most is that the legend has those dots in it
 *  and takes a lot of space; can it be solved with tables?").
 *
 *  Every part is a row — name, count, then ITS OWN SQUARES, one per node. The squares are the bar
 *  and the colour key at once, so there is no legend: it replaced a stacked bar with a wrapping
 *  dot-legend beneath it. The cut's name sits in the first column across its rows; consecutive
 *  cuts share the same column template (stated in `em`, so it rides the fluid label step) and are
 *  divided by a hairline, which makes the three cuts read as one table. A zero part is a plain
 *  muted row with no squares (it draws nothing, and is still named). Without an `axis` the table
 *  is the three-column `CUT_ROW` form. */
export function ScheduleTable({ axis, axisTitle, parts, className }: { axis?: string; axisTitle?: string; parts: SchedulePart[]; className?: string }) {
  const total = parts.reduce((n, p) => n + p.count, 0);
  const units = countable(total);
  return (
    <div
      className={cn(
        axis != null
          ? "grid grid-cols-[6.9em_7.4em_minmax(0,1fr)_var(--cut-fig,2.4em)] items-start gap-x-1.5 gap-y-0.5 py-1.5 text-label border-t border-border first:border-t-0"
          : cn(CUT_ROW, "gap-y-0.5"),
        className,
      )}
      style={figWidth(parts.map((p) => p.count))}
    >
      {axis != null && (
        <span className="text-muted-foreground" title={axisTitle} style={{ gridRow: `span ${Math.max(1, parts.length)}` }}>
          {axis}
        </span>
      )}
      {parts.map((p, i) => (
        <Fragment key={i}>
          <span className={cn("min-w-0 truncate", p.count > 0 ? "text-foreground-dim" : "text-muted-foreground")} title={p.title ?? p.label}>
            {p.label}
          </span>
          <UnitMarks count={p.count} color={p.color} units={units} frac={p.count / Math.max(1, total)} />
          <span className={cn("font-mono tabular-nums text-right", p.count > 0 ? "text-foreground" : "text-muted-foreground")}>{p.count}</span>
        </Fragment>
      ))}
    </div>
  );
}
