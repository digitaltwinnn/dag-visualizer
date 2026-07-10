import Link from "next/link";

// Themed 404 (same Next.js MCP finding as app/error.tsx — the built-in page was a stock white
// screen against the dark HUD). Server component; quiet instrument styling, one way home.
export default function NotFound() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background text-foreground">
      <span aria-hidden className="text-micro tracking-caps uppercase text-muted-foreground">404 · no signal on this route</span>
      <div className="flex flex-col items-center gap-1 text-center px-6">
        <p className="m-0 text-title font-semibold">Nothing here</p>
        <p className="m-0 text-label text-muted-foreground max-w-[42ch]">
          This path isn&apos;t part of the visualizer.
        </p>
      </div>
      <Link
        href="/"
        className="text-body text-foreground bg-transparent border border-border rounded-btn px-3.5 py-1.5 no-underline hover:bg-wash-hover transition-[background] duration-150"
      >
        Back to the network
      </Link>
    </div>
  );
}
