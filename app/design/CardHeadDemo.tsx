"use client";

// The CardHead demo cards live in a Client Component because CardHead's `icon` prop is a lucide
// COMPONENT (a function), and a function can't be passed from a Server Component (the /design page)
// across the client boundary. Matches the OdometerDemo / CardSignalsDemo pattern on this page.
import { Card } from "@/components/ui/card";
import CardHead from "@/components/CardHead";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ABOUT_ICON, EXPLORE_ICON } from "@/components/icons";

export default function CardHeadDemo() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl">
      <Card asChild className="block p-0">
        <div>
          <CardHead panel icon={ABOUT_ICON} eyebrow="Hypergraph · about" title="Glass card" />
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
          <CardHead panel icon={EXPLORE_ICON} eyebrow="Spine override" title="Signal colour" />
          <div className="py-[var(--panel-pad-y)] px-[var(--panel-pad-x)] text-sm text-muted-foreground">
            Signal states read <code className="font-mono">--spine</code>; identity panels point
            it at <code className="font-mono">--mg</code>. Here it is success-green, shown in the
            hover-paired state on the scene-facing edge.
          </div>
        </div>
      </Card>
    </div>
  );
}
