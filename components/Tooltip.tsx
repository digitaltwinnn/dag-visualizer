"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { midHash } from "@/src/util/format";
import { NODE_ID_GLYPHS } from "@/components/explorer/nodeRow";
import { SCENE_GLASS } from "@/components/selection";
import { TickerChip } from "@/components/inspector/parts";
import { SceneMark, type SceneMarkSpec } from "@/components/SceneMark";
import { iconForPick } from "@/components/icons";
import { metagraphById } from "@/src/data/network";
import type { HoverSubject } from "@/src/data/hoverSubject";

// The country's display name: the one its nodes carry (what the country card is titled with),
// else the platform's English name for the code.
const countryName = (cc: string, known: string | undefined): string => {
  if (known) return known;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? cc;
  } catch {
    return cc;
  }
};

// Lean hover tooltip — a LABEL, not a mini-card: `‹mark› ‹name› ‹ticker›`. Facts
// live in the card that opens on click. Content comes from the store (engine raycast, set only
// when the target changes); position is written straight to the DOM from the pointer so following
// the cursor never triggers a React render.
//
// ONE FAMILY with the subject callout (user, 2026-08-15 — "align the hover and the click card"):
// both are scene-anchored HUD glass, so this wears the shared SCENE_GLASS container and the same
// row grammar — primary name, then the hued ticker as the identity aside. The hue-tinted BORDER
// is gone with that: identity never tints a frame anywhere else in the HUD, and it was the one
// thing making the tooltip read as a different species from the callout beside it.
export default function Tooltip() {
  const hover = useStore((s) => s.hover);
  const metaList = useStore((s) => s.metaList);
  const selNodes = useStore((s) => s.selNodes);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mm = (e: PointerEvent) => {
      const el = ref.current;
      if (el) {
        el.style.left = e.clientX + "px";
        el.style.top = e.clientY + "px";
      }
    };
    window.addEventListener("pointermove", mm);
    return () => window.removeEventListener("pointermove", mm);
  }, []);

  if (!hover) return null;
  // A node's id is cut the way its callout, its card and its explorer row cut it (2026-10-03) —
  // the hover used its own shortening at a smaller size, so one node read as two strings.
  const name = hover.mono ? midHash(hover.name, NODE_ID_GLYPHS) : hover.name;
  // THE HOVER CARD IS THE NAME OF THE THING, WITH ITS MARK (user, 2026-10-03 — all three of
  // `docs/superpowers/design/2026-10-03-hover-cards`). It wears the mark its subject's card
  // wears, in the hovered object's own colour; a country is named where only its border lit; and
  // "click to inspect" is gone — it rode every hover, and the pointer already turns into a hand.
  const label =
    hover.kind === "country"
      ? countryName(hover.name, selNodes.map((r) => ("geo" in r.pick ? r.pick.geo : undefined)).find((g) => g?.cc === hover.name)?.country)
      : name;
  const mark = markOf(hover, metaList.find((m) => m.id === hover.netId)?.iconUrl);
  return (
    <div
      id="tooltip"
      ref={ref}
      className={cn(
        "fixed z-30 pointer-events-none flex items-baseline gap-[7px] whitespace-nowrap -translate-x-1/2 -translate-y-[140%]",
        SCENE_GLASS,
      )}
    >
      <span className="self-center inline-flex">
        <SceneMark mark={mark} />
      </span>
      <span className={cn("text-body font-semibold text-foreground", hover.mono && "font-mono tabular-nums")}>{label}</span>
      {/* The ticker beside a name is the one chip (`TickerChip`) — hover and commit are one species. */}
      {hover.ident && <TickerChip text={hover.ident} hue={hover.color} className="self-center" />}
    </div>
  );
}

// ⚠️ THE MARK TAKES THE HOVERED OBJECT'S OWN COLOUR, never the filter's (user, 2026-10-03: "hover
// should take the color from the object it hovers"). A card head tints its kind mark with the
// filter because the card is read inside the filter's scope; a hover is about the one thing under
// the pointer, and with Dor filtered a global snapshot's cube came out orange — Dor's colour on
// something that is not Dor's. `color` is the subject's own: a network's hue, the unlisted
// neutral, or the structural accent for what belongs to no network (a global snapshot, a
// country, the DAG core).
function markOf(h: HoverSubject, liveLogo: string | undefined): SceneMarkSpec {
  switch (h.kind) {
    case "network":
      return { logo: liveLogo || (h.netId ? metagraphById(h.netId)?.iconUrl : undefined), monogram: h.ident || h.name, hue: h.color };
    case "node":
      return { icon: iconForPick("metanode"), hue: h.color };
    case "metaSnap":
      return { icon: iconForPick("metaSnap"), hue: h.color };
    case "country":
      return { icon: iconForPick("country"), hue: h.color };
    case "snapshot":
    default:
      return { icon: iconForPick("snapshot"), hue: h.color };
  }
}
