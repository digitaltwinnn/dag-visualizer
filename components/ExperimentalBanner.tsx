import { cn } from "@/lib/utils";

// A quiet notice that the app is a work in progress — pinned at the very top, above the command
// bar. Static + presentational; no state. Full disclaimer stays visible (honesty); restrained
// Instrument-Glass ribbon, restrained amber accent.
export default function ExperimentalBanner() {
  return (
    <div
      id="experimental-banner"
      role="note"
      className={cn(
        "fixed inset-x-0 top-0 z-[13] flex items-baseline justify-center gap-[7px]",
        "py-[5px] px-4 bg-[var(--panel)] border-b border-b-[color-mix(in_oklch,var(--warn-soft)_22%,transparent)]",
        "backdrop-blur-[14px] text-label whitespace-nowrap overflow-hidden pointer-events-none",
        "max-[700px]:px-3 max-[700px]:py-[5px] max-[700px]:gap-1.5",
      )}
    >
      <span aria-hidden className="text-warn-soft text-label opacity-85 flex-none">△</span>
      <span className="text-warn-soft text-micro font-bold tracking-caps uppercase flex-none">
        Experimental
      </span>
      <span className="text-muted-foreground text-label tracking-[0.02em] min-w-0 overflow-hidden text-ellipsis">
        unofficial community project — not affiliated with the official Constellation Network
      </span>
    </div>
  );
}
