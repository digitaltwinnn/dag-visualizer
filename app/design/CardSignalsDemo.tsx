"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CardHead, { RIGHT_CARD } from "@/components/CardHead";
import { PulseEdge } from "@/components/EdgePulse";
import { cn } from "@/lib/utils";

// /design demo for the card signal system (EdgePulse.tsx + the unlayered recipes in globals.css):
// rest / pointer-hover / hover-paired / update-pulse, for both rails. THE MODEL: cards are
// SPINELESS AT REST (the resting identity cue is each rail's RailThread), and the edge is PURELY
// TRANSIENT — it lights only for the three signals; there is no steady/selected state. The three
// signals form a strict HIERARCHY on the SCENE-FACING edge (a left-rail card signals on its RIGHT
// edge `.sig-right`, a right-rail card on its LEFT `.sig-left`):
//   1. pointer hover  → a FAINT NEUTRAL grey line (`--thread-line`), thin, no glow  ← quietest
//   2. hover pairing  → the subject's identity HUE + inset wash (brighter, with glow)
//   3. update pulse   → a bright segment SWEEPING down the edge (fade-in → travel → fade-out)
// The "pointer hover" card demonstrates level 1 LIVE — hover it and its scene-facing edge fades in
// the grey whisper (there is no static class; it's a real `:hover`). The pulse button drives
// `PulseEdge` directly with a local counter — the app's cards derive it from their subject via
// `useEdgePulse(subjectKey)`.
function DemoCard({
  rail,
  state,
  pulseKey,
}: {
  rail: "left" | "right";
  state: "rest" | "hover" | "paired";
  pulseKey: number;
}) {
  const labels = { rest: "Rest", hover: "Pointer hover", paired: "Hover-paired" };
  const facing = rail === "left" ? "right" : "left";
  return (
    <Card
      className={cn(
        "block relative p-[14px] text-sm text-muted-foreground",
        rail === "right" && `${RIGHT_CARD} p-[14px]`,
        rail === "right" ? "sig-left" : "sig-right",
        state === "paired" && "subject-paired",
      )}
      style={state === "paired" ? ({ ["--row-hue"]: "var(--success)" } as React.CSSProperties) : undefined}
    >
      <CardHead eyebrow={`${rail} rail · ${labels[state]}`} />
      <div className="text-xs">
        {state === "rest" && "Edge dark — the rail thread carries the resting identity; only the three signals light it."}
        {state === "hover" && `Hover me: the scene-facing (${facing}) edge fades in a faint neutral grey line — the quietest signal, no glow.`}
        {state === "paired" && `While hovered: the scene-facing (${facing}) edge lights in the identity hue + glows; the inset wash is the supporting cue. Pairing WINS over the grey whisper.`}
      </div>
      <PulseEdge pulseKey={pulseKey} rail={rail} />
    </Card>
  );
}

export default function CardSignalsDemo() {
  const [pulseKey, setPulseKey] = useState(0);
  return (
    <div className="max-w-3xl">
      <div className="mb-3">
        <Button variant="ghost" size="xs" className="border border-border" onClick={() => setPulseKey((k) => k + 1)}>
          ▸ trigger update pulse
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
        <DemoCard rail="left" state="rest" pulseKey={pulseKey} />
        <DemoCard rail="left" state="hover" pulseKey={pulseKey} />
        <DemoCard rail="left" state="paired" pulseKey={pulseKey} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DemoCard rail="right" state="rest" pulseKey={pulseKey} />
        <DemoCard rail="right" state="hover" pulseKey={pulseKey} />
        <DemoCard rail="right" state="paired" pulseKey={pulseKey} />
      </div>
    </div>
  );
}
