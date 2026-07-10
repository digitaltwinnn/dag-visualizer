"use client";

// Route-level error boundary, themed to the instrument (Next.js MCP finding on the v16 upgrade:
// the route tree ran on the BUILT-IN boundaries only, so a render crash showed the stock white
// page — jarring against the dark HUD). Renders inside the root layout (globals.css applies).
//
// Deliberately DEPENDENCY-LIGHT: no store, no engine, no state atoms — if rendering crashed,
// this must still render. The no-signal mark is inlined (same recipe as StateAtoms.NoSignalDot)
// rather than imported, so a crash inside components/ can't take the boundary down with it.
// `reset()` re-renders the segment; the reload button is the hard fallback (the 3D engine holds
// module-level state a soft reset can't rebuild).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background text-foreground">
      <span
        aria-hidden
        className="w-[7px] h-[7px] rounded-full flex-none bg-destructive shadow-[0_0_0_3px_color-mix(in_oklch,var(--destructive)_22%,transparent)] animate-breathe motion-reduce:animate-none"
      />
      <div className="flex flex-col items-center gap-1 text-center px-6">
        <p className="m-0 text-title font-semibold">The view crashed</p>
        <p className="m-0 text-label text-muted-foreground max-w-[42ch]">
          Something went wrong while rendering. The network itself is fine — this is a client-side
          fault{error.digest ? <span className="font-mono tabular-nums"> · {error.digest}</span> : null}.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="text-body text-foreground bg-transparent border border-border rounded-btn px-3.5 py-1.5 cursor-pointer hover:bg-wash-hover transition-[background] duration-150"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-body text-muted-foreground bg-transparent border border-transparent rounded-btn px-3.5 py-1.5 cursor-pointer hover:bg-wash-hover hover:text-foreground transition-[background,color] duration-150"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
