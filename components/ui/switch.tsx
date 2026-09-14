"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// The adopted shadcn/Radix SWITCH — the app's one on/off control (2026-09-14, the trends scale
// setting). It is the right primitive for a BINARY SETTING that is read as a state: a label says
// what the thing is, the switch says whether it is on. That is a different question from the
// pressed-toggle grammar the command bar uses (Scene⇄HUD, RAW), where the control names an ACTION
// the reader is pressing FOR and the wash reports it — keep that distinction when reaching here.
//
// ⚠️ RESTATED IN THIS APP'S TOKENS, like `calendar.tsx` before it. The upstream file paints every
// surface twice — once for the light lane and once behind `dark:` — and this app has no `dark`
// variant: its lanes are `light-dark()` INSIDE the tokens, switched by `data-theme` on the root
// (src/theme/CLAUDE.md). A `dark:` arm here would key on the OS preference instead, so a reader
// on an OS-dark machine reading the app in light would get the dark half. Every colour below is
// therefore one token that already answers both faces.
//
// The size is the app's, not the stock 1.15rem: this rides beside `text-micro` labels, so the
// track matches the pill row's own height. `--tempo-beat`-scale motion is not wanted — a setting
// flips, it does not animate — so the thumb keeps the primitive's short transform transition and
// reduced motion drops it.
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-[2px]",
        "transition-colors duration-150 motion-reduce:transition-none outline-none",
        // Off is the app's hairline surface; on is the structural accent, which is what every
        // other "this is live / this is on" signal in the HUD wears (rule 3).
        "data-[state=unchecked]:bg-[var(--border)] data-[state=checked]:bg-[var(--primary)]",
        "focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-3 rounded-full bg-[var(--switch-knob)] shadow-sm ring-0",
          "transition-transform duration-150 motion-reduce:transition-none",
          "data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
