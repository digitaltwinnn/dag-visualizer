"use client";

import { useEffect, useState } from "react";

import { VIEWS } from "@/components/views";
import { METRIC_LABELS } from "@/src/data/trendSeries";
import { ZOOMS } from "@/src/data/trendWindow";
import { displayNetwork } from "@/src/data/unlisted";
import { motionHint, type HintNames } from "@/src/engine/domain/motionHint";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { useStore } from "@/src/store/store";

// THE MOTION HINT (user, 2026-09-26): one quiet sentence, centred under the command bar, for
// exactly as long as the scene is moving — "Bringing Dor Technologies to the front", "Building
// History", "Narrowing to USDC.dag". Two store channels and nothing else: `sceneMoving` (the
// Engine's per-frame answer, from the structures that drive motion) says WHETHER, `motionCause`
// (stamped by the gesture's owner) says WHY, and `domain/motionHint.ts` turns the cause into words.
//
// It fades in after a beat (150ms) so a same-pose NUDGE — 0.55s, and deliberately not a "change
// you can see" — never flashes a sentence, and out the frame the motion ends. The LAST sentence is
// kept through the fade-out, so the words never change under the reader while they vanish. It sits
// where the History view's measure title used to (`--rail-top` + `--topbar-extra`, the rails' own
// tokens), pointer-inert, and only in a view with a canvas: a flat page has no scene to move.

const NAMES: HintNames = {
  view: (m) => VIEWS.find((v) => v.id === m)?.name ?? m,
  network: (id) => displayNetwork(id)?.name ?? id,
  country: (cc) => {
    try {
      return new Intl.DisplayNames(undefined, { type: "region" }).of(cc) ?? cc;
    } catch {
      return cc;
    }
  },
  window: (id) => ZOOMS.find((z) => z.id === id)?.label ?? id,
  measure: (id) => METRIC_LABELS[id],
};

export default function MotionHint() {
  const mode = useStore((s) => s.mode);
  const moving = useStore((s) => s.sceneMoving);
  const cause = useStore((s) => s.motionCause);
  const text = cause ? motionHint(cause, mode, NAMES) : null;
  // The sentence shown — held through the fade-out (see the header).
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (moving && text) setShown(text);
  }, [moving, text]);
  if (!VIEW_POLICIES[mode].canvas) return null;
  const on = moving && text != null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-on={on ? "1" : "0"}
      style={{ top: "calc(var(--rail-top) + var(--topbar-extra))" }}
      className="absolute left-1/2 -translate-x-1/2 z-[5] pointer-events-none select-none whitespace-nowrap text-label text-muted-foreground opacity-0 transition-opacity duration-200 data-[on='1']:opacity-100 data-[on='1']:delay-150 motion-reduce:!transition-none"
    >
      {on ? shown : ""}
    </div>
  );
}
