"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CardHead, { RIGHT_CARD } from "@/components/CardHead";
import { PulseEdge } from "@/components/EdgePulse";
import { cn } from "@/lib/utils";

// /design demo for the card signal system (EdgePulse.tsx + the unlayered recipes in globals.css):
// rest / hover-paired / selected / update-pulse, for both rails. THE MODEL: cards are SPINELESS
// AT REST (the resting identity cue is each rail's RailThread); a card's edge lights only as a
// SIGNAL, and every signal renders on the SCENE-FACING edge — a left-rail card signals on its
// RIGHT edge (`.sig-right`), a right-rail card on its LEFT (`.sig-left`). The pulse button drives
// `PulseEdge` directly with a local counter — the app's cards derive it from their subject via
// `useEdgePulse(subjectKey)`.
function DemoCard({
  rail,
  state,
  pulseKey,
}: {
  rail: "left" | "right";
  state: "rest" | "paired" | "selected";
  pulseKey: number;
}) {
  const labels = { rest: "Rest", paired: "Hover-paired", selected: "Selected" };
  return (
    <Card
      className={cn(
        "block relative p-[14px] text-sm text-muted-foreground",
        rail === "right" && `${RIGHT_CARD} p-[14px]`,
        rail === "right" ? "sig-left" : "sig-right",
        state === "paired" && "subject-paired",
        state === "selected" && "card-selected",
      )}
      style={state === "paired" ? ({ ["--row-hue"]: "var(--success)" } as React.CSSProperties) : undefined}
    >
      <CardHead eyebrow={`${rail} rail · ${labels[state]}`} />
      <div className="text-xs">
        {state === "rest" && "Spineless — the rail thread carries the resting identity."}
        {state === "paired" && `Scene-facing (${rail === "left" ? "right" : "left"}) edge bright + glow; the inset wash is the supporting cue.`}
        {state === "selected" && `Steady-bright scene-facing (${rail === "left" ? "right" : "left"}) edge — the active selection.`}
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
        <DemoCard rail="left" state="paired" pulseKey={pulseKey} />
        <DemoCard rail="left" state="selected" pulseKey={pulseKey} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DemoCard rail="right" state="rest" pulseKey={pulseKey} />
        <DemoCard rail="right" state="paired" pulseKey={pulseKey} />
        <DemoCard rail="right" state="selected" pulseKey={pulseKey} />
      </div>
    </div>
  );
}
