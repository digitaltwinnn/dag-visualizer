"use client";

// Section 2 (spec 2026-08-01): the per-view raw-data table. Task 6 lands the real tables;
// until then every view shows the honest not-built state (no fabricated rows).
export default function DataSection() {
  return (
    <div className="h-full flex">
      <p className="m-auto text-label text-muted-foreground uppercase tracking-caps">
        data table · in development
      </p>
    </div>
  );
}
