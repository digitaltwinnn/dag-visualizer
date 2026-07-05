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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  NodeStars,
  NoSignalDot,
  SonarRing,
  StandbyHalo,
} from "@/components/state/StateAtoms";
import OdometerDemo from "./OdometerDemo";
import CardSignalsDemo from "./CardSignalsDemo";
import EcgMark from "@/components/topbar/EcgMark";
import { cn } from "@/lib/utils";

// ── Structural lane — the shadcn oklch variables (globals.css :root). One source of truth.
// `--panel` is the lone structural literal (translucent glass fill, no shadcn equivalent). ──
const STRUCTURAL: { name: string; var: string }[] = [
  { name: "background", var: "--background" },
  { name: "foreground", var: "--foreground" },
  { name: "muted-foreground", var: "--muted-foreground" },
  { name: "foreground-dim (2nd muted tone)", var: "--foreground-dim" },
  { name: "primary / accent (live cyan)", var: "--primary" },
  { name: "destructive (warn / no-signal)", var: "--destructive" },
  { name: "warn-soft (banner amber)", var: "--warn-soft" },
  { name: "success (ready)", var: "--success" },
  { name: "core-l0 (blue)", var: "--core-l0" },
  { name: "core-l1 (violet)", var: "--core-l1" },
  { name: "panel (glass fill)", var: "--panel" },
  { name: "panel-light (dock glass)", var: "--panel-light" },
  { name: "wash-soft (accent fill)", var: "--wash-soft" },
];

