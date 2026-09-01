"use client";

import { useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// THE ORDINAL JUMP — the raw layer's "take me to snapshot N" (user, 2026-09-01: "in particular
// useful in metagraph view, I want to be able to lookup a specific global/metagraph snapshot").
//
// ⚠️ IT IS A JUMP, NOT A FILTER, and the difference is the whole reason this control exists in this
// shape. A text filter over the loaded rows was the obvious reading of the request and is the wrong
// one here: under a committed network the log pages that network's ENTIRE chain server-side, 25 rows
// at a time, so a filter would search the 25 rows on screen and silently report "no match" for a
// snapshot that exists three thousand pages back. Ordinals are sequential and gapless, which is
// exactly what makes the honest answer cheap — the page holding ordinal X is arithmetic, so the
// jump is one request deep no matter how far back it reaches. (The same property already powers the
// pager's «/» genesis jumps; this is that mechanism with a destination typed in.)
//
// NO STOCK INPUT. `components/ui/` carries adopted shadcn primitives, but this is one narrow numeric
// field inside a data table, and the house rule is that bespoke elements are the product rather than
// stock-component defaults. It takes the panel's own plate, focus ring and type scale.
export default function OrdinalJump({
  label,
  hint,
  max,
  miss,
  onJump,
  onClear,
}: {
  /** What an ordinal MEANS here — the table says what it pages, so the control needn't guess. */
  label: string;
  /** Placeholder copy: the honest range, or the window's own limit. */
  hint: string;
  /** Highest addressable ordinal, or 0 when the walk has no arithmetic base yet. */
  max: number;
  /** Set by the caller when a jump found nothing — stated here rather than swallowed (rule 10). */
  miss: string | null;
  onJump: (ordinal: number) => void;
  onClear: () => void;
}) {
  const [raw, setRaw] = useState("");
  // ⚠️ CLEARED FROM THE EVENT, NEVER FROM AN EFFECT ON `raw`. An effect firing on `raw === ""` also
  // fires on MOUNT, so every remount of this control silently wiped the caller's landing mark — and
  // this control does remount, because the table swaps to a loading state while a jumped-to page is
  // fetched. Clearing where the user actually clears the field has no mount edge at all.
  const change = (v: string) => {
    setRaw(v);
    if (v === "") onClear();
  };

  const n = Number(raw.replace(/[^\d]/g, ""));
  const ok = raw !== "" && Number.isFinite(n) && n >= 1 && (max === 0 || n <= max);
  const submit = () => { if (ok) onJump(n); };

  return (
    <div className="flex-none flex items-center gap-2 pb-2">
      <label className="flex items-center gap-1.5 min-w-0">
        <Search aria-hidden className="size-3.5 text-muted-foreground flex-none" />
        <span className="sr-only">{label}</span>
        <input
          type="text"
          inputMode="numeric"
          value={raw}
          placeholder={hint}
          aria-label={label}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          className={cn(
            "w-[190px] rounded-xs bg-[var(--panel-plate)] border border-border/60 px-2 py-1",
            "font-mono text-caption tabular-nums text-foreground placeholder:text-muted-foreground placeholder:font-sans",
            "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:border-transparent",
          )}
        />
      </label>
      {/* The affordance is the KEY, not a button: the field is one value and Enter is what a reader
          already presses. Shown only once the value could actually go somewhere. */}
      {ok && (
        <span className="inline-flex items-center gap-1 text-micro text-muted-foreground">
          <CornerDownLeft aria-hidden className="size-3" /> jump
        </span>
      )}
      {/* An out-of-range value is stated BEFORE the reader presses Enter — the range is known, so
          letting them submit into a refusal would be a worse version of the same message. */}
      {!ok && raw !== "" && max > 0 && (
        <span className="text-micro text-muted-foreground">1–{max.toLocaleString()}</span>
      )}
      {miss && <span className="text-micro text-muted-foreground">{miss}</span>}
    </div>
  );
}
