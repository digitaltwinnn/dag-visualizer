const STRUCTURAL: { name: string; var: string }[] = [
  { name: "background", var: "--background" },
  { name: "foreground", var: "--foreground" },
  { name: "muted-foreground", var: "--muted-foreground" },
  { name: "primary / accent (live cyan)", var: "--primary" },
  { name: "destructive (warn)", var: "--destructive" },
  { name: "success (ready)", var: "--success" },
  { name: "core-l0 (blue)", var: "--core-l0" },
  { name: "core-l1 (violet)", var: "--core-l1" },
];

export default function DesignPage() {
  return (
    <main className="min-h-screen bg-background text-foreground p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Instrument-Glass styleguide</h1>
      <p className="text-muted-foreground mb-8">
        Live tokens + primitives — the screenshot-verified design reference.
      </p>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Structural lane
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STRUCTURAL.map((t) => (
            <div key={t.var} className="ig-panel p-3">
              <div
                className="h-10 rounded-md mb-2"
                style={{ background: `var(${t.var})` }}
              />
              <div className="text-xs font-mono text-muted-foreground">{t.name}</div>
              <div className="text-xs font-mono">{t.var}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
