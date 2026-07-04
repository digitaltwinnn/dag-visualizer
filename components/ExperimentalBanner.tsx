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
        "py-[5px] px-4 bg-[var(--panel)] border-b border-b-[rgba(255,209,102,0.22)]",
        "backdrop-blur-[14px] text-[11.5px] leading-[1.3] whitespace-nowrap overflow-hidden pointer-events-none",
        "max-[700px]:px-3 max-[700px]:py-[5px] max-[700px]:gap-1.5 max-[700px]:text-[10.5px]",
      )}
    >
      <span aria-hidden className="text-[#ffd166] text-[11px] opacity-85 flex-none">△</span>
      <span
        className={cn(
          "text-[#ffd166] text-[10.5px] font-bold tracking-[0.13em] uppercase flex-none",
          "max-[700px]:text-[9.5px]",
        )}
      >
        Experimental
      </span>
      <span
        className={cn(
          "text-muted-foreground text-[11.5px] tracking-[0.01em] min-w-0 overflow-hidden text-ellipsis",
          "max-[700px]:text-[10px]",
        )}
      >
        unofficial community project — not affiliated with the official Constellation Network
      </span>
    </div>
  );
}