// ── HUD type scale — the four steps every HUD text site snaps to (globals.css @theme). ──
const TYPE_SCALE: { cls: string; px: string; role: string }[] = [
  { cls: "text-micro", px: "10.5px", role: "uppercase eyebrows / tags / axis labels + tiny glyphs" },
  { cls: "text-label", px: "11.5px", role: "secondary / meta — counts, codes, subtitles, hints" },
  { cls: "text-body", px: "12.5px", role: "rows, descriptions, values" },
  { cls: "text-title", px: "15px", role: "card titles" },
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
        Tailwind import, the structural token lane, keyframes, and a handful of{" "}
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
          Card — <code className="font-mono">components/ui/card.tsx</code> + <code className="font-mono">CardHead</code>
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          The design-system <code className="font-mono">Card</code> baseline is the app&apos;s card frame:
          the <code className="font-mono">.ig-panel</code> glass recipe is baked into its base class, and
          an idiomatic <code className="font-mono">asChild</code>{" "}
          (radix <code className="font-mono">Slot</code>) lets each rail card render as{" "}
          <code className="font-mono">&lt;Card asChild&gt;&lt;aside&gt;</code> to keep its{" "}
          <code className="font-mono">complementary</code> a11y role. Every rail card leads with the one
          shared <code className="font-mono">CardHead</code>. Cards are SPINELESS AT REST — the frame&apos;s
          edge element only lights as a signal (see Card signals below), coloured by{" "}
          <code className="font-mono">--spine</code> (structural cyan by default; identity panels point it
          at their hue). Rail cards override the Card&apos;s default padding so today&apos;s spacing is
          preserved.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl">
          <Card asChild className="block p-0">
            <div>
              <CardHead panel eyebrow="Hypergraph · about" title="Glass card" />
              <div className="py-[var(--panel-pad-y)] px-[var(--panel-pad-x)] text-sm text-muted-foreground">
                Spineless at rest — the rail thread carries identity.
                <Separator className="my-3" />
                <div className="flex flex-wrap gap-2">
                  <Badge>default</Badge>
                  <Badge variant="secondary">secondary</Badge>
                  <Badge variant="destructive">down</Badge>
                  <Badge variant="outline">outline</Badge>
                </div>
              </div>
            </div>
          </Card>
          <Card asChild className="block p-0 [--spine:var(--success)] sig-right subject-paired">
            <div>
              <CardHead panel eyebrow="Spine override" title="Signal colour" />
              <div className="py-[var(--panel-pad-y)] px-[var(--panel-pad-x)] text-sm text-muted-foreground">
                Signal states read <code className="font-mono">--spine</code>; identity panels point
                it at <code className="font-mono">--mg</code>. Here it is success-green, shown in the
                hover-paired state on the scene-facing edge.
              </div>
            </div>
          </Card>
        </div>
        <Card className={`${RIGHT_CARD} mt-4 max-w-2xl text-sm text-muted-foreground`}>
          <code className="font-mono">RIGHT_CARD</code> — the ONE inspector-rail Card composition
          (passed as <code className="font-mono">&lt;Card asChild className=&#123;RIGHT_CARD&#125;&gt;</code>):
          the per-card spine SUPPRESSED (<code className="font-mono">--spine: transparent</code>),
          pointer-events re-enabled (<code className="font-mono">#rightcol</code> is{" "}
          <code className="font-mono">pointer-events:none</code> so gaps click through to the scene),
          and the original right-card interior restored — a flat{" "}
          <code className="font-mono">18px</code> pad + <code className="font-mono">flex-none</code> so an
          overflowing rail scrolls instead of a card overlapping the one beneath it. The right rail&apos;s
          identity cue is RailThread&apos;s spine in the margin, not a per-card one.
        </Card>
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Card signals — <code className="font-mono">components/EdgePulse.tsx</code>
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          <strong>Thread = resting identity cue; card edge = PURELY TRANSIENT signal channel.</strong>{" "}
          Cards are SPINELESS AT REST everywhere — the resting identity colour lives in the two
          rails&apos; <code className="font-mono">RailThread</code>s (identity-hued spine + node dots,
          mirrored left/right). A card&apos;s edge lights ONLY during two signals, always on its
          SCENE-FACING edge (left-rail cards → right edge, <code className="font-mono">.sig-right</code>;
          right-rail cards → left edge, <code className="font-mono">.sig-left</code>) — no
          steady/selected state ever. (a) A subject change fires{" "}
          <code className="font-mono">useEdgePulse(subjectKey)</code>: the edge line fades in softly, a
          bright gradient-tipped segment (3px, soft glow) sweeps down it, and the edge fades back out
          (~1.2s total, debounced, synchronized with the title&apos;s{" "}
          <code className="font-mono">roll-in</code>; reduced motion → one static soft blink, no sweep).
          (b) Hover pairing (<code className="font-mono">.subject-paired</code>) lights the edge while
          hovered (the inset wash is the supporting cue). Inside tablet/phone sheets even the pairing
          edge is suppressed (<code className="font-mono">.sheet-cards</code>) — the sheet&apos;s own
          edge is the one identity cue; the pulse still plays on the card.
        </p>
        <CardSignalsDemo />
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Button — <code className="font-mono">components/ui/button.tsx</code>
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          The design-system <code className="font-mono">Button</code> baseline. The app currently adopts
          it only for the small text/icon controls that map cleanly onto a variant with today&apos;s exact
          look (hover fills overridden away, a subtle focus-visible ring kept): the card{" "}
          <code className="font-mono">×</code> close + <code className="font-mono">+/–</code> collapse
          (CardHead, <code className="font-mono">ghost / icon-xs</code>), and Desc&apos;s
          &ldquo;Show more&rdquo; link (<code className="font-mono">link / xs</code>).
          <br />
          <span className="text-muted-foreground/80">
            Deliberately NOT Buttons (bespoke instrument controls): LiveStrip bars, the country/node
            accordion rows, the rail edge-tabs, the phone-dock halves, the view-switch (ToggleGroup),
            and the filter-bar button. That boundary is the documented convention.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost">ghost</Button>
          <Button variant="link">link</Button>
          <Button variant="ghost" size="xs">ghost · xs</Button>
          <Button variant="link" size="xs">link · xs</Button>
          <Button variant="ghost" size="icon-xs" title="collapse">–</Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="close"
            className="size-auto py-0.5 px-2 text-[22px] leading-none text-muted-foreground hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent"
          >
            ×
          </Button>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          HUD type scale
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          Four steps every HUD text site snaps to (globals.css <code className="font-mono">@theme</code>{" "}
          <code className="font-mono">--text-*</code>). Tokens first — an arbitrary{" "}
          <code className="font-mono">text-[..px]</code> is only acceptable for a true one-off (e.g. a
          control glyph), documented inline. <code className="font-mono">text-micro</code> is for
          uppercase eyebrows/tags/axis + glyphs, never readable body copy.
        </p>
        <div className="flex flex-col gap-3">
          {TYPE_SCALE.map((t) => (
            <div key={t.cls} className="ig-panel p-3 flex items-baseline gap-4">
              <span className={cn(t.cls, "text-foreground font-semibold w-40 flex-none")}>
                Settlement chamber
              </span>
              <code className="font-mono text-xs text-primary flex-none">{t.cls}</code>
              <span className="font-mono text-xs text-muted-foreground flex-none">{t.px}</span>
              <span className="text-xs text-muted-foreground">{t.role}</span>
            </div>
          ))}
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
                  <span className="w-2 h-2 rounded-full flex-none" style={{ background: m.hue?.oklch ?? "var(--muted-foreground)" }} />
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
          (heartbeat), <code className="font-mono">.ls-bar-anim</code> (LiveStrip bars), and the{" "}
          <code className="font-mono">--axis-hairlines</code> / <code className="font-mono">--thread-*</code>{" "}
          instrument-thread ruler shared by the rails and the bar-chart axis.
          <br />
          <span className="text-muted-foreground/80">
            One recipe sits deliberately OUTSIDE any layer:{" "}
            <code className="font-mono">.subject-paired</code> (the scene↔card hover pairing) is
            UNLAYERED on purpose — inside <code className="font-mono">@layer components</code> it would
            lose to Tailwind&apos;s utilities layer (the rows&apos;{" "}
            <code className="font-mono">bg-transparent</code>/<code className="font-mono">border-transparent</code>)
            and to the later <code className="font-mono">.ig-panel</code> shadow; unlayered CSS beats
            every layer at equal specificity (see the layer-trap note in{" "}
            <code className="font-mono">globals.css</code>).
          </span>
        </p>
      </section>
    </main>
  );
}
