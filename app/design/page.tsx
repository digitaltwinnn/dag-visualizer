import { headers } from "next/headers";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import CardHead, { RIGHT_CARD } from "@/components/CardHead";
import {
  NodeStars,
  NoSignalDot,
  SonarRing,
  StandbyHalo,
} from "@/components/state/StateAtoms";
import OdometerDemo from "./OdometerDemo";
import EcgMark from "@/components/topbar/EcgMark";

// ── Structural lane — the shadcn oklch variables (globals.css :root). One source of truth. ──
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

// ── Legacy alias lane — names carried over from the pre-migration stylesheet, kept as ALIASES
// onto the structural lane (globals.css) so existing consumers work without a repo-wide rename.
// The swatch reads through the alias, so it must match its target exactly. --panel is the lone
// literal (no shadcn equivalent). ──
const LEGACY: { alias: string; maps: string }[] = [
  { alias: "--core", maps: "--primary" },
  { alias: "--text", maps: "--foreground" },
  { alias: "--muted", maps: "--muted-foreground" },
  { alias: "--panel-border", maps: "--border" },
  { alias: "--l0", maps: "--core-l0" },
  { alias: "--panel", maps: "literal glass fill" },
];

export default async function DesignPage() {
  // Same-origin base derived from the incoming request, not an env var — on a Vercel
  // PREVIEW deployment, VERCEL_PROJECT_PRODUCTION_URL points at the PRODUCTION domain,
  // which would make /design read production's palette instead of this deployment's.
  // /design is already a dynamic route, so headers() is safe to await here.
  const h = await headers();
  const host = h.get("host");
  const proto = host?.startsWith("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;
  let metas: { id: string; symbol: string; hue?: { deg: number; oklch: string; hex: string } }[] = [];
  try {
    const r = await fetch(`${origin}/api/metagraphs`, { cache: "no-store" });
    metas = (await r.json()).metagraphs ?? [];
  } catch {
    metas = [];
  }

  return (
    <main className="min-h-screen bg-background text-foreground p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Instrument-Glass styleguide</h1>
      <p className="text-muted-foreground mb-8">
        Live tokens + the primitives the app actually renders — the screenshot-verified design
        reference. Styling is one stylesheet (<code className="font-mono">app/globals.css</code>):
        Tailwind import, the two token lanes, keyframes, and a handful of{" "}
        <code className="font-mono">@layer components</code> recipes.
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

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Legacy alias lane
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          Names carried over from the retired <code className="font-mono">app/styles/00-base.css</code>.
          Each aliases the structural lane above (single source of truth) so existing consumers keep
          working without a repo-wide rename — a future sweep can drop them.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {LEGACY.map((t) => (
            <div key={t.alias} className="ig-panel p-3">
              <div
                className="h-10 rounded-md mb-2"
                style={{ background: `var(${t.alias})` }}
              />
              <div className="text-xs font-mono">{t.alias}</div>
              <div className="text-[10px] font-mono text-muted-foreground">→ {t.maps}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Glass frame — <code className="font-mono">.ig-panel</code> + <code className="font-mono">CardHead</code>
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          Every rail card is the <code className="font-mono">.ig-panel</code> recipe (translucent
          glass + a left accent spine) headed by the one shared{" "}
          <code className="font-mono">CardHead</code>. The spine is structural cyan by default; identity
          panels point <code className="font-mono">--spine</code> at their hue.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl">
          <div className="ig-panel">
            <CardHead panel eyebrow="Hypergraph · about" title="Glass card" />
            <div className="py-[var(--panel-pad-y)] px-[var(--panel-pad-x)] text-sm text-muted-foreground">
              Default structural-cyan spine.
              <Separator className="my-3" />
              <div className="flex flex-wrap gap-2">
                <Badge>default</Badge>
                <Badge variant="secondary">secondary</Badge>
                <Badge variant="destructive">down</Badge>
                <Badge variant="outline">outline</Badge>
              </div>
            </div>
          </div>
          <div className="ig-panel" style={{ ["--spine" as string]: "var(--success)" }}>
            <CardHead panel eyebrow="Spine override" title="Identity spine" />
            <div className="py-[var(--panel-pad-y)] px-[var(--panel-pad-x)] text-sm text-muted-foreground">
              The accent spine reads <code className="font-mono">--spine</code>; identity panels point
              it at <code className="font-mono">--mg</code>. Here it is success-green.
            </div>
          </div>
        </div>
        <div className={`${RIGHT_CARD} mt-4 max-w-2xl p-4 text-sm text-muted-foreground`}>
          <code className="font-mono">RIGHT_CARD</code> — the inspector-rail frame:{" "}
          <code className="font-mono">.ig-panel</code> with the per-card spine SUPPRESSED
          (<code className="font-mono">--spine: transparent</code>) and pointer-events re-enabled,
          since <code className="font-mono">#rightcol</code> is <code className="font-mono">pointer-events:none</code> so
          gaps click through to the scene. The right rail&apos;s identity cue is RailThread&apos;s spine
          in the margin, not a per-card one.
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Identity lane — live generated hues
        </h2>
        {metas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No metagraph data (API unreachable).</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {metas.map((m) => (
              <div key={m.id} className="ig-panel p-3" style={{ ["--spine" as string]: m.hue?.oklch }}>
                <div className="h-10 rounded-md mb-2" style={{ background: m.hue?.oklch }} />
                <div className="text-xs font-mono">{m.symbol}</div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {m.hue ? `${m.hue.deg}°` : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Command-bar primitives
        </h2>
        <div className="flex flex-wrap items-center gap-6">
          <span className="flex items-center gap-2">
            <EcgMark />
            <span className="font-semibold tracking-tight">
              <span className="text-foreground">DAG</span>{" "}
              <span className="text-muted-foreground">Visualizer</span>
            </span>
          </span>
          <ToggleGroup type="single" defaultValue="a" variant="outline">
            <ToggleGroupItem value="a">◆</ToggleGroupItem>
            <ToggleGroupItem value="b">◍</ToggleGroupItem>
            <ToggleGroupItem value="c">▦</ToggleGroupItem>
          </ToggleGroup>
          <Avatar className="size-8">
            <AvatarFallback>DED</AvatarFallback>
          </Avatar>
          <OdometerDemo />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Filter picker — <code className="font-mono">Command</code>
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          The top-bar filter picker is the shadcn <code className="font-mono">Command</code>{" "}
          primitive (cmdk) in an <code className="font-mono">.ig-panel</code>, with the shared slim{" "}
          <code className="font-mono">.cmd-list-scroll</code> scrollbar. Each row carries an identity
          dot in the metagraph&apos;s hue.
        </p>
        <Command className="ig-panel max-w-[360px] bg-transparent">
          <CommandInput placeholder="Search metagraphs…" />
          <CommandList className="cmd-list-scroll max-h-[200px]">
            <CommandEmpty>No metagraph found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="all whole network" className="gap-2">
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: "var(--primary)" }} />
                <span className="text-[13px] text-foreground">All</span>
                <span className="text-[11px] text-muted-foreground ml-auto">whole network</span>
              </CommandItem>
              {metas.slice(0, 4).map((m) => (
                <CommandItem key={m.id} value={m.symbol} className="gap-2">
                  <span className="w-2 h-2 rounded-full flex-none" style={{ background: m.hue?.oklch ?? "var(--muted)" }} />
                  <span className="text-[13px] text-foreground">{m.symbol}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          State atoms — <code className="font-mono">components/state/StateAtoms.tsx</code>
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          Empty/loading states built from the app&apos;s own marks so an absent feed reads as part of
          the instrument. Motion lives in the <code className="font-mono">--animate-st-*</code> theme
          vars (globals.css), each paired with <code className="font-mono">motion-reduce:</code> at the
          call site.
        </p>
        <div className="flex flex-wrap items-center gap-8">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <NodeStars /> acquiring
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <NoSignalDot /> no signal (dot)
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <SonarRing /> no signal (sonar)
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <StandbyHalo /> standby
          </span>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Overlays &amp; recipes
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Not shown inline (they need runtime interaction / breakpoints): the{" "}
          <code className="font-mono">Sheet</code> primitive backs the tablet/phone rail docks
          (<code className="font-mono">RailDock.tsx</code>), decorated with the{" "}
          <code className="font-mono">.ig-sheet-edge</code> / <code className="font-mono">.ig-sheet-topruler</code>{" "}
          instrument rulers. Other bespoke recipes in <code className="font-mono">@layer components</code>:{" "}
          <code className="font-mono">.odometer</code> (numeric roll), <code className="font-mono">.ecg</code>{" "}
          (heartbeat), <code className="font-mono">.ls-bar-anim</code> (LiveStrip bars),{" "}
          <code className="font-mono">.subject-paired</code> (hover pairing), and the{" "}
          <code className="font-mono">--axis-hairlines</code> / <code className="font-mono">--thread-*</code>{" "}
          instrument-thread ruler shared by the rails and the bar-chart axis.
        </p>
      </section>
    </main>
  );
}
